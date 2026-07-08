import 'server-only';

import { sql, type Sql } from '@/lib/db';
import { canTransition, type InjuryStatus } from '@fahybrid/shared/domain/coach/injury-taxonomy';
import type {
  InjuryCreateInput,
  InjuryUpdateInput,
  InjuryDTO,
  InjuryUpdateDTO,
} from '@fahybrid/shared/schema/injuries';

// Injury lifecycle service (#16). One `injuries` row per episode + an
// `injury_updates` timeline. Registration is athlete OR coach; status
// transitions are validated against the canonical state machine.

const INJURY_COLS = `
  id::text as id, zone, type, severity, status,
  onset_date::text as onset_date, resolved_date::text as resolved_date,
  expected_return::text as expected_return, registered_by, note,
  pause_id::text as pause_id, updated_at
`;

interface RawInjury {
  id: string; zone: InjuryDTO['zone']; type: string | null;
  severity: InjuryDTO['severity']; status: InjuryStatus;
  onset_date: string; resolved_date: string | null; expected_return: string | null;
  registered_by: 'athlete' | 'coach'; note: string | null;
  pause_id: string | null; updated_at: Date;
}

function toDTO(r: RawInjury, updates: InjuryUpdateDTO[] = []): InjuryDTO {
  return {
    id: r.id, zone: r.zone, type: r.type, severity: r.severity, status: r.status,
    onset_date: r.onset_date, resolved_date: r.resolved_date, expected_return: r.expected_return,
    registered_by: r.registered_by, note: r.note, pause_id: r.pause_id,
    updated_at: r.updated_at.toISOString(), updates,
  };
}

export class InjuryError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'InjuryError';
  }
}

/** Register a new injury episode. `registered_by` = who is creating it. */
export async function createInjury(
  athleteId: bigint,
  registeredBy: 'athlete' | 'coach',
  input: InjuryCreateInput,
  client: Sql = sql,
): Promise<InjuryDTO> {
  const rows = await client<RawInjury[]>`
    insert into injuries (athlete_id, zone, severity, type, note, registered_by, onset_date)
    values (
      ${athleteId}, ${input.zone}, ${input.severity}, ${input.type ?? null}, ${input.note ?? null},
      ${registeredBy}, ${input.onset_date ?? null}::date
    )
    returning ${client.unsafe(INJURY_COLS)}
  `;
  return toDTO(rows[0]!);
}

/** List an athlete's injuries (newest first), each with its update timeline. */
export async function listInjuries(athleteId: bigint, client: Sql = sql): Promise<InjuryDTO[]> {
  const injuries = await client<RawInjury[]>`
    select ${client.unsafe(INJURY_COLS)}
    from injuries where athlete_id = ${athleteId}
    order by (status in ('activa','en_recuperacion')) desc, onset_date desc, id desc
  `;
  if (injuries.length === 0) return [];
  const ids = injuries.map((i) => BigInt(i.id));
  const updates = await client<
    { id: string; injury_id: string; status: InjuryStatus | null; note: string | null; recorded_by: 'athlete' | 'coach'; recorded_at: Date }[]
  >`
    select id::text as id, injury_id::text as injury_id, status, note, recorded_by, recorded_at
    from injury_updates where injury_id in ${client(ids)}
    order by recorded_at asc
  `;
  const byInjury = new Map<string, InjuryUpdateDTO[]>();
  for (const u of updates) {
    const arr = byInjury.get(u.injury_id) ?? [];
    arr.push({ id: u.id, status: u.status, note: u.note, recorded_by: u.recorded_by, recorded_at: u.recorded_at.toISOString() });
    byInjury.set(u.injury_id, arr);
  }
  return injuries.map((i) => toDTO(i, byInjury.get(i.id) ?? []));
}

/** The athlete's currently-open injuries (activa/en_recuperacion) — drives badges + readiness context. */
export async function openInjuries(athleteId: bigint, client: Sql = sql): Promise<InjuryDTO[]> {
  const rows = await client<RawInjury[]>`
    select ${client.unsafe(INJURY_COLS)} from injuries
    where athlete_id = ${athleteId} and status in ('activa','en_recuperacion')
    order by onset_date desc
  `;
  return rows.map((r) => toDTO(r));
}

