import 'server-only';

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  SEQUENCE_DAYS_MIN,
  SEQUENCE_DAYS_MAX,
} from '@fahybrid/shared/schema/program-sequences';
import {
  assignSequenceToAthlete,
  AssignSequenceError,
  type AssignSequenceResult,
} from './assign-sequence';

// =============================================================================
// DOUBLES PAIRS — coach-created HYROX Dobles training pair.
//
// A pair links two of the coach's athletes who train the SAME plan at the SAME
// (level, days). It is a COORDINATOR over the EXISTING per-athlete pipeline, not
// a parallel plan store: assigning a plan to a pair calls assignSequenceToAthlete
// for EACH athlete, so each gets their own dated workout_assignments + their own
// athlete_sequence_progress cursor, each at their OWN intensity (the zone resolver
// translates the shared structure into per-athlete numbers downstream). The pair
// only guarantees both athletes resolve to the SAME (level, days) sequence cell.
//
// Distinct from users.partner_id / partner_invitations (0021) — that is the
// athlete-initiated BILLING/social pairing. This is the coach-driven TRAINING
// pairing. We do NOT touch the billing model here.
// =============================================================================

export class DoublesPairError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'DoublesPairError';
  }
}

// ---------------------------------------------------------------------------
// Shared row shapes.
// ---------------------------------------------------------------------------

export interface DoublesPairAthlete {
  athlete_id: number;
  full_name: string;
  level_id: number | null;
  level_name: string | null;
  training_days_per_week: number | null;
  /** Has an active sequence enrollment (a live plan) right now. */
  has_active_plan: boolean;
}

export interface DoublesPair {
  id: number;
  coach_id: number;
  level_id: number | null;
  level_name: string | null;
  training_days_per_week: number | null;
  status: 'active' | 'dissolved';
  created_at: string;
  athlete_a: DoublesPairAthlete;
  athlete_b: DoublesPairAthlete;
}

// ---------------------------------------------------------------------------
// Athlete loader (coach-owned, with the classification fields we reconcile on).
// ---------------------------------------------------------------------------

interface OwnedAthlete {
  athlete_id: number;
  level_id: number | null;
  level_name: string | null;
  training_days_per_week: number | null;
}

