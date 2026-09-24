import 'server-only';

// DESHACER un lote de «Asignar a varios» / «Añadir al grupo»: cada atleta vuelve a
// estar EXACTAMENTE como antes — lo nuevo se quita y lo que el lote cortó o
// modificó (con «Sustituir») se repone con sus mismos ids.
//
// Lo hecho no se borra nunca: si el atleta ya completó, hizo a medias o saltó un
// entreno del programa nuevo, ese atleta NO se deshace (se dice por qué) y todo
// lo suyo se queda como está. Cada atleta en su transacción, con el candado de su
// plan. Deshacer dos veces no hace nada la segunda.

import type { Sql } from '@/lib/db';
import type { AssignUndoResult } from '@fahybrid/shared/schema/assign-many';
import { captureRouteError } from '@/lib/observability/capture';
import { AssignManyError } from './assign-many-plan';

class UndoRefused extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

/** Una sesión creada por el lote que el atleta ya ha tocado (o que tiene vida propia). */
async function touchedCreated(tx: Sql, itemId: number): Promise<number> {
  const rows = await tx<Array<{ n: number }>>`
    select count(*)::int as n
    from coach_assign_batch_session_changes c
    join workout_assignments wa on wa.id = c.assignment_id
    where c.batch_item_id = ${itemId} and c.change = 'created'
      and (
        wa.status not in ('scheduled', 'missed')
        or exists (select 1 from workout_executions we where we.assignment_id = wa.id)
        or exists (select 1 from dobles_live_status d where d.assignment_id = wa.id)
        or exists (select 1 from wearable_activity_confirmations w where w.assignment_id = wa.id)
      )
  `;
  return rows[0]?.n ?? 0;
}

