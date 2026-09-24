import 'server-only';

// ASIGNAR A VARIOS — aplicar a UN atleta, en UNA transacción, apuntando lo que se
// toca para que «Deshacer» devuelva exactamente lo que había.
//
// Pasos (todo o nada por atleta):
//   1. candado del plan del atleta (el mismo que usan los planes personales);
//   2. se vuelve a decidir con su plan recién leído (la previa puede haber
//      envejecido);
//   3. «Sustituir»: se corta lo que estorba — cada sesión quitada se copia antes
//      (solo 'scheduled' sin ejecución ni vivo ni confirmación de reloj: lo hecho
//      NUNCA se toca);
//   4. se materializa con el motor de siempre (`instantiateMonthFromTemplate`),
//      dentro de un SAVEPOINT de esta transacción (ver `nestedClient`);
//   5. se aplica la entrega a sus semanas (visible | draft | auto);
//   6. entrar en un grupo escribe el cursor (`enrollInSequence`).

import type { Sql, TransactionClient } from '@/lib/db';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import type { ExistingReceipt, OnConflict } from '@fahybrid/shared/domain/coach/plan-placement';
import {
  athleteSeesWeek,
  type WeekDelivery,
  type WeekRowState,
} from '@fahybrid/shared/domain/coach/week-publishing';
import {
  instantiateMonthFromTemplate,
  InstantiateProgramError,
} from '@/lib/dashboard/coach/instantiate-program';
import { enrollInSequence } from '@/lib/dashboard/coach/assign-sequence';
import { captureRouteError } from '@/lib/observability/capture';
import { applyDeliveryToWeeks } from './week-publishing';
import { loadReceipts, type PlanTarget, type RecipientInfo } from './assign-many-plan';

/**
 * `instantiateMonthFromTemplate` abre su propia transacción con `client.begin`, y
 * un `tx` de postgres.js no tiene `begin` (solo `savepoint`). Este adaptador le da
 * un `begin` que es un SAVEPOINT de nuestra transacción: así la materialización
 * de un atleta y todo lo demás de ese atleta se confirman o se deshacen juntos.
 */
