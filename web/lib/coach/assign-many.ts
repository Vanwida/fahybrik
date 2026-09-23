import 'server-only';

// ASIGNAR A VARIOS (§4.6) — un programa a muchos atletas de una vez, con vista
// previa, un solo «confirmar» y «Deshacer». Y el mismo motor para ENTRAR EN UN
// GRUPO (alineado con el calendario del grupo). Partes:
//   · assign-many-plan.ts  — decidir (previa): quién, qué, cuándo, conflictos.
//   · assign-many-apply.ts — aplicar a un atleta en una transacción, con registro.
//   · assign-many-undo.ts  — deshacer exacto.
// Este fichero orquesta: destinatarios → previa → (dry_run) → lote idempotente →
// cada atleta en su transacción → avisos.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import {
  anchorFromRequest,
  groupAnchorFromMembers,
  type ExistingReceipt,
  type GroupAnchor,
  type OnConflict,
} from '@fahybrid/shared/domain/coach/plan-placement';
import type { WeekDelivery } from '@fahybrid/shared/domain/coach/week-publishing';
import type {
  AssignApplied,
  AssignManyInput,
  AssignPreview,
  AssignResponse,
} from '@fahybrid/shared/schema/assign-many';
import { notifyAthlete } from '@/lib/notifications/dispatch';
import { planPublishedPush } from '@/lib/notifications/plan-published';
import { boxToday, getAutoPublishSetting } from './week-publishing';
import {
  AssignManyError,
  adoptableReceipt,
  adoptVote,
  assertStartNotPast,
  buildPreview,
  loadProgramOrThrow,
  loadReceipts,
  planAssignTarget,
  planGroupJoinTarget,
  requestHash,
  resolveRecipients,
  type PlanTarget,
  type RecipientInfo,
} from './assign-many-plan';
import { applyTarget, type ApplyContext } from './assign-many-apply';
import { loadGroupPlanContext } from './groups-read';

export { AssignManyError } from './assign-many-plan';
export { undoAssignBatch } from './assign-many-undo';

/** Un segundo envío idéntico dentro de esta ventana devuelve el lote que ya hay. */
const REPLAY_WINDOW_MINUTES = 10;
/** Atletas en paralelo (cada uno con su transacción y su conexión). */
const CONCURRENCY = 4;

interface BatchSpec {
  kind: 'assign' | 'group_join';
  coach_id: number;
  user_id: number | null;
  program_id: number | null;
  sequence_id: number | null;
  start: string;
  start_week: number | null;
  start_position: number | null;
  delivery: WeekDelivery;
  on_conflict: OnConflict;
  recipients: RecipientInfo[];
}

function hashOf(spec: BatchSpec): string {
  return requestHash({
    kind: spec.kind,
    coach_id: spec.coach_id,
    program_id: spec.program_id,
    sequence_id: spec.sequence_id,
    athlete_ids: spec.recipients.map((r) => r.id),
    start: spec.start,
    start_week: spec.start_week,
    start_position: spec.start_position,
    delivery: spec.delivery,
    on_conflict: spec.on_conflict,
  });
}

async function findRecentBatch(client: Sql, coach_id: number, hash: string): Promise<number | null> {
  const rows = await client<Array<{ id: string }>>`
    select id::text from coach_assign_batches
    where coach_id = ${coach_id} and request_hash = ${hash} and undone_at is null
      and created_at > now() - make_interval(mins => ${REPLAY_WINDOW_MINUTES})
    order by created_at desc limit 1
  `;
  return rows[0] ? Number(rows[0].id) : null;
}

async function appliedFromItems(client: Sql, batch_id: number, replayed: boolean): Promise<AssignApplied> {
  const items = await client<Array<{ athlete_id: string; status: string; reason: string | null }>>`
    select athlete_id::text, status, reason from coach_assign_batch_items where batch_id = ${batch_id} order by id
  `;
  const results = items.map((i) => ({
    athlete_id: i.athlete_id,
    status: (i.status === 'undone' ? 'applied' : i.status) as AssignApplied['results'][number]['status'],
    reason: i.reason,
  }));
  return {
    batch_id: String(batch_id),
    assigned: results.filter((r) => r.status === 'applied').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
    replayed,
    results,
  };
}

async function notifyAssigned(client: Sql, athlete_id: number, week_start: string): Promise<void> {
  try {
    await notifyAthlete({
      sql: client,
      athlete_id: BigInt(athlete_id),
      type: 'plan_published',
      payload: { athlete_id: String(athlete_id), week_start, deep_link: `/plan?week=${week_start}` },
      push: {
        ...(await planPublishedPush(client, BigInt(athlete_id), 'assigned')),
        deeplink: { screen: 'plan', week_start },
      },
    });
  } catch {
    // Cortesía: el plan ya está; la bandeja in-app es lo durable.
  }
}

