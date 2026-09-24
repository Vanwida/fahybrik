import 'server-only';

// FIRMAR EL ALTA (y deshacerla). El coach decide y el atleta recibe su plan por
// el MISMO motor que «asignar a varios» (`assign-many.ts`): un lote con registro
// de cada fila tocada, así que «Deshacer» repone exactamente lo que había y nunca
// borra lo ya entrenado (DECISIONS 2026-09-23 «El alta dice qué plan recibe»).
//
// Orden: primero el plan (si falla, el alta NO queda firmada), después la
// bienvenida y por último la marca de alta revisada con su foto de decisiones,
// que guarda lo necesario para deshacer: el lote, el mensaje y el modo previo.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { toJsonValue } from '@/lib/json-column';
import { isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { autoPublishDate } from '@fahybrid/shared/domain/coach/week-publishing';
import {
  intakeCommitSchema,
  intakeNotesSnapshotSchema,
  type IntakeCommit,
  type IntakeNotesSnapshot,
  type IntakePlanChoice,
} from './intake-schema';
import { IntakeError } from './intake-error';
import { materializePersonalChain, type PersonalChainResult } from './intake-plan';
import type { IntakePlanSummary } from './intake-plan-line';

export interface CommitResult {
  athlete_id: string;
  /** Lo que recibe, para decírselo al coach en una línea (`intakePlanLine`). */
  plan: IntakePlanSummary;
  /** Lote de asignación (grupo o programa); `null` si no se materializó nada. */
  batch_id: string | null;
  welcome_sent: boolean;
  /**
   * Cadena de programas PERSONALES creada en modo «plan solo para él» si el coach
   * mandó tramos: un contenedor propio del atleta por tramo, desde el lunes de
   * esta semana y en borrador privado. `null` en el resto.
   */
  personal_plan: {
    tramos: PersonalChainResult['tramos'];
    week_starts: string[];
  } | null;
}

function toIntakeError(err: unknown): never {
  if (err instanceof Error && 'code' in err && 'status' in err) {
    const e = err as Error & { code: string; status: number };
    throw new IntakeError(e.code, e.message, e.status);
  }
  throw err;
}

interface Applied {
  batch_id: string | null;
  summary: IntakePlanSummary;
}

/** Aplica la elección de plan con el motor de asignar a varios. */
async function applyPlan(params: {
  plan: IntakePlanChoice;
  coach_id: number;
  coach_user_id: number;
  athlete_id: number;
  client: Sql;
}): Promise<Applied> {
  const { plan, client } = params;
  const empty: IntakePlanSummary = {
    kind: plan.kind,
    group_name: null,
    program_name: null,
    week: null,
    weeks: null,
    start_date: null,
    visible_on: null,
  };
  if (plan.kind === 'keep' || plan.kind === 'personal') return { batch_id: null, summary: empty };

  const { runAssign, runGroupJoin } = await import('./assign-many');
  const { getAutoPublishSetting } = await import('./week-publishing');
  let res: Awaited<ReturnType<typeof runAssign>>;
  try {
    res =
      plan.kind === 'group'
        ? await runGroupJoin({
            coach_id: params.coach_id,
            user_id: params.coach_user_id,
            group_id: Number(plan.group_id),
            athlete_ids: [params.athlete_id],
            start_date: plan.start_date,
            on_conflict: 'replace',
            delivery: 'auto',
            client,
          })
        : await runAssign({
            coach_id: params.coach_id,
            user_id: params.coach_user_id,
            input: {
              program_id: String(plan.program_id),
              athlete_ids: [String(params.athlete_id)],
              start_date: plan.start_date,
              start_week: plan.start_week,
              delivery: 'auto',
              on_conflict: 'replace',
            },
            client,
          });
  } catch (err) {
    toIntakeError(err);
  }
  const applied = res.applied;
  const mine = applied?.results.find((r) => r.athlete_id === String(params.athlete_id));
  if (!applied || !mine || mine.status !== 'applied') {
    const row = res.preview.athletes.find((a) => a.id === String(params.athlete_id));
    throw new IntakeError(
      'plan_not_applied',
      mine?.reason ?? row?.blocked?.message ?? 'No se ha podido darle ese plan.',
      409,
    );
  }
  const row = res.preview.athletes.find((a) => a.id === String(params.athlete_id));
  const start = row?.start_date ?? plan.start_date;
  const n = (await getAutoPublishSetting(params.coach_id, client)).effective_days;
  return {
    batch_id: applied.batch_id,
    summary: {
      ...empty,
      group_name: res.preview.group?.name ?? null,
      program_name: row?.program?.name ?? res.preview.program?.name ?? null,
      week: row?.start_week ?? null,
      start_date: start,
      visible_on: autoPublishDate(start, n),
    },
  };
}

export async function commitIntake(params: {
  athlete_id: bigint | number;
  coach_id: bigint | number;
  coach_user_id: bigint | number;
  payload: unknown;
  now?: Date;
  client?: Sql;
}): Promise<CommitResult> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const athleteId = Number(params.athlete_id);
  const coachId = Number(params.coach_id);

  const parsed = intakeCommitSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new IntakeError('invalid_payload', parsed.error.message, 400);
  }
  const commit: IntakeCommit = parsed.data;
  const plan: IntakePlanChoice = commit.plan ?? { kind: commit.plan_mode === 'personal' ? 'personal' : 'keep' };
  const planMode = plan.kind === 'personal' ? 'personal' : 'shared';

  const checkRows = await client<
    Array<{ coach_id: string | null; intake_completed_at: Date | null; plan_mode: string | null }>
  >`
    select a.coach_id::text as coach_id, a.intake_completed_at, a.plan_mode
    from athletes a
    where a.id = ${athleteId}
    limit 1
  `;
  const check = checkRows[0];
  if (!check) throw new IntakeError('not_found', `athlete ${athleteId} not found`, 404);
  if (check.coach_id !== String(coachId)) {
    throw new IntakeError('forbidden', 'athlete is not assigned to this coach', 403);
  }
  if (check.intake_completed_at) {
    throw new IntakeError('already_committed', 'Esta alta ya está firmada.', 409);
  }

  // 1 · El plan. Si no se puede, el alta sigue pendiente.
  const applied = await applyPlan({
    plan,
    coach_id: coachId,
    coach_user_id: Number(params.coach_user_id),
    athlete_id: athleteId,
    client,
  });

  try {
    // «Plan solo para él» con tramos escritos por el coach: se crean (suyos).
    let personal_plan: CommitResult['personal_plan'] = null;
    if (plan.kind === 'personal' && commit.block_specs.length > 0) {
      const chain = await materializePersonalChain({
        coach_id: coachId,
        coach_user_id: params.coach_user_id,
        athlete_id: athleteId,
        specs: commit.block_specs,
        now,
        client,
      });
      personal_plan = { tramos: chain.tramos, week_starts: chain.week_starts };
    }

    // 2 · Bienvenida.
    let welcome_message_id: string | null = null;
    if (commit.welcome.send && commit.welcome.body && commit.welcome.body.trim().length > 0) {
      welcome_message_id = await sendWelcomeMessage({
        client,
        coach_id: coachId,
        coach_user_id: params.coach_user_id,
        athlete_id: athleteId,
        body: commit.welcome.body.trim(),
        now,
      });
    }

    // 3 · Alta revisada + foto de lo decidido.
    const snapshot: IntakeNotesSnapshot = {
      level: commit.level,
      plan_mode: planMode,
      block_specs: commit.block_specs,
      baseline_tests: commit.baseline_tests,
      acknowledged_warnings: commit.acknowledged_warnings,
      welcome_sent: welcome_message_id != null,
      notes: commit.notes,
      committed_at: now.toISOString(),
      plan_kind: plan.kind,
      assign_batch_id: applied.batch_id,
      welcome_message_id,
      prior_plan_mode: check.plan_mode,
    };
    await client`
      update athletes
      set intake_completed_at = ${now.toISOString()}::timestamptz,
          intake_by_coach_id = ${coachId},
          intake_notes_json = ${client.json(toJsonValue(snapshot))},
          plan_mode = ${planMode},
          updated_at = now()
      where id = ${athleteId}
    `;

    return {
      athlete_id: String(athleteId),
      plan: applied.summary,
      batch_id: applied.batch_id,
      welcome_sent: welcome_message_id != null,
      personal_plan,
    };
  } catch (err) {
    // Lo aplicado no se queda a medias: si algo de después falla, el plan vuelve atrás.
    if (applied.batch_id) {
      const { undoAssignBatch } = await import('./assign-many');
      await undoAssignBatch({ coach_id: coachId, batch_id: Number(applied.batch_id), client }).catch(() => null);
    }
    throw err;
  }
}