export function nestedClient(tx: TransactionClient): Sql {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      if (prop === 'begin') {
        return (fn: (sp: TransactionClient) => Promise<unknown>) => target.savepoint(fn);
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as Sql;
}

/** Una sesión que el lote puede quitar: programada, del coach, del programa, sin
 *  nada del atleta encima (ejecución, vivo de dobles, confirmación de reloj). */
export function removableSession(sql: Sql) {
  return sql`
    wa.status = 'scheduled' and wa.origin <> 'self' and wa.notes like 'slot:%'
    and not exists (select 1 from workout_executions we where we.assignment_id = wa.id)
    and not exists (select 1 from dobles_live_status d where d.assignment_id = wa.id)
    and not exists (select 1 from wearable_activity_confirmations w where w.assignment_id = wa.id)
  `;
}

/** Copia filas de `workout_assignments` al registro de cambios del ítem. */
async function copySessions(tx: Sql, itemId: number, change: 'removed' | 'modified', where: ReturnType<Sql>) {
  const rows = await tx<Array<{ id: string }>>`
    insert into coach_assign_batch_session_changes (
      batch_item_id, change, assignment_id, athlete_id, microcycle_id, scheduled_for, template_id,
      template_version, status, notes, origin, planned_sequence, partner_visibility, station_assignment,
      injury_id, injury_adaptation, calibration_test_id, created_by_user_id, created_by_kind,
      last_edited_by_user_id, last_edited_by_kind, created_at
    )
    select ${itemId}, ${change}, wa.id, wa.athlete_id, wa.microcycle_id, wa.scheduled_for, wa.template_id,
           wa.template_version, wa.status::text, wa.notes, wa.origin::text, wa.planned_sequence,
           wa.partner_visibility, wa.station_assignment, wa.injury_id, wa.injury_adaptation,
           wa.calibration_test_id, wa.created_by_user_id, wa.created_by_kind::text,
           wa.last_edited_by_user_id, wa.last_edited_by_kind::text, wa.created_at
    from workout_assignments wa
    where ${where}
    returning assignment_id::text as id
  `;
  return rows.map((r) => Number(r.id));
}

/**
 * «Sustituir»: cada recibo que estorba se corta la víspera de `start` (o se quita
 * entero si empezaba ese día o después). Sus sesiones desde `start` que se pueden
 * quitar se copian y se borran; las hechas se quedan donde están.
 */
async function cutReceipts(tx: Sql, itemId: number, athleteId: number, conflicts: ExistingReceipt[], start: string) {
  const eve = isoDateString(addDays(parseIsoDate(start), -1));
  for (const c of conflicts) {
    const rows = await tx<Array<{ microcycle_ids: Array<string | bigint>; start_date: string }>>`
      select microcycle_ids, to_char(start_date, 'YYYY-MM-DD') as start_date
      from athlete_month_assignments where id = ${c.id} and athlete_id = ${athleteId} for update
    `;
    const receipt = rows[0];
    if (!receipt) continue;
    const whole = receipt.start_date >= start;
    const microIds = receipt.microcycle_ids.map(Number);
    await tx`
      insert into coach_assign_batch_receipt_changes (
        batch_item_id, change, month_assignment_id, athlete_id, month_template_id, start_date, end_date,
        microcycle_ids, assignment_count, created_by_coach_id, created_at
      )
      select ${itemId}, ${whole ? 'deleted' : 'trimmed'}, id, athlete_id, month_template_id, start_date, end_date,
             microcycle_ids, assignment_count, created_by_coach_id, created_at
      from athlete_month_assignments where id = ${c.id}
    `;
    const removed = await copySessions(
      tx,
      itemId,
      'removed',
      tx`wa.athlete_id = ${athleteId} and wa.microcycle_id = any(${microIds}::bigint[])
          and wa.scheduled_for >= ${start}::date and ${removableSession(tx)}`,
    );
    if (removed.length > 0) await tx`delete from workout_assignments where id = any(${removed}::bigint[])`;
    if (whole) {
      await tx`delete from athlete_month_assignments where id = ${c.id}`;
    } else {
      await tx`
        update athlete_month_assignments
        set end_date = ${eve}::date,
            microcycle_ids = coalesce((
              select array_agg(m.id order by m.start_date) from microcycles m
              where m.id = any(athlete_month_assignments.microcycle_ids) and m.start_date < ${start}::date
            ), '{}'),
            assignment_count = greatest(0, assignment_count - ${removed.length})
        where id = ${c.id}
      `;
    }
  }
}

function weekStarts(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = parseIsoDate(start); isoDateString(d) <= end; d = addDays(d, 7)) out.push(isoDateString(d));
  return out;
}

function sameRow(a: WeekRowState | null, b: WeekRowState | null): boolean {
  return (a?.status ?? null) === (b?.status ?? null) && (a?.delivery_mode ?? null) === (b?.delivery_mode ?? null);
}