async function loadOwnedAthlete(
  athleteId: number,
  coachId: number | bigint,
  client: Sql | TransactionClient,
): Promise<OwnedAthlete> {
  const rows = await client<
    {
      athlete_id: string;
      level_id: string | null;
      level_name: string | null;
      training_days_per_week: number | null;
    }[]
  >`
    select a.id::text as athlete_id,
           a.level_id::text as level_id,
           al.name as level_name,
           a.training_days_per_week
    from athletes a
    left join athlete_levels al on al.id = a.level_id
    where a.id = ${athleteId} and a.coach_id = ${String(coachId)}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    throw new DoublesPairError(
      'athlete_not_found',
      'Atleta no encontrado para este coach.',
      404,
    );
  }
  return {
    athlete_id: Number(row.athlete_id),
    level_id: row.level_id == null ? null : Number(row.level_id),
    level_name: row.level_name,
    training_days_per_week: row.training_days_per_week,
  };
}

// ---------------------------------------------------------------------------
// Reconcile the shared (level, days) for the pair.
//
// Rule (from the closed model — "mismo nivel, mismos días"):
//   · both set & EQUAL    → use it.
//   · both set & DIFFERENT → reject (the coach must align them first).
//   · exactly one set      → adopt the set one as the shared value (and write it
//                            onto the unset athlete, so both resolve identically).
//   · both null            → null (pair can form pre-classification; the assign
//                            call gates on a resolvable sequence, same as solo).
// `days`, when set, must sit in the 3-6 sequence band.
// ---------------------------------------------------------------------------

function reconcileShared<T extends number>(
  a: T | null,
  b: T | null,
  label: string,
): T | null {
  if (a != null && b != null) {
    if (a !== b) {
      throw new DoublesPairError(
        'mismatch',
        `Los dos atletas tienen distinto ${label}. Una pareja entrena al mismo ${label}; alinéalos antes de vincular.`,
        409,
      );
    }
    return a;
  }
  return a ?? b ?? null;
}

interface ReconciledShared {
  level_id: number | null;
  training_days_per_week: number | null;
}

function reconcilePair(a: OwnedAthlete, b: OwnedAthlete): ReconciledShared {
  const level_id = reconcileShared(a.level_id, b.level_id, 'nivel');
  const days = reconcileShared(
    a.training_days_per_week,
    b.training_days_per_week,
    'número de días',
  );
  if (
    days != null &&
    (days < SEQUENCE_DAYS_MIN || days > SEQUENCE_DAYS_MAX)
  ) {
    throw new DoublesPairError(
      'days_out_of_band',
      `Las parejas entrenan ${SEQUENCE_DAYS_MIN}-${SEQUENCE_DAYS_MAX} días/semana.`,
      409,
    );
  }
  return { level_id, training_days_per_week: days };
}

// ---------------------------------------------------------------------------
// createDoublesPair — link two of the coach's athletes.
//
// All inside ONE transaction (row-locked membership read) so two concurrent
// links can't both pass the "not already paired" check and double-link.
// ---------------------------------------------------------------------------

export async function createDoublesPair(params: {
  coach_id: number | bigint;
  athlete_a_id: number;
  athlete_b_id: number;
  client?: Sql;
}): Promise<DoublesPair> {
  const client = params.client ?? defaultSql;
  const { coach_id } = params;

  if (params.athlete_a_id === params.athlete_b_id) {
    throw new DoublesPairError(
      'same_athlete',
      'Una pareja necesita dos atletas distintos.',
      400,
    );
  }

  // Canonical order: the unordered pair {a,b} has ONE representation (a<b) so the
  // table dedupes (a,b)==(b,a) and the active-membership uniques are stable.
  const [lo, hi] = [params.athlete_a_id, params.athlete_b_id].sort(
    (x, y) => x - y,
  );
  const aId = lo!;
  const bId = hi!;

  const pairId = await client.begin(async (tx) => {
    // Both athletes must belong to THIS coach (404 otherwise).
    const a = await loadOwnedAthlete(aId, coach_id, tx);
    const b = await loadOwnedAthlete(bId, coach_id, tx);

    // Neither athlete may already be in an active pair (either column). Locked
    // for the duration of the tx so a concurrent link blocks here.
    const conflicts = await tx<{ id: string }[]>`
      select id::text from doubles_pairs
      where status = 'active'
        and (athlete_a_id in (${aId}, ${bId}) or athlete_b_id in (${aId}, ${bId}))
      for update
    `;
    if (conflicts.length > 0) {
      throw new DoublesPairError(
        'already_paired',
        'Uno de los atletas ya está en una pareja activa.',
        409,
      );
    }

    const shared = reconcilePair(a, b);

    // Align both athletes onto the shared (level, days) when one side filled a
    // gap on the other — so the resolver materializes the SAME sequence cell for
    // both. We only WRITE when a value actually changes (no-op otherwise).
    if (shared.level_id != null) {
      await tx`
        update athletes set level_id = ${shared.level_id}
        where id in (${aId}, ${bId}) and (level_id is distinct from ${shared.level_id})
      `;
    }
    if (shared.training_days_per_week != null) {
      await tx`
        update athletes set training_days_per_week = ${shared.training_days_per_week}
        where id in (${aId}, ${bId})
          and (training_days_per_week is distinct from ${shared.training_days_per_week})
      `;
    }

    const inserted = await tx<{ id: string }[]>`
      insert into doubles_pairs
        (coach_id, athlete_a_id, athlete_b_id, level_id, training_days_per_week, status)
      values
        (${String(coach_id)}, ${aId}, ${bId},
         ${shared.level_id}, ${shared.training_days_per_week}, 'active')
      returning id::text
    `;
    return Number(inserted[0]!.id);
  });

  const pair = await loadPairById(pairId, coach_id, client);
  if (!pair) {
    // Should never happen (we just inserted it) — surface loudly rather than null.
    throw new DoublesPairError('pair_not_found', 'No se pudo cargar la pareja.', 500);
  }
  return pair;
}

// ---------------------------------------------------------------------------
// dissolveDoublesPair — mark an active pair dissolved (coach-owned).
//
// We do NOT touch either athlete's existing plan/progress: dissolving the pair
// only ends the coordination; each athlete keeps whatever was already assigned
// (the same posture as un-pairing in any coaching tool — the work stands).
// ---------------------------------------------------------------------------

export async function dissolveDoublesPair(params: {
  coach_id: number | bigint;
  pair_id: number;
  client?: Sql;
}): Promise<void> {
  const client = params.client ?? defaultSql;
  const rows = await client<{ id: string }[]>`
    update doubles_pairs
    set status = 'dissolved', updated_at = now()
    where id = ${params.pair_id}
      and coach_id = ${String(params.coach_id)}
      and status = 'active'
    returning id::text
  `;
  if (rows.length === 0) {
    throw new DoublesPairError(
      'pair_not_found',
      'Pareja activa no encontrada para este coach.',
      404,
    );
  }
}

// ---------------------------------------------------------------------------
// assignSequenceToPair — ONE call → materialize the plan for BOTH athletes.
//
// Reuses assignSequenceToAthlete verbatim per athlete: since the pair aligned
// both onto the same (level, days), they resolve to the SAME program_sequence
// cell → the same microciclo template → each materialized at their OWN intensity.
//
// We assign sequentially (a, then b) so a resolution failure on the FIRST athlete
// surfaces before we touch the second (don't half-assign on a bad cell). If the
// first succeeds and the second fails, the error propagates with the second
// athlete's reason; the first athlete's materialization stands (idempotent
// re-assign makes a retry safe — the first is a no-op the second time).
// ---------------------------------------------------------------------------

export interface AssignPairResult {
  pair_id: number;
  athlete_a: { athlete_id: number; result: AssignSequenceResult };
  athlete_b: { athlete_id: number; result: AssignSequenceResult };
}

export async function assignSequenceToPair(params: {
  coach_id: number | bigint;
  pair_id: number;
  start_date?: string;
  client?: Sql;
}): Promise<AssignPairResult> {
  const client = params.client ?? defaultSql;
  const pair = await loadPairById(params.pair_id, params.coach_id, client);
  if (!pair || pair.status !== 'active') {
    throw new DoublesPairError(
      'pair_not_found',
      'Pareja activa no encontrada para este coach.',
      404,
    );
  }

  // assignSequenceToAthlete throws AssignSequenceError on a non-resolvable cell;
  // re-wrap nothing — the route maps AssignSequenceError directly too. We pass the
  // SAME start_date to both so the pair starts the plan on the same Monday.
  const resultA = await assignSequenceToAthlete(
    pair.athlete_a.athlete_id,
    params.coach_id,
    params.start_date,
    client,
  );
  const resultB = await assignSequenceToAthlete(
    pair.athlete_b.athlete_id,
    params.coach_id,
    params.start_date,
    client,
  );

  return {
    pair_id: pair.id,
    athlete_a: { athlete_id: pair.athlete_a.athlete_id, result: resultA },
    athlete_b: { athlete_id: pair.athlete_b.athlete_id, result: resultB },
  };
}

export { AssignSequenceError };

// ---------------------------------------------------------------------------
// Readers.
// ---------------------------------------------------------------------------

interface PairRow {
  id: string;
  coach_id: string;
  level_id: string | null;
  level_name: string | null;
  training_days_per_week: number | null;
  status: 'active' | 'dissolved';
  created_at: string;
  a_id: string;
  a_name: string;
  a_level_id: string | null;
  a_level_name: string | null;
  a_days: number | null;
  a_has_plan: boolean;
  b_id: string;
  b_name: string;
  b_level_id: string | null;
  b_level_name: string | null;
  b_days: number | null;
  b_has_plan: boolean;
}

const PAIR_SELECT = (client: Sql) => client`
  select
    p.id::text as id,
    p.coach_id::text as coach_id,
    p.level_id::text as level_id,
    pl.name as level_name,
    p.training_days_per_week,
    p.status,
    to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as created_at,
    a.id::text as a_id, a.full_name as a_name,
    a.level_id::text as a_level_id, al.name as a_level_name,
    a.training_days_per_week as a_days,
    exists(select 1 from athlete_sequence_progress sp
           where sp.athlete_id = a.id and sp.status = 'active') as a_has_plan,
    b.id::text as b_id, b.full_name as b_name,
    b.level_id::text as b_level_id, bl.name as b_level_name,
    b.training_days_per_week as b_days,
    exists(select 1 from athlete_sequence_progress sp
           where sp.athlete_id = b.id and sp.status = 'active') as b_has_plan
  from doubles_pairs p
  join athletes a on a.id = p.athlete_a_id
  join athletes b on b.id = p.athlete_b_id
  left join athlete_levels pl on pl.id = p.level_id
  left join athlete_levels al on al.id = a.level_id
  left join athlete_levels bl on bl.id = b.level_id
`;

function rowToPair(r: PairRow): DoublesPair {
  return {
    id: Number(r.id),
    coach_id: Number(r.coach_id),
    level_id: r.level_id == null ? null : Number(r.level_id),
    level_name: r.level_name,
    training_days_per_week: r.training_days_per_week,
    status: r.status,
    created_at: r.created_at,
    athlete_a: {
      athlete_id: Number(r.a_id),
      full_name: r.a_name,
      level_id: r.a_level_id == null ? null : Number(r.a_level_id),
      level_name: r.a_level_name,
      training_days_per_week: r.a_days,
      has_active_plan: r.a_has_plan,
    },
    athlete_b: {
      athlete_id: Number(r.b_id),
      full_name: r.b_name,
      level_id: r.b_level_id == null ? null : Number(r.b_level_id),
      level_name: r.b_level_name,
      training_days_per_week: r.b_days,
      has_active_plan: r.b_has_plan,
    },
  };
}

async function loadPairById(
  pairId: number,
  coachId: number | bigint,
  client: Sql,
): Promise<DoublesPair | null> {
  const rows = await client<PairRow[]>`
    ${PAIR_SELECT(client)}
    where p.id = ${pairId} and p.coach_id = ${String(coachId)}
    limit 1
  `;
  const row = rows[0];
  return row ? rowToPair(row) : null;
}

/** All ACTIVE pairs for a coach (roster display). Newest first. */
export async function listDoublesPairsForCoach(
  coachId: number | bigint,
  client: Sql = defaultSql,
): Promise<DoublesPair[]> {
  const rows = await client<PairRow[]>`
    ${PAIR_SELECT(client)}
    where p.coach_id = ${String(coachId)} and p.status = 'active'
    order by p.created_at desc
  `;
  return rows.map(rowToPair);
}

/**
 * The active pair an athlete belongs to (membership on either column), WITHOUT
 * coach scoping — this is the athlete-side resolver behind /api/athlete/partner.
 * Returns the pair plus which side the given athlete is (so the caller can pick
 * the OTHER athlete as the partner).
 */
export async function getActiveDoublesPairForAthlete(
  athleteId: number | bigint,
  client: Sql = defaultSql,
): Promise<{ pair_id: number; self_id: number; partner_id: number } | null> {
  const rows = await client<{ id: string; a: string; b: string }[]>`
    select id::text as id, athlete_a_id::text as a, athlete_b_id::text as b
    from doubles_pairs
    where status = 'active'
      and (athlete_a_id = ${Number(athleteId)} or athlete_b_id = ${Number(athleteId)})
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const self = Number(athleteId);
  const a = Number(row.a);
  const b = Number(row.b);
  return { pair_id: Number(row.id), self_id: self, partner_id: self === a ? b : a };
}