/**
 * DESHACER el alta: repone el plan que tenía (el lote), retira la bienvenida y
 * la vuelve a dejar pendiente. Si ya entrenó algo del plan nuevo, se niega con el
 * motivo (lo entrenado no se borra nunca). Los tramos de un plan personal escrito
 * en el alta no se deshacen aquí: se quitan desde su plan.
 */
export async function undoIntake(params: {
  athlete_id: bigint | number;
  coach_id: bigint | number;
  coach_user_id?: bigint | number | null;
  client?: Sql;
}): Promise<{ athlete_id: string }> {
  const client = params.client ?? defaultSql;
  const athleteId = Number(params.athlete_id);
  const coachId = Number(params.coach_id);

  const rows = await client<
    Array<{ coach_id: string | null; completed: boolean; notes: unknown }>
  >`
    select coach_id::text as coach_id, intake_completed_at is not null as completed,
           intake_notes_json as notes
    from athletes where id = ${athleteId} limit 1
  `;
  const row = rows[0];
  if (!row) throw new IntakeError('not_found', `athlete ${athleteId} not found`, 404);
  if (row.coach_id !== String(coachId)) {
    throw new IntakeError('forbidden', 'athlete is not assigned to this coach', 403);
  }
  if (!row.completed) throw new IntakeError('not_committed', 'Esta alta no está firmada.', 409);
  const snap = intakeNotesSnapshotSchema.safeParse(row.notes);
  const s = snap.success ? snap.data : null;
  if (s?.plan_mode === 'personal' && s.block_specs.length > 0) {
    throw new IntakeError(
      'undo_unsupported',
      'Su plan personal ya tiene programas: quítalos desde su plan.',
      409,
    );
  }

  if (s?.assign_batch_id) {
    const { undoAssignBatch } = await import('./assign-many');
    let result: Awaited<ReturnType<typeof undoAssignBatch>>;
    try {
      result = await undoAssignBatch({
        coach_id: coachId,
        batch_id: Number(s.assign_batch_id),
        user_id: params.coach_user_id ?? null,
        client,
      });
    } catch (err) {
      toIntakeError(err);
    }
    const mine = result.results.find((r) => r.athlete_id === String(athleteId));
    if (mine?.status === 'failed') {
      throw new IntakeError('undo_refused', mine.reason ?? 'Ya ha entrenado algo del plan nuevo.', 409);
    }
  }

  if (s?.welcome_message_id) {
    await client`
      update chat_messages m set deleted_at = now()
      from chat_threads t
      where m.id = ${Number(s.welcome_message_id)} and t.id = m.thread_id
        and t.athlete_id = ${athleteId} and t.coach_id = ${coachId}
        and m.sender_role::text = 'coach' and m.deleted_at is null
    `;
    await client`
      update chat_threads set unread_for_athlete = greatest(unread_for_athlete - 1, 0), updated_at = now()
      where athlete_id = ${athleteId} and coach_id = ${coachId}
    `;
  }

  await client`
    update athletes
    set intake_completed_at = null,
        intake_by_coach_id = null,
        intake_notes_json = '{}'::jsonb,
        plan_mode = ${s?.prior_plan_mode ?? 'shared'},
        updated_at = now()
    where id = ${athleteId}
  `;
  return { athlete_id: String(athleteId) };
}