/** Materializa el programa en su ventana y apunta sesiones y microciclos tocados. */
async function materializeWithLog(
  tx: Sql,
  params: { itemId: number; coachId: number; athleteId: number; target: PlanTarget },
): Promise<{ month_assignment_id: number; created: number }> {
  const { itemId, coachId, athleteId, target } = params;
  const start = target.start_date!;
  const end = target.end_date!;
  // Lo que ya había: la ventana del programa y TODA su calibración. Con el primer
  // plan, el motor inyecta la batería del coach (`scheduleWeek1Calibration`) también
  // FUERA de la ventana — la semana cero antes del lunes y los re-tests de semanas
  // posteriores al final —, y eso también es del lote: si no se apunta, «Deshacer»
  // deja tests sueltos en un atleta que ya no tiene plan.
  const preIds = (
    await tx<Array<{ id: string }>>`
      select id::text from workout_assignments
      where athlete_id = ${athleteId}
        and (scheduled_for between ${start}::date and ${end}::date or calibration_test_id is not null)
    `
  ).map((r) => Number(r.id));
  // Lo que el motor puede reemplazar o podar en la ventana: copia de antes.
  await copySessions(
    tx,
    itemId,
    'modified',
    tx`wa.athlete_id = ${athleteId} and wa.scheduled_for between ${start}::date and ${end}::date
        and wa.status = 'scheduled' and wa.notes like 'slot:%'`,
  );
  const preMicro = await tx<Array<{ id: string; src: string | null }>>`
    select id::text, source_week_template_id::text as src from microcycles
    where athlete_id = ${athleteId} and start_date <= ${end}::date and end_date >= ${start}::date
  `;

  const mat = await (tx as unknown as TransactionClient).savepoint((sp) =>
    instantiateMonthFromTemplate({
      coach_id: coachId,
      athlete_id: athleteId,
      month_template_id: target.program!.id,
      start_date: start,
      start_week_number: target.start_week ?? 1,
      client: nestedClient(sp),
    }),
  );

  // Copias de antes: las que el motor quitó pasan a 'removed'; las que no tocó, fuera.
  await tx`
    update coach_assign_batch_session_changes c set change = 'removed'
    where c.batch_item_id = ${itemId} and c.change = 'modified'
      and not exists (select 1 from workout_assignments wa where wa.id = c.assignment_id)
  `;
  await tx`
    delete from coach_assign_batch_session_changes c
    where c.batch_item_id = ${itemId} and c.change = 'modified'
      and exists (
        select 1 from workout_assignments wa
        where wa.id = c.assignment_id and wa.template_id = c.template_id
          and wa.template_version = c.template_version
      )
  `;
  const created = await tx<Array<{ id: string }>>`
    insert into coach_assign_batch_session_changes (batch_item_id, change, assignment_id)
    select ${itemId}, 'created', wa.id from workout_assignments wa
    where wa.athlete_id = ${athleteId}
      and (wa.scheduled_for between ${start}::date and ${end}::date or wa.calibration_test_id is not null)
      and wa.id <> all(${preIds}::bigint[]) and wa.origin <> 'self'
    returning assignment_id::text as id
  `;
  const preMicroIds = preMicro.map((m) => Number(m.id));
  for (const m of preMicro) {
    await tx`
      insert into coach_assign_batch_microcycle_changes (batch_item_id, change, microcycle_id, prior_source_week_template_id)
      select ${itemId}, 'relinked', mc.id, ${m.src}::bigint from microcycles mc
      where mc.id = ${m.id} and mc.source_week_template_id is distinct from ${m.src}::bigint
    `;
  }
  await tx`
    insert into coach_assign_batch_microcycle_changes (batch_item_id, change, microcycle_id)
    select ${itemId}, 'created', mc.id from microcycles mc
    where mc.athlete_id = ${athleteId} and mc.id = any(${mat.microcycle_ids.map(Number)}::bigint[])
      and mc.id <> all(${preMicroIds}::bigint[])
  `;
  await tx`
    insert into coach_assign_batch_receipt_changes (batch_item_id, change, month_assignment_id)
    values (${itemId}, 'created', ${Number(mat.month_assignment_id)})
  `;
  return { month_assignment_id: Number(mat.month_assignment_id), created: created.length };
}

export interface ApplyContext {
  batch_id: number;
  coach_id: number;
  kind: 'assign' | 'group_join';
  sequence_id: number | null;
  delivery: WeekDelivery;
  policy: OnConflict;
  start: string;
  today: string;
  days_before: number;
  /** Vuelve a decidir con el plan del atleta recién leído (dentro del candado). */
  replan: (athlete: RecipientInfo, receipts: ExistingReceipt[]) => PlanTarget;
}

export interface ApplyOutcome {
  athlete_id: number;
  status: 'applied' | 'skipped' | 'failed';
  reason: string | null;
  /** Primera semana que el atleta ve con el programa nuevo (para avisarle). */
  visible_week: string | null;
}

async function insertItem(tx: Sql, ctx: ApplyContext, t: PlanTarget, status: 'applied' | 'skipped', reason: string | null) {
  const rows = await tx<Array<{ id: string }>>`
    insert into coach_assign_batch_items (
      batch_id, athlete_id, status, action, month_template_id, start_date, end_date, start_week, position,
      reason_code, reason
    ) values (
      ${ctx.batch_id}, ${t.athlete_id}, ${status}, ${t.action}, ${t.program?.id ?? null},
      ${t.start_date}::date, ${t.end_date}::date, ${t.start_week}, ${t.position},
      ${t.blocked?.code ?? (t.action === 'skip' ? 'skip' : null)}, ${reason}
    )
    returning id::text
  `;
  return Number(rows[0]!.id);
}