async function runWorkers<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]!);
    }
  });
  await Promise.all(lanes);
}

/**
 * Crea el lote (o devuelve el idéntico reciente, bajo candado del coach para que
 * dos envíos simultáneos no creen dos) y aplica cada atleta.
 */
async function executeBatch(
  client: Sql,
  spec: BatchSpec,
  replan: ApplyContext['replan'],
): Promise<AssignApplied> {
  const hash = hashOf(spec);
  const created = await client.begin(async (raw) => {
    const tx = raw as unknown as Sql;
    await tx`select pg_advisory_xact_lock(hashtext('coach_assign_batch'), ${spec.coach_id}::int)`;
    const existing = await findRecentBatch(tx, spec.coach_id, hash);
    if (existing) return { id: existing, replayed: true };
    const rows = await tx<Array<{ id: string }>>`
      insert into coach_assign_batches (
        coach_id, kind, month_template_id, sequence_id, start_date, start_week, start_position,
        delivery, on_conflict, request_hash, created_by_user_id
      ) values (
        ${spec.coach_id}, ${spec.kind}, ${spec.program_id}, ${spec.sequence_id}, ${spec.start}::date,
        ${spec.start_week}, ${spec.start_position}, ${spec.delivery}, ${spec.on_conflict}, ${hash}, ${spec.user_id}
      )
      returning id::text
    `;
    return { id: Number(rows[0]!.id), replayed: false };
  });
  if (created.replayed) return appliedFromItems(client, created.id, true);

  const ctx: ApplyContext = {
    batch_id: created.id,
    coach_id: spec.coach_id,
    kind: spec.kind,
    sequence_id: spec.sequence_id,
    delivery: spec.delivery,
    policy: spec.on_conflict,
    start: spec.start,
    today: boxToday(),
    days_before: (await getAutoPublishSetting(spec.coach_id, client)).effective_days,
    replan,
  };
  const toNotify: Array<{ id: number; week: string }> = [];
  await runWorkers(spec.recipients, async (athlete) => {
    const out = await applyTarget(client, ctx, athlete);
    if (out.status === 'applied' && out.visible_week) toNotify.push({ id: athlete.id, week: out.visible_week });
  });
  for (const n of toNotify) await notifyAssigned(client, n.id, n.week);
  return appliedFromItems(client, created.id, false);
}

async function replayResponse(client: Sql, batch_id: number, preview: AssignPreview): Promise<AssignResponse> {
  return { preview, applied: await appliedFromItems(client, batch_id, true) };
}

// ── Asignar un programa a varios ─────────────────────────────────────────────

export async function runAssign(params: {
  coach_id: number | bigint;
  user_id?: number | bigint | null;
  input: AssignManyInput;
  client?: Sql;
}): Promise<AssignResponse> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const input = params.input;
  assertStartNotPast(input.start_date);

  const program = await loadProgramOrThrow(client, coachId, Number(input.program_id));
  if (program.weeks === 0) {
    throw new AssignManyError('empty_program', `«${program.name}» no tiene semanas. Añádele al menos una antes de asignarlo.`, 422);
  }
  const startWeek = input.start_week ?? 1;
  if (startWeek > program.weeks) {
    throw new AssignManyError(
      'invalid_start_week',
      `«${program.name}» tiene ${program.weeks} ${program.weeks === 1 ? 'semana' : 'semanas'}; no se puede entrar en la ${startWeek}.`,
      422,
    );
  }
  if (program.sessions_by_week.slice(startWeek - 1).every((n) => n === 0)) {
    throw new AssignManyError(
      'empty_program',
      `«${program.name}» todavía no tiene entrenos${startWeek > 1 ? ` desde la semana ${startWeek}` : ''}. Añádelos antes de asignarlo.`,
      422,
    );
  }

  const recipients = await resolveRecipients(
    client,
    coachId,
    (input.athlete_ids ?? []).map(Number),
    (input.group_ids ?? []).map(Number),
  );
  const spec: BatchSpec = {
    kind: 'assign',
    coach_id: coachId,
    user_id: params.user_id == null ? null : Number(params.user_id),
    program_id: program.id,
    sequence_id: null,
    start: input.start_date,
    start_week: startWeek,
    start_position: null,
    delivery: input.delivery,
    on_conflict: input.on_conflict,
    recipients,
  };
  const replan = (athlete: RecipientInfo, receipts: ExistingReceipt[]): PlanTarget =>
    planAssignTarget({ athlete, receipts, program, start: spec.start, start_week: startWeek, policy: spec.on_conflict });

  const receipts = await loadReceipts(client, recipients.map((r) => r.id), spec.start);
  const targets = recipients.map((r) => replan(r, receipts.get(r.id) ?? []));
  const preview = buildPreview({ targets, recipients, program, group: null, start: spec.start, start_week: startWeek });
  if (input.dry_run) return { preview };

  const recent = await findRecentBatch(client, coachId, hashOf(spec));
  if (recent) return replayResponse(client, recent, preview);
  return { preview, applied: await executeBatch(client, spec, replan) };
}