async function undoItem(tx: Sql, item: { id: number; athlete_id: number; prior_plan_mode: string | null }) {
  const { id: itemId, athlete_id: athleteId } = item;
  await tx`select pg_advisory_xact_lock(hashtext('athlete_plan_mutation'), ${athleteId}::int)`;

  const touched = await touchedCreated(tx, itemId);
  if (touched > 0) {
    throw new UndoRefused(
      'already_trained',
      `Ya ha hecho ${touched} ${touched === 1 ? 'entreno' : 'entrenos'} de este programa: no se deshace para no perder su trabajo. Quítale el resto desde su plan si hace falta.`,
    );
  }

  // 1) Lo creado: sesiones (y las plantillas instanciadas que se queden huérfanas).
  const created = await tx<Array<{ id: string; template_id: string }>>`
    delete from workout_assignments wa
    using coach_assign_batch_session_changes c
    where c.batch_item_id = ${itemId} and c.change = 'created' and wa.id = c.assignment_id
    returning wa.id::text, wa.template_id::text
  `;
  // Las que el motor re-apuntó a una instancia nueva: se anota esa instancia antes de reponerlas.
  const swapped = await tx<Array<{ template_id: string }>>`
    select wa.template_id::text from workout_assignments wa
    join coach_assign_batch_session_changes c on c.assignment_id = wa.id
    where c.batch_item_id = ${itemId} and c.change = 'modified'
  `;

  // 2) Lo creado: recibo y microciclos nuevos (si se han quedado vacíos).
  await tx`
    delete from athlete_month_assignments ama
    using coach_assign_batch_receipt_changes c
    where c.batch_item_id = ${itemId} and c.change = 'created' and ama.id = c.month_assignment_id
  `;
  await tx`
    delete from microcycles mc
    using coach_assign_batch_microcycle_changes c
    where c.batch_item_id = ${itemId} and c.change = 'created' and mc.id = c.microcycle_id
      and not exists (select 1 from workout_assignments wa where wa.microcycle_id = mc.id)
      and not exists (select 1 from athlete_month_assignments ama where mc.id = any(ama.microcycle_ids))
  `;
  await tx`
    update microcycles mc set source_week_template_id = c.prior_source_week_template_id
    from coach_assign_batch_microcycle_changes c
    where c.batch_item_id = ${itemId} and c.change = 'relinked' and mc.id = c.microcycle_id
  `;

  // 3) Lo cortado: recibos (mismo id) y sesiones (mismo id, misma fila).
  try {
    await tx`
      update athlete_month_assignments ama
      set end_date = c.end_date, microcycle_ids = c.microcycle_ids, assignment_count = c.assignment_count
      from coach_assign_batch_receipt_changes c
      where c.batch_item_id = ${itemId} and c.change = 'trimmed' and ama.id = c.month_assignment_id
    `;
    await tx`
      insert into athlete_month_assignments (
        id, athlete_id, month_template_id, start_date, end_date, microcycle_ids, assignment_count,
        created_by_coach_id, created_at
      ) overriding system value
      select c.month_assignment_id, c.athlete_id, c.month_template_id, c.start_date, c.end_date,
             c.microcycle_ids, c.assignment_count, c.created_by_coach_id, c.created_at
      from coach_assign_batch_receipt_changes c
      where c.batch_item_id = ${itemId} and c.change = 'deleted'
        and not exists (select 1 from athlete_month_assignments x where x.id = c.month_assignment_id)
    `;
  } catch (err) {
    if ((err as { code?: string }).code === '23P01') {
      throw new UndoRefused(
        'plan_changed',
        'Desde entonces tiene otro plan en esas fechas: no se puede devolver el que tenía. Revísalo en su plan.',
      );
    }
    throw err;
  }
  await tx`
    update workout_assignments wa
    set template_id = c.template_id, template_version = c.template_version, updated_at = now()
    from coach_assign_batch_session_changes c
    where c.batch_item_id = ${itemId} and c.change = 'modified' and wa.id = c.assignment_id
  `;
  await tx`
    insert into workout_assignments (
      id, athlete_id, microcycle_id, scheduled_for, template_id, template_version, status, notes, origin,
      planned_sequence, partner_visibility, station_assignment, injury_id, injury_adaptation,
      calibration_test_id, created_by_user_id, created_by_kind, last_edited_by_user_id,
      last_edited_by_kind, created_at
    ) overriding system value
    select c.assignment_id, c.athlete_id, c.microcycle_id, c.scheduled_for, c.template_id, c.template_version,
           c.status::assignment_status, c.notes, c.origin::workout_origin, c.planned_sequence,
           coalesce(c.partner_visibility, 'shared'), c.station_assignment, c.injury_id, c.injury_adaptation,
           c.calibration_test_id, c.created_by_user_id, c.created_by_kind::actor_kind,
           c.last_edited_by_user_id, c.last_edited_by_kind::actor_kind, coalesce(c.created_at, now())
    from coach_assign_batch_session_changes c
    where c.batch_item_id = ${itemId} and c.change = 'removed'
      and not exists (select 1 from workout_assignments x where x.id = c.assignment_id)
  `;

  // 4) Plantillas instanciadas que ya nadie usa (las del programa quitado).
  const orphanCandidates = [...created.map((r) => Number(r.template_id)), ...swapped.map((r) => Number(r.template_id))];
  if (orphanCandidates.length > 0) {
    await tx`
      delete from templates t
      where t.id = any(${orphanCandidates}::bigint[]) and t.instance_athlete_id = ${athleteId}
        and not exists (select 1 from workout_assignments wa where wa.template_id = t.id)
        and not exists (select 1 from coach_assign_batch_session_changes c where c.template_id = t.id)
    `;
  }

  // 5) Visibilidad de sus semanas, como estaba. Sin fila antes: se borra la fila
  //    (o, si desde entonces lleva foco, se deja publicada — sin fila también se ve).
  await tx`
    delete from weekly_plans wp
    using coach_assign_batch_week_changes c
    where c.batch_item_id = ${itemId} and c.prior_status is null
      and wp.athlete_id = ${athleteId} and wp.week_start = c.week_start and wp.focus is null
  `;
  await tx`
    update weekly_plans wp
    set status = coalesce(c.prior_status, 'published')::weekly_plan_status,
        delivery_mode = coalesce(c.prior_delivery_mode, wp.delivery_mode), updated_at = now()
    from coach_assign_batch_week_changes c
    where c.batch_item_id = ${itemId} and wp.athlete_id = ${athleteId} and wp.week_start = c.week_start
  `;

  // 6) Grupo: el cursor nuevo fuera, el anterior de vuelta; y su modo de plan.
  await tx`
    delete from athlete_sequence_progress p
    using coach_assign_batch_cursor_changes c
    where c.batch_item_id = ${itemId} and c.change = 'created' and p.id = c.progress_id
  `;
  await tx`
    update athlete_sequence_progress p set status = c.prior_status, updated_at = now()
    from coach_assign_batch_cursor_changes c
    where c.batch_item_id = ${itemId} and c.change = 'status_changed' and p.id = c.progress_id
  `;
  if (item.prior_plan_mode) {
    await tx`update athletes set plan_mode = ${item.prior_plan_mode} where id = ${athleteId}`;
  }

  await tx`update coach_assign_batch_items set status = 'undone', undone_at = now() where id = ${itemId}`;
}