function skipReason(t: PlanTarget): string {
  if (t.blocked) return t.blocked.message;
  const last = t.conflicts[t.conflicts.length - 1];
  return last ? `Ya tiene «${last.program_name}» hasta el ${last.end_date}; se ha saltado.` : 'Se ha saltado.';
}

export async function applyTarget(client: Sql, ctx: ApplyContext, athlete: RecipientInfo): Promise<ApplyOutcome> {
  try {
    return await client.begin(async (raw) => {
      const tx = raw as unknown as Sql;
      await tx`select pg_advisory_xact_lock(hashtext('athlete_plan_mutation'), ${athlete.id}::int)`;
      const receipts = (await loadReceipts(tx, [athlete.id], ctx.start)).get(athlete.id) ?? [];
      const target = ctx.replan(athlete, receipts);
      if (target.action === 'blocked' || target.action === 'skip') {
        const reason = skipReason(target);
        await insertItem(tx, ctx, target, 'skipped', reason);
        return { athlete_id: athlete.id, status: 'skipped' as const, reason, visible_week: null };
      }
      const itemId = await insertItem(tx, ctx, target, 'applied', null);
      if (target.action === 'replace') await cutReceipts(tx, itemId, athlete.id, target.conflicts, target.start_date!);

      let visibleWeek: string | null = null;
      // 'adopt': ya está haciendo este programa del grupo → nada que materializar.
      if (target.program && target.action !== 'adopt') {
        const mat = await materializeWithLog(tx, { itemId, coachId: ctx.coach_id, athleteId: athlete.id, target });
        const outcome = await applyDeliveryToWeeks(tx, {
          coach_id: ctx.coach_id,
          athlete_id: athlete.id,
          week_starts: weekStarts(target.start_date!, target.end_date!),
          delivery: ctx.delivery,
          today: ctx.today,
          days_before: ctx.days_before,
        });
        for (const [week, before] of outcome.before) {
          if (sameRow(before, outcome.after.get(week) ?? null)) continue;
          await tx`
            insert into coach_assign_batch_week_changes (batch_item_id, week_start, prior_status, prior_delivery_mode)
            values (${itemId}, ${week}::date, ${before?.status ?? null}, ${before?.delivery_mode ?? null})
          `;
        }
        visibleWeek = [...outcome.after].find(([, row]) => athleteSeesWeek(row))?.[0] ?? null;
        await tx`
          update coach_assign_batch_items
          set month_assignment_id = ${mat.month_assignment_id}, sessions_created = ${mat.created}
          where id = ${itemId}
        `;
      }

      if (ctx.kind === 'group_join' && ctx.sequence_id != null) {
        const enr = await enrollInSequence(tx, {
          athlete_id: athlete.id,
          coach_id: ctx.coach_id,
          sequence_id: ctx.sequence_id,
          position: target.position ?? 1,
          leave_detached: true,
        });
        if (enr.created) {
          await tx`
            insert into coach_assign_batch_cursor_changes (batch_item_id, change, progress_id)
            values (${itemId}, 'created', ${enr.progress_id})
          `;
        }
        for (const c of enr.changed) {
          await tx`
            insert into coach_assign_batch_cursor_changes (batch_item_id, change, progress_id, prior_status)
            values (${itemId}, 'status_changed', ${c.progress_id}, ${c.prior_status})
          `;
        }
        await tx`update coach_assign_batch_items set prior_plan_mode = ${enr.prior_plan_mode} where id = ${itemId}`;
      }
      return { athlete_id: athlete.id, status: 'applied' as const, reason: null, visible_week: visibleWeek };
    });
  } catch (err) {
    const known = err instanceof InstantiateProgramError;
    const reason = known
      ? err.message
      : 'No se pudo asignar a este atleta por un error interno. Vuelve a intentarlo; si se repite, avísanos.';
    if (!known) captureRouteError(err, { route: 'lib/coach/assign-many.applyTarget' });
    await client`
      insert into coach_assign_batch_items (batch_id, athlete_id, status, action, reason_code, reason)
      values (${ctx.batch_id}, ${athlete.id}, 'failed', 'blocked', ${known ? err.code : 'internal'}, ${reason})
      on conflict (batch_id, athlete_id) do nothing
    `;
    return { athlete_id: athlete.id, status: 'failed', reason, visible_week: null };
  }
}