// ── Entrar en un grupo (alineado con su calendario) ──────────────────────────

/** El lunes que viene (día de caja). */
export function nextMonday(): string {
  return isoDateString(addDays(mondayOfWeek(parseIsoDate(boxToday())), 7));
}

export async function runGroupJoin(params: {
  coach_id: number | bigint;
  user_id?: number | bigint | null;
  group_id: number;
  athlete_ids: number[];
  start_date?: string;
  start_position?: number;
  start_week?: number;
  on_conflict: OnConflict;
  delivery: WeekDelivery;
  dry_run?: boolean;
  client?: Sql;
}): Promise<AssignResponse> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const start = params.start_date ?? nextMonday();
  assertStartNotPast(start);

  const recipients = await resolveRecipients(client, coachId, params.athlete_ids, []);
  const group = await loadGroupPlanContext(client, coachId, params.group_id, params.athlete_ids);
  const receipts = await loadReceipts(client, recipients.map((r) => r.id), start);
  const manual = params.start_position != null || params.start_week != null;
  if (params.start_position != null && group.chain.length > 0 && !group.chain.some((c) => c.position === params.start_position)) {
    throw new AssignManyError(
      'invalid_start_position',
      `El grupo tiene ${group.chain.length} ${group.chain.length === 1 ? 'programa' : 'programas'}; elige una posición entre 1 y ${group.chain.length}.`,
      422,
    );
  }
  // Ancla: la de sus miembros; si el grupo aún no tiene, la de quienes entran
  // haciendo ya un programa de la cadena (adopt); si no, la que define la petición.
  const today = boxToday();
  const adoptersAnchor =
    manual || group.anchor
      ? null
      : groupAnchorFromMembers(
          recipients.flatMap((r) => {
            const a = adoptableReceipt(group, receipts.get(r.id) ?? [], start, params.on_conflict);
            return a ? [adoptVote(a, today)] : [];
          }),
        );
  const anchor: GroupAnchor =
    !manual && group.anchor
      ? group.anchor
      : !manual && adoptersAnchor
        ? adoptersAnchor
        : anchorFromRequest(params.start_position ?? group.chain[0]?.position ?? 1, params.start_week ?? 1, start);
  const startItem = group.chain.find((c) => c.position === anchor.position);
  if (params.start_week != null && startItem && params.start_week > startItem.weeks) {
    throw new AssignManyError(
      'invalid_start_week',
      `«${startItem.program.name}» tiene ${startItem.weeks} semanas; no se puede entrar en la ${params.start_week}.`,
      422,
    );
  }

  const spec: BatchSpec = {
    kind: 'group_join',
    coach_id: coachId,
    user_id: params.user_id == null ? null : Number(params.user_id),
    program_id: null,
    sequence_id: group.id,
    start,
    start_week: params.start_week ?? null,
    start_position: params.start_position ?? null,
    delivery: params.delivery,
    on_conflict: params.on_conflict,
    recipients,
  };
  const replan = (athlete: RecipientInfo, receipts: ExistingReceipt[]): PlanTarget =>
    planGroupJoinTarget({ athlete, receipts, group, anchor, start, policy: params.on_conflict });

  const targets = recipients.map((r) => replan(r, receipts.get(r.id) ?? []));
  const base = targets.find((t) => t.program)?.program ?? startItem?.program ?? null;
  const baseWeek = targets.find((t) => t.program)?.start_week ?? 1;
  const preview = buildPreview({
    targets,
    recipients,
    program: base,
    group: { id: group.id, name: group.name },
    start,
    start_week: baseWeek,
  });
  if (params.dry_run) return { preview };

  const recent = await findRecentBatch(client, coachId, hashOf(spec));
  if (recent) return replayResponse(client, recent, preview);
  return { preview, applied: await executeBatch(client, spec, replan) };
}