/**
 * Update an injury: an optional status transition (validated) + a timeline entry.
 * Any caller-supplied note/severity/expected_return is applied; a resolved status
 * stamps resolved_date. Records ONE injury_updates row capturing the change.
 */
export async function updateInjury(
  injuryId: bigint,
  athleteId: bigint,
  recordedBy: 'athlete' | 'coach',
  input: InjuryUpdateInput,
  client: Sql = sql,
): Promise<InjuryDTO> {
  return await client.begin(async (tx) => {
    const cur = (await tx<RawInjury[]>`
      select ${tx.unsafe(INJURY_COLS)} from injuries
      where id = ${injuryId} and athlete_id = ${athleteId} limit 1 for update
    `)[0];
    if (!cur) throw new InjuryError('not_found', 'Lesión no encontrada', 404);

    if (input.status && input.status !== cur.status && !canTransition(cur.status, input.status)) {
      throw new InjuryError('invalid_transition', `No se puede pasar de ${cur.status} a ${input.status}`, 409);
    }

    const newStatus = input.status ?? cur.status;
    const resolvedDate =
      newStatus === 'resuelta'
        ? (input.resolved_date ?? cur.resolved_date ?? new Date().toISOString().slice(0, 10))
        : null;

    const updated = (await tx<RawInjury[]>`
      update injuries set
        status = ${newStatus},
        severity = coalesce(${input.severity ?? null}::injury_severity, severity),
        expected_return = ${input.expected_return === undefined ? cur.expected_return : input.expected_return}::date,
        resolved_date = ${resolvedDate}::date,
        updated_at = now()
      where id = ${injuryId}
      returning ${tx.unsafe(INJURY_COLS)}
    `)[0]!;

    await tx`
      insert into injury_updates (injury_id, status, note, recorded_by)
      values (${injuryId}, ${input.status ?? null}::injury_status, ${input.note ?? null}, ${recordedBy})
    `;

    const updates = await tx<
      { id: string; status: InjuryStatus | null; note: string | null; recorded_by: 'athlete' | 'coach'; recorded_at: Date }[]
    >`
      select id::text as id, status, note, recorded_by, recorded_at
      from injury_updates where injury_id = ${injuryId} order by recorded_at asc
    `;
    return toDTO(updated, updates.map((u) => ({ id: u.id, status: u.status, note: u.note, recorded_by: u.recorded_by, recorded_at: u.recorded_at.toISOString() })));
  });
}

/** Resolve the athlete_id that owns an injury (for coach-side authorization). */
export async function injuryAthleteId(injuryId: bigint, client: Sql = sql): Promise<bigint | null> {
  const rows = await client<{ athlete_id: string }[]>`
    select athlete_id::text as athlete_id from injuries where id = ${injuryId} limit 1
  `;
  return rows[0] ? BigInt(rows[0].athlete_id) : null;
}

/**
 * Tag the athlete's scheduled assignments as injury-adapted (#16). This is the
 * adherence-non-penalty mechanism: 'rest' days are later excluded from the
 * adherence denominator; 'substituted'/'softened' still count via their
 * execution. Only the injury's own athlete's assignments are touched.
 */
export async function adaptSessions(
  injuryId: bigint,
  athleteId: bigint,
  adaptations: { assignment_id: number; adaptation: string }[],
  client: Sql = sql,
): Promise<number> {
  return await client.begin(async (tx) => {
    const inj = (await tx<{ id: string }[]>`
      select id::text as id from injuries where id = ${injuryId} and athlete_id = ${athleteId} limit 1
    `)[0];
    if (!inj) throw new InjuryError('not_found', 'Lesión no encontrada', 404);
    let n = 0;
    for (const a of adaptations) {
      const r = await tx`
        update workout_assignments
        set injury_id = ${injuryId}, injury_adaptation = ${a.adaptation}, updated_at = now()
        where id = ${a.assignment_id} and athlete_id = ${athleteId}
      `;
      n += r.count;
    }
    return n;
  });
}

/** True when `coachId` owns `athleteId` — coach-side authorization guard. */
export async function coachOwnsAthlete(
  coachId: bigint | number,
  athleteId: bigint,
  client: Sql = sql,
): Promise<boolean> {
  const rows = await client<{ id: string }[]>`
    select id::text as id from athletes where id = ${athleteId} and coach_id = ${Number(coachId)} limit 1
  `;
  return rows.length > 0;
}