type ItemRow = { id: string; athlete_id: string; status: string; prior_plan_mode: string | null; reason: string | null };

function resultOf(i: ItemRow, status: 'undone' | 'failed' | 'nothing', reason: string | null) {
  return { athlete_id: i.athlete_id, status, reason };
}

export async function undoAssignBatch(params: {
  coach_id: number | bigint;
  batch_id: number;
  user_id?: number | bigint | null;
  client: Sql;
}): Promise<AssignUndoResult> {
  const { client } = params;
  const coachId = Number(params.coach_id);
  const batch = await client<Array<{ id: string; undone_at: string | null }>>`
    select id::text, undone_at::text from coach_assign_batches
    where id = ${params.batch_id} and coach_id = ${coachId} limit 1
  `;
  if (!batch[0]) {
    throw new AssignManyError('batch_not_found', 'No encuentro esa asignación entre las tuyas.', 404);
  }
  const alreadyUndone = batch[0].undone_at != null;
  const items = await client<ItemRow[]>`
    select id::text, athlete_id::text, status, prior_plan_mode, reason
    from coach_assign_batch_items where batch_id = ${params.batch_id} order by id
  `;

  const results: AssignUndoResult['results'] = [];
  for (const item of items) {
    if (item.status !== 'applied') {
      results.push(resultOf(item, item.status === 'undone' ? 'undone' : 'nothing', item.status === 'undone' ? null : item.reason));
      continue;
    }
    try {
      await client.begin(async (raw) => {
        await undoItem(raw as unknown as Sql, {
          id: Number(item.id),
          athlete_id: Number(item.athlete_id),
          prior_plan_mode: item.prior_plan_mode,
        });
      });
      results.push(resultOf(item, 'undone', null));
    } catch (err) {
      const refused = err instanceof UndoRefused;
      if (!refused) captureRouteError(err, { route: 'lib/coach/assign-many.undo' });
      const reason = refused ? err.message : 'No se pudo deshacer para este atleta por un error interno.';
      await client`update coach_assign_batch_items set reason = ${reason} where id = ${item.id}`;
      results.push({ ...resultOf(item, 'failed', reason) });
    }
  }
  if (!alreadyUndone) {
    await client`
      update coach_assign_batches set undone_at = now(), undone_by_user_id = ${params.user_id == null ? null : Number(params.user_id)}
      where id = ${params.batch_id}
    `;
  }
  return {
    batch_id: String(params.batch_id),
    already_undone: alreadyUndone,
    undone: results.filter((r) => r.status === 'undone').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  };
}
