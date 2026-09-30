import 'server-only';

// ASIGNAR A VARIOS — la parte que DECIDE (sin escribir nada): a quién, qué
// programa, desde qué semana y en qué fechas, y qué pasa con lo que ya tiene.
// La previa (dry_run) es exactamente esto; la aplicación lo vuelve a calcular
// dentro de la transacción de cada atleta con su plan recién leído, así que la
// previa nunca promete algo que la aplicación no cumple.

import { createHash } from 'node:crypto';
import type { Sql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import {
  placeChainRest,
  placeInGroup,
  placeProgram,
  windowEnd,
  type ChainItem,
  type ChainStep,
  type MemberAnchorVote,
  type ExistingReceipt,
  type GroupAnchor,
  type GroupEndPolicy,
  type OnConflict,
} from '@fahybrid/shared/domain/coach/plan-placement';
import type { WeekDelivery } from '@fahybrid/shared/domain/coach/week-publishing';
import type {
  AssignAction,
  AssignPreview,
  AssignPreviewAthlete,
} from '@fahybrid/shared/schema/assign-many';
import { parseWeekSlotsFromDb } from '@/lib/dashboard/coach/program-week-slots';
import {
  describeDrop,
  resolveSessionsContent,
  sessionLabel,
  type DroppedSession,
} from '@/lib/dashboard/coach/session-content';
import type { WeekSession } from '@fahybrid/shared/schema/program-templates';
import { boxToday } from './week-publishing';

export class AssignManyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AssignManyError';
  }
}

export type Lifecycle = 'activo' | 'pausado' | 'baja';

export interface ProgramInfo {
  id: number;
  name: string;
  weeks: number;
  /** Entrenos que de verdad se crean por semana (índice 0 = semana 1). */
  sessions_by_week: number[];
  /** Sesiones que se pierden (o se crean incompletas) al materializar, y por qué. */
  dropped: DroppedSession[];
}

export interface RecipientInfo {
  id: number;
  name: string;
  lifecycle: Lifecycle;
  partner: { id: number; name: string } | null;
}

/** Lo que el plan decide para UN atleta. */
export interface PlanTarget {
  athlete_id: number;
  action: AssignAction;
  blocked: { code: string; message: string } | null;
  program: ProgramInfo | null;
  /** Posición en la cadena del grupo (solo al entrar en un grupo). */
  position: number | null;
  start_week: number | null;
  start_date: string | null;
  end_date: string | null;
  conflicts: ExistingReceipt[];
  /**
   * Al entrar en un grupo: los programas que siguen al de entrada hasta el final de
   * la cadena, pegados uno tras otro (vacío = no hay más o el atleta no recibe nada).
   */
  rest: PlanStep[];
}

/** Un programa de la cadena que sigue al de entrada, con sus fechas decididas. */
export type PlanStep = ChainStep & { program: ProgramInfo };

export interface GroupPlanContext {
  id: number;
  name: string;
  end_policy: GroupEndPolicy;
  /** Cadena por posición, con su programa. */
  chain: Array<ChainItem & { program: ProgramInfo }>;
  anchor: GroupAnchor | null;
  /** Atletas que ya están en el grupo (no se vuelven a meter). */
  members: Set<number>;
}

// ── Cargas ───────────────────────────────────────────────────────────────────