/** Abre (o reutiliza) el hilo, deja el mensaje y avisa al atleta. Devuelve el id del mensaje. */
async function sendWelcomeMessage(params: {
  client: Sql;
  coach_id: number;
  coach_user_id: bigint | number;
  athlete_id: number;
  body: string;
  now: Date;
}): Promise<string | null> {
  const threadRows = await params.client<Array<{ id: string }>>`
    insert into chat_threads (coach_id, athlete_id, last_message_at, unread_for_athlete)
    values (${params.coach_id}, ${params.athlete_id}, ${params.now.toISOString()}::timestamptz, 1)
    on conflict (coach_id, athlete_id) do update
      set last_message_at = excluded.last_message_at,
          unread_for_athlete = chat_threads.unread_for_athlete + 1,
          updated_at = now()
    returning id::text as id
  `;
  const threadId = threadRows[0]?.id;
  if (!threadId) return null;

  const msg = await params.client<Array<{ id: string }>>`
    insert into chat_messages (thread_id, sender_user_id, sender_role, body)
    values (${Number(threadId)}, ${Number(params.coach_user_id)}, 'coach', ${params.body})
    returning id::text as id
  `;

  await params.client`
    insert into notifications (user_id, type, payload_json)
    select a.user_id, 'chat_message', ${params.client.json({
      kind: 'welcome',
      thread_id: threadId,
      coach_id: String(params.coach_id),
    })}
    from athletes a
    where a.id = ${params.athlete_id}
  `;
  return msg[0]?.id ?? null;
}

/** El lunes que viene respecto a `today` (YYYY-MM-DD). */
export function nextMondayFrom(today: string): string {
  const monday = mondayOfWeek(parseIsoDate(today));
  return isoDateString(new Date(monday.getTime() + 7 * 86_400_000));
}