/** Programas de biblioteca del coach, con sus semanas y entrenos por semana. */
export async function loadPrograms(client: Sql, coach_id: number, ids: number[]): Promise<Map<number, ProgramInfo>> {
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return new Map();
  const heads = await client<Array<{ id: string; name: string; owner: string | null }>>`
    select id::text, name, athlete_id::text as owner
    from program_month_templates
    where coach_id = ${coach_id} and id = any(${uniq}::bigint[])
  `;
  const weeks = await client<Array<{ month_id: string; slots_json: unknown }>>`
    select w.month_template_id::text as month_id, pwt.slots_json
    from program_month_weeks w
    join program_week_templates pwt on pwt.id = w.week_template_id
    where w.month_template_id = any(${uniq}::bigint[])
    order by w.month_template_id, w.position
  `;
  // Todas las sesiones de entreno de todas las semanas, con su sitio, y UN veredicto
  // para el lote: el mismo (`resolveSessionsContent`) que usa la materialización.
  type Spot = { month_id: string; week_index: number; day_of_week: number; session: WeekSession };
  const spots: Spot[] = [];
  const weekCount = new Map<string, number>();
  for (const w of weeks) {
    const week_index = weekCount.get(w.month_id) ?? 0;
    weekCount.set(w.month_id, week_index + 1);
    for (const day of parseWeekSlotsFromDb(w.slots_json).days) {
      for (const session of day.sessions) {
        if (session.kind === 'workout') spots.push({ month_id: w.month_id, week_index, day_of_week: day.day_of_week, session });
      }
    }
  }
  const verdicts = await resolveSessionsContent(client, coach_id, spots.map((s) => s.session));

  const out = new Map<number, ProgramInfo>();
  for (const h of heads) {
    if (h.owner != null) continue; // un plan personal no es un programa asignable
    const sessions = Array.from({ length: weekCount.get(h.id) ?? 0 }, () => 0);
    const dropped: DroppedSession[] = [];
    spots.forEach((spot, i) => {
      if (spot.month_id !== h.id) return;
      const verdict = verdicts[i]!;
      if (verdict.materializes) sessions[spot.week_index]! += 1;
      if (verdict.drop) {
        dropped.push({
          ...verdict.drop,
          week_number: spot.week_index + 1,
          day_of_week: spot.day_of_week,
          label: sessionLabel(spot.session),
        });
      }
    });
    out.set(Number(h.id), { id: Number(h.id), name: h.name, weeks: sessions.length, sessions_by_week: sessions, dropped });
  }
  return out;
}

/** Lo que se pierde al materializar desde `start_week`, en frases para el coach. */
export function droppedFrom(program: ProgramInfo | null, start_week: number | null): DroppedSession[] {
  if (!program || start_week == null) return [];
  return program.dropped.filter((d) => d.week_number >= start_week);
}

export async function loadProgramOrThrow(client: Sql, coach_id: number, program_id: number): Promise<ProgramInfo> {
  const map = await loadPrograms(client, coach_id, [program_id]);
  const program = map.get(program_id);
  if (!program) {
    const personal = await client<Array<{ name: string }>>`
      select name from program_month_templates
      where id = ${program_id} and coach_id = ${coach_id} and athlete_id is not null limit 1
    `;
    throw personal[0]
      ? new AssignManyError(
          'personal_plan',
          `«${personal[0].name}» es el plan personal de un atleta; no se puede asignar a otros. Elige un programa de la biblioteca.`,
          422,
        )
      : new AssignManyError('program_not_found', 'No encuentro ese programa en tu biblioteca.', 404);
  }
  return program;
}

/**
 * Destinatarios: atletas sueltos + miembros de los grupos pedidos, sin repetir.
 * Todo tiene que ser del coach: un atleta o un grupo ajeno invalida el envío
 * entero (404) — nunca se asigna «a casi todos».
 */
export async function resolveRecipients(
  client: Sql,
  coach_id: number,
  athlete_ids: number[],
  group_ids: number[],
): Promise<RecipientInfo[]> {
  const direct = [...new Set(athlete_ids)];
  if (direct.length > 0) {
    const owned = await client<Array<{ id: string }>>`
      select id::text from athletes where coach_id = ${coach_id} and id = any(${direct}::bigint[])
    `;
    if (owned.length !== direct.length) {
      const n = direct.length - owned.length;
      throw new AssignManyError(
        'athlete_not_found',
        `${n} de los atletas ${n === 1 ? 'no es tuyo o no existe' : 'no son tuyos o no existen'}. Quítalos de la selección; no se ha asignado nada.`,
        404,
      );
    }
  }
  const groups = [...new Set(group_ids)];
  let fromGroups: number[] = [];
  if (groups.length > 0) {
    const ownedGroups = await client<Array<{ id: string }>>`
      select id::text from program_sequences where coach_id = ${coach_id} and id = any(${groups}::bigint[])
    `;
    if (ownedGroups.length !== groups.length) {
      throw new AssignManyError('group_not_found', 'Uno de los grupos no existe o no es tuyo; no se ha asignado nada.', 404);
    }
    const members = await client<Array<{ athlete_id: string }>>`
      select athlete_id::text from athlete_sequence_progress
      where coach_id = ${coach_id} and sequence_id = any(${groups}::bigint[]) and status = 'active'
    `;
    fromGroups = members.map((m) => Number(m.athlete_id));
  }
  const all = [...new Set([...direct, ...fromGroups])];
  if (all.length === 0) {
    throw new AssignManyError('no_recipients', 'Los grupos elegidos no tienen atletas. Añade atletas o elige otros.', 422);
  }
  const rows = await client<Array<{ id: string; name: string; lifecycle: Lifecycle; partner_id: string | null; partner_name: string | null }>>`
    select a.id::text, a.full_name as name, a.lifecycle_status::text as lifecycle,
           p.partner_id::text as partner_id, pa.full_name as partner_name
    from athletes a
    left join lateral (
      select case when dp.athlete_a_id = a.id then dp.athlete_b_id else dp.athlete_a_id end as partner_id
      from doubles_pairs dp
      where dp.status = 'active' and (dp.athlete_a_id = a.id or dp.athlete_b_id = a.id)
      limit 1
    ) p on true
    left join athletes pa on pa.id = p.partner_id
    where a.coach_id = ${coach_id} and a.id = any(${all}::bigint[])
    order by a.full_name asc, a.id asc
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    lifecycle: r.lifecycle,
    partner: r.partner_id ? { id: Number(r.partner_id), name: r.partner_name ?? '' } : null,
  }));
}

/** Recibos que acaban el día `from` o después (los únicos que pueden estorbar). */
export async function loadReceipts(
  client: Sql,
  athlete_ids: number[],
  from: string,
): Promise<Map<number, ExistingReceipt[]>> {
  const out = new Map<number, ExistingReceipt[]>();
  if (athlete_ids.length === 0) return out;
  const rows = await client<Array<ExistingReceipt & { athlete_id: string }>>`
    select ama.id::text, ama.athlete_id::text, ama.month_template_id::text, m.name as program_name,
           to_char(ama.start_date, 'YYYY-MM-DD') as start_date,
           to_char(ama.end_date, 'YYYY-MM-DD') as end_date
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    where ama.athlete_id = any(${athlete_ids}::bigint[]) and ama.end_date >= ${from}::date
    order by ama.start_date
  `;
  for (const r of rows) {
    const { athlete_id, ...receipt } = r;
    const list = out.get(Number(athlete_id)) ?? [];
    list.push(receipt);
    out.set(Number(athlete_id), list);
  }
  return out;
}

// ── Decidir ──────────────────────────────────────────────────────────────────

/** Lunes de la semana en curso (día del coach, su huso): no se empieza en una semana pasada. */
export function earliestStart(now?: Date, tz?: string): string {
  return isoDateString(mondayOfWeek(parseIsoDate(boxToday(now, tz))));
}

export function assertStartNotPast(start: string, now?: Date, tz?: string): void {
  const earliest = earliestStart(now, tz);
  if (start < earliest) {
    throw new AssignManyError(
      'start_in_past',
      `No se puede empezar en una semana que ya pasó. El lunes más temprano es el ${earliest}.`,
      422,
    );
  }
}

const BLOCKED_BAJA = { code: 'baja', message: 'Está de baja: no entrena contigo ahora mismo.' };

function blocked(athlete_id: number, b: { code: string; message: string }): PlanTarget {
  return {
    athlete_id,
    action: 'blocked',
    blocked: b,
    program: null,
    position: null,
    start_week: null,
    start_date: null,
    end_date: null,
    conflicts: [],
    rest: [],
  };
}

export function planAssignTarget(input: {
  athlete: RecipientInfo;
  receipts: ExistingReceipt[];
  program: ProgramInfo;
  start: string;
  start_week: number;
  policy: OnConflict;
}): PlanTarget {
  if (input.athlete.lifecycle === 'baja') return blocked(input.athlete.id, BLOCKED_BAJA);
  const weeks = input.program.weeks - input.start_week + 1;
  const placed = placeProgram({ receipts: input.receipts, start: input.start, weeks, policy: input.policy });
  return {
    athlete_id: input.athlete.id,
    action: placed.action,
    blocked: null,
    program: input.program,
    position: null,
    start_week: input.start_week,
    start_date: placed.start_date,
    end_date: placed.end_date,
    conflicts: placed.conflicts,
    rest: [],
  };
}

/** Los programas que siguen a `after_position` en la cadena del grupo, con lo que el atleta ya tiene. */
export function restOfChain(
  group: GroupPlanContext,
  receipts: ExistingReceipt[],
  after: { position: number; end_date: string },
  policy: OnConflict,
): PlanStep[] {
  const byPosition = new Map(group.chain.map((c) => [c.position, c.program]));
  return placeChainRest({
    receipts,
    after_end: after.end_date,
    after_position: after.position,
    chain: group.chain.map((c) => ({ position: c.position, weeks: c.weeks, template_id: String(c.program.id) })),
    policy,
  }).map((step) => ({ ...step, program: byPosition.get(step.position)! }));
}

/**
 * El siguiente programa de la cadena tras `after`, decidido con el plan del atleta
 * tal como está AHORA. La aplicación lo pide de uno en uno, dentro de su
 * transacción y con los recibos recién leídos: lo que se corte o coloque para un
 * programa cuenta ya para el siguiente.
 */
export function nextChainStep(
  group: GroupPlanContext,
  receipts: ExistingReceipt[],
  after: { position: number; end_date: string },
  policy: OnConflict,
): PlanStep | null {
  return restOfChain(group, receipts, after, policy)[0] ?? null;
}

/**
 * El programa del grupo que el atleta YA está haciendo el día que entra: un recibo
 * suyo de un programa de la cadena que cubre `start`. Entonces se queda con él
 * (adopt) — no se le vuelve a dar. Con «Sustituir» no se adopta: el coach pidió
 * rehacerlo alineado con el grupo.
 */
export function adoptableReceipt(
  group: GroupPlanContext,
  receipts: ExistingReceipt[],
  start: string,
  policy: OnConflict,
): { receipt: ExistingReceipt; position: number; weeks: number } | null {
  if (policy === 'replace') return null;
  for (const r of [...receipts].sort((a, b) => (a.start_date < b.start_date ? -1 : 1))) {
    if (!(r.start_date <= start && r.end_date >= start)) continue;
    const item = [...group.chain]
      .sort((a, b) => a.position - b.position)
      .find((c) => String(c.program.id) === r.month_template_id);
    if (item) return { receipt: r, position: item.position, weeks: item.weeks };
  }
  return null;
}

/** El voto de quien va a adoptar: sirve de ancla a un grupo que aún no tiene miembros. */
export function adoptVote(
  adopt: { receipt: ExistingReceipt; position: number; weeks: number },
  today: string,
): MemberAnchorVote {
  return {
    position: adopt.position,
    program_weeks: adopt.weeks,
    receipt_end: adopt.receipt.end_date,
    current: adopt.receipt.end_date >= today,
  };
}

export function planGroupJoinTarget(input: {
  athlete: RecipientInfo;
  receipts: ExistingReceipt[];
  group: GroupPlanContext;
  anchor: GroupAnchor;
  start: string;
  policy: OnConflict;
}): PlanTarget {
  const { athlete, group } = input;
  if (athlete.lifecycle === 'baja') return blocked(athlete.id, BLOCKED_BAJA);
  if (group.members.has(athlete.id)) {
    return blocked(athlete.id, { code: 'already_member', message: `Ya está en «${group.name}».` });
  }
  if (group.chain.length === 0) {
    // Grupo sin programas: entra como miembro y el plan llega cuando el coach
    // le asigne el primero (Asignar con el grupo como destinatario).
    return {
      athlete_id: athlete.id,
      action: 'assign',
      blocked: null,
      program: null,
      position: 1,
      start_week: null,
      start_date: null,
      end_date: null,
      conflicts: [],
      rest: [],
    };
  }
  const adopt = adoptableReceipt(group, input.receipts, input.start, input.policy);
  if (adopt) {
    const programStart = isoDateString(addDays(parseIsoDate(adopt.receipt.end_date), 1 - adopt.weeks * 7));
    const weekAtStart =
      Math.floor((parseIsoDate(input.start).getTime() - parseIsoDate(programStart).getTime()) / 604_800_000) + 1;
    return {
      athlete_id: athlete.id,
      action: 'adopt',
      blocked: null,
      program: group.chain.find((c) => c.position === adopt.position)!.program,
      position: adopt.position,
      start_week: Math.max(1, weekAtStart),
      start_date: adopt.receipt.start_date,
      end_date: adopt.receipt.end_date,
      conflicts: [],
      // Lo que ya hace se queda; lo que le falta detrás hasta el final de la cadena se le pone.
      rest: restOfChain(group, input.receipts, { position: adopt.position, end_date: adopt.receipt.end_date }, input.policy),
    };
  }
  const placed = placeInGroup({
    receipts: input.receipts,
    start: input.start,
    policy: input.policy,
    chain: group.chain,
    endPolicy: group.end_policy,
    anchor: input.anchor,
  });
  if (!placed) {
    return blocked(athlete.id, {
      code: 'group_plan_over',
      message:
        'El plan del grupo ya habrá terminado en esa fecha. Añade programas al grupo o elige desde qué programa entra.',
    });
  }
  const item = group.chain.find((c) => c.position === placed.position)!;
  return {
    athlete_id: athlete.id,
    action: placed.placement.action,
    blocked: null,
    program: item.program,
    position: placed.position,
    start_week: placed.week,
    start_date: placed.placement.start_date,
    end_date: placed.placement.end_date,
    conflicts: placed.placement.conflicts,
    rest:
      placed.placement.action === 'skip'
        ? []
        : restOfChain(group, input.receipts, { position: placed.position, end_date: placed.placement.end_date }, input.policy),
  };
}

// ── Previa ───────────────────────────────────────────────────────────────────

function previewAthlete(target: PlanTarget, athlete: RecipientInfo, included: Set<number>): AssignPreviewAthlete {
  const last = target.conflicts.reduce<ExistingReceipt | null>(
    (acc, r) => (!acc || r.end_date > acc.end_date ? r : acc),
    null,
  );
  return {
    id: String(athlete.id),
    name: athlete.name,
    conflict: last
      ? { program_name: last.program_name, start_date: last.start_date, end_date: last.end_date, count: target.conflicts.length }
      : null,
    action: target.action,
    start_date: target.start_date,
    end_date: target.end_date,
    plan_end: target.rest.at(-1)?.end_date ?? target.end_date,
    programs: target.program ? 1 + target.rest.length : 0,
    program: target.program ? { id: String(target.program.id), name: target.program.name } : null,
    start_week: target.start_week,
    blocked: target.blocked,
    lifecycle: athlete.lifecycle,
    pair_partner: athlete.partner
      ? { id: String(athlete.partner.id), name: athlete.partner.name, included: included.has(athlete.partner.id) }
      : null,
  };
}

export function sessionsFrom(program: ProgramInfo | null, start_week: number | null): number {
  if (!program || start_week == null) return 0;
  return program.sessions_by_week.slice(start_week - 1).reduce((a, b) => a + b, 0);
}

export function buildPreview(input: {
  targets: PlanTarget[];
  recipients: RecipientInfo[];
  program: ProgramInfo | null;
  group: { id: number; name: string } | null;
  start: string;
  start_week: number;
  /** Los programas que siguen al de entrada (al entrar en un grupo). */
  rest?: PlanStep[];
}): AssignPreview {
  const byId = new Map(input.recipients.map((r) => [r.id, r]));
  const included = new Set(input.recipients.map((r) => r.id));
  const athletes = input.targets.map((t) => previewAthlete(t, byId.get(t.athlete_id)!, included));
  const counts = { total: athletes.length, assign: 0, chain: 0, replace: 0, skip: 0, blocked: 0, adopt: 0 };
  for (const a of athletes) counts[a.action] += 1;
  const rest = input.rest ?? [];
  const entryWeeks = input.program ? input.program.weeks - input.start_week + 1 : 0;
  const weeks = entryWeeks + rest.reduce((n, r) => n + r.weeks, 0);
  const sessions =
    sessionsFrom(input.program, input.program ? input.start_week : null) +
    rest.reduce((n, r) => n + sessionsFrom(r.program, 1), 0);
  return {
    program: input.program ? { id: String(input.program.id), name: input.program.name, weeks: input.program.weeks } : null,
    group: input.group ? { id: String(input.group.id), name: input.group.name } : null,
    start_date: input.start,
    end_date: weeks > 0 ? windowEnd(input.start, weeks) : isoDateString(addDays(parseIsoDate(input.start), 6)),
    weeks,
    sessions_per_athlete: sessions,
    dropped_sessions: [
      ...droppedFrom(input.program, input.program ? input.start_week : null),
      ...rest.flatMap((r) => droppedFrom(r.program, 1)),
    ].map((d) => ({
      week_number: d.week_number,
      session_lost: d.session_lost,
      message: describeDrop(d),
    })),
    athletes,
    counts,
  };
}

// ── Idempotencia ─────────────────────────────────────────────────────────────

export function requestHash(input: {
  kind: 'assign' | 'group_join';
  coach_id: number;
  program_id: number | null;
  sequence_id: number | null;
  athlete_ids: number[];
  start: string;
  start_week: number | null;
  start_position: number | null;
  delivery: WeekDelivery;
  on_conflict: OnConflict;
}): string {
  const canonical = JSON.stringify({ ...input, athlete_ids: [...input.athlete_ids].sort((a, b) => a - b) });
  return createHash('sha256').update(canonical).digest('hex');
}
