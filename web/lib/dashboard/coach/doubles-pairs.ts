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
import { linkSubscriptionPartners } from '@/lib/partner/invitations';

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
  /** The user account behind this athlete — the axis we drive users.partner_id on. */
  user_id: bigint;
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
      user_id: string;
      level_id: string | null;
      level_name: string | null;
      training_days_per_week: number | null;
    }[]
  >`
    select a.id::text as athlete_id,
           a.user_id::text as user_id,
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
    user_id: BigInt(row.user_id),
    level_id: row.level_id == null ? null : Number(row.level_id),
    level_name: row.level_name,
    training_days_per_week: row.training_days_per_week,
  };
}

// ---------------------------------------------------------------------------
// EJE ÚNICO — account-link cleanup (2 of the 3 axes).
//
// The pair (doubles_pairs) is the TRAINING axis; the account link is
// users.partner_id (0021/0026, at-most-one bidirectional) + the billing mirror
// subscriptions.partner_user_id. When a pair goes away, BOTH account axes must
// clear so the invariant "active doubles_pairs ⟺ users.partner_id both ways"
// holds. This is THE single site for that cleanup — dissolve (coach) and the
// athlete-self unlink both call it, so the 3-axis teardown lives in ONE place
// (the caller flips doubles_pairs.status with its own scoping; this clears the
// other two). workout_executions (joint history) is CONSERVED — never touched.
// ---------------------------------------------------------------------------

async function clearPairAccountLinks(
  tx: TransactionClient,
  userA: bigint,
  userB: bigint,
): Promise<void> {
  await tx`
    update users set partner_id = null
    where id in (${userA}, ${userB})
  `;
  await tx`
    update subscriptions set partner_user_id = null, updated_at = now()
    where user_id in (${userA}, ${userB})
      and partner_user_id in (${userA}, ${userB})
  `;
}

/**
 * Resolve the two athletes' user_ids (no coach scoping — the pair row already
 * establishes ownership). Returns null if either athlete row is missing (should
 * not happen: doubles_pairs FKs athletes on delete cascade).
 */
async function resolveAthleteUserIds(
  tx: TransactionClient,
  athleteAId: number,
  athleteBId: number,
): Promise<{ aUser: bigint; bUser: bigint } | null> {
  const rows = await tx<{ athlete_id: string; user_id: string }[]>`
    select id::text as athlete_id, user_id::text as user_id
    from athletes
    where id in (${athleteAId}, ${athleteBId})
  `;
  const a = rows.find((r) => Number(r.athlete_id) === athleteAId);
  const b = rows.find((r) => Number(r.athlete_id) === athleteBId);
  if (!a || !b) return null;
  return { aUser: BigInt(a.user_id), bUser: BigInt(b.user_id) };
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

    // EJE ÚNICO — drive the ACCOUNT axis from the training pair. After the pair
    // exists, set users.partner_id BOTH ways for the two athletes' user accounts
    // so "active doubles_pairs ⟺ users.partner_id both ways" holds.
    const aUser = a.user_id;
    const bUser = b.user_id;

    // GUARD (before setting): respect users_partner_id_unique (0026, at-most-one
    // bidirectional). Reject if EITHER user already has a partner_id pointing at a
    // DIFFERENT user — an idempotent re-link (already pointing at each other) is
    // fine and falls through to the no-op updates below.
    const partnerRows = await tx<{ id: string; partner_id: string | null }[]>`
      select id::text as id, partner_id::text as partner_id
      from users
      where id in (${aUser}, ${bUser})
    `;
    for (const r of partnerRows) {
      if (r.partner_id == null) continue;
      const uid = BigInt(r.id);
      const currentPartner = BigInt(r.partner_id);
      const expectedPartner = uid === aUser ? bUser : aUser;
      if (currentPartner !== expectedPartner) {
        throw new DoublesPairError(
          'already_paired',
          'Uno de los atletas ya está vinculado a otra cuenta de pareja.',
          409,
        );
      }
    }

    await tx`update users set partner_id = ${bUser} where id = ${aUser}`;
    await tx`update users set partner_id = ${aUser} where id = ${bUser}`;

    // Mirror the billing link (subscriptions.partner_user_id) when a Dobles sub
    // exists — best-effort: a billing hiccup must not roll back the pair. No-op
    // when neither side has an eligible subscription yet (webhook backfills it).
    try {
      await linkSubscriptionPartners(tx, aUser, bUser);
    } catch (err) {
      console.warn(
        'createDoublesPair: linkSubscriptionPartners failed (best-effort)',
        err,
      );
    }

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
// dissolveDoublesPair — mark an active pair dissolved (coach-owned) AND clear
// the account link, in ONE transaction, so all three axes stay coherent:
//   1. doubles_pairs.status → 'dissolved'   (training)
//   2. users.partner_id → null (both sides) (account)  ┐ via clearPairAccountLinks
//   3. subscriptions.partner_user_id → null (billing)  ┘
//
// We do NOT touch either athlete's existing plan/progress, nor their
// workout_executions: dissolving the pair only ends the coordination; each
// athlete keeps whatever was already assigned and every joint session already
// logged is CONSERVED (the same posture as un-pairing in any coaching tool —
// the work, and its shared history, stands).
// ---------------------------------------------------------------------------

export async function dissolveDoublesPair(params: {
  coach_id: number | bigint;
  pair_id: number;
  client?: Sql;
}): Promise<void> {
  const client = params.client ?? defaultSql;
  await client.begin(async (tx) => {
    const rows = await tx<{ id: string; a: string; b: string }[]>`
      update doubles_pairs
      set status = 'dissolved', updated_at = now()
      where id = ${params.pair_id}
        and coach_id = ${String(params.coach_id)}
        and status = 'active'
      returning id::text as id, athlete_a_id::text as a, athlete_b_id::text as b
    `;
    const row = rows[0];
    if (!row) {
      throw new DoublesPairError(
        'pair_not_found',
        'Pareja activa no encontrada para este coach.',
        404,
      );
    }
    const users = await resolveAthleteUserIds(tx, Number(row.a), Number(row.b));
    if (users) {
      await clearPairAccountLinks(tx, users.aUser, users.bUser);
    }
  });
}

// ---------------------------------------------------------------------------
// unlinkDoublesPairForAthlete — the UNIFIED, athlete-initiated un-pair. Clears
// all three axes for the CALLER's own pair, in ONE transaction:
//   1. dissolve the caller's active doubles_pairs (if present)          (training)
//   2. users.partner_id → null (both sides)                            (account)
//   3. subscriptions.partner_user_id → null (both sides)               (billing)
//
// It resolves the pair via active-membership on either column AND falls back to
// users.partner_id, so it also heals a lingering account link with no active
// pair. workout_executions (joint history) is CONSERVED — untouched. Forward
// pair surfaces stop showing the partner because they resolve through the now
// absent active pair / cleared partner_id.
// ---------------------------------------------------------------------------

export interface AthleteUnlinkResult {
  /** The doubles_pairs row we dissolved, or null when there was no active pair. */
  dissolved_pair_id: number | null;
  /** True when we cleared an account link (users.partner_id) on both sides. */
  cleared_partner: boolean;
  self_user_id: string;
  partner_user_id: string | null;
}

export async function unlinkDoublesPairForAthlete(params: {
  athlete_id: number | bigint;
  user_id: number | bigint;
  client?: Sql;
}): Promise<AthleteUnlinkResult> {
  const client = params.client ?? defaultSql;
  const selfAthleteId = Number(params.athlete_id);
  const selfUserId = BigInt(params.user_id);

  return await client.begin(async (tx) => {
    // 1) Dissolve the caller's active pair (either column), row-locked so a
    //    concurrent op can't double-act.
    const pairRows = await tx<{ id: string; a: string; b: string }[]>`
      select id::text as id, athlete_a_id::text as a, athlete_b_id::text as b
      from doubles_pairs
      where status = 'active'
        and (athlete_a_id = ${selfAthleteId} or athlete_b_id = ${selfAthleteId})
      for update
    `;

    let dissolvedPairId: number | null = null;
    let aUser: bigint | null = null;
    let bUser: bigint | null = null;

    const pair = pairRows[0];
    if (pair) {
      await tx`
        update doubles_pairs set status = 'dissolved', updated_at = now()
        where id = ${Number(pair.id)}
      `;
      dissolvedPairId = Number(pair.id);
      const users = await resolveAthleteUserIds(tx, Number(pair.a), Number(pair.b));
      if (users) {
        aUser = users.aUser;
        bUser = users.bUser;
      }
    }

    // 2) Fall back to the account link when the pair didn't resolve both user
    //    ids (e.g. a lingering partner_id with no active pair) — clear it too.
    if (aUser == null || bUser == null) {
      const urows = await tx<{ partner_id: string | null }[]>`
        select partner_id::text as partner_id
        from users
        where id = ${selfUserId} and deleted_at is null
        limit 1
      `;
      const pid = urows[0]?.partner_id;
      if (pid) {
        aUser = selfUserId;
        bUser = BigInt(pid);
      }
    }

    let clearedPartner = false;
    let partnerUserId: bigint | null = null;
    if (aUser != null && bUser != null) {
      await clearPairAccountLinks(tx, aUser, bUser);
      clearedPartner = true;
      partnerUserId = aUser === selfUserId ? bUser : aUser;
    }

    return {
      dissolved_pair_id: dissolvedPairId,
      cleared_partner: clearedPartner,
      self_user_id: selfUserId.toString(),
      partner_user_id: partnerUserId == null ? null : partnerUserId.toString(),
    };
  });
}

// ---------------------------------------------------------------------------
// dissolvePairOnBaja — #13(dobles) BAJA teardown. When an athlete leaves the
// roster (bajaAthlete → lifecycle_status='baja'), DISSOLVE their active doubles
// pair across all three axes AND notify the surviving partner — INSIDE the
// caller's transaction. bajaAthlete runs its own `sql.begin` and passes that tx
// here (see athlete-lifecycle.ts, the `#13(dobles)` seam), so the state flip and
// the pair teardown commit or roll back atomically as one unit.
//
// This is the BAJA sibling of unlinkDoublesPairForAthlete (athlete self-unlink)
// and dissolveDoublesPair (coach). It performs the SAME 3-axis teardown, reusing
// the SAME single-site helper (clearPairAccountLinks) — NO duplication — keyed by
// the LEAVING athlete (membership on either column):
//
//   1. doubles_pairs.status → 'dissolved'              (training)
//   2. users.partner_id → null (both sides)            (account)   ┐ clearPairAccountLinks
//   3. subscriptions.partner_user_id → null (both)     (billing)   ┘
//   4. notify the SURVIVING partner (system / partner_left)
//
// Defensive: a no-op when the athlete is NOT in an active pair. History
// (workout_executions — the joint sessions) is CONSERVED: never touched, so BOTH
// athletes keep their shared record after the split (same posture as un-pairing).
//
// #15: the shared subscription still covers both — the billing split (one sub
// paying for two) is #15, NOT resolved here. We only unlink the mirror pointer
// (subscriptions.partner_user_id); who keeps paying / how the plan re-prices is
// #15's seam.
// ---------------------------------------------------------------------------

export async function dissolvePairOnBaja(
  athlete_id: bigint,
  tx: TransactionClient,
): Promise<void> {
  const selfAthleteId = Number(athlete_id);

  // The leaving athlete's active pair (either column), row-locked so a concurrent
  // teardown can't double-act. Defensive no-op when there is none.
  const pairRows = await tx<{ id: string; a: string; b: string }[]>`
    select id::text as id, athlete_a_id::text as a, athlete_b_id::text as b
    from doubles_pairs
    where status = 'active'
      and (athlete_a_id = ${selfAthleteId} or athlete_b_id = ${selfAthleteId})
    for update
  `;
  const pair = pairRows[0];
  if (!pair) return; // not in an active pair — nothing to dissolve

  // 1) Training axis → dissolved.
  await tx`
    update doubles_pairs set status = 'dissolved', updated_at = now()
    where id = ${Number(pair.id)}
  `;

  // 2+3) Account + billing axes → cleared BOTH ways via the ONE shared teardown
  //      helper (same site as coach dissolve + athlete self-unlink). Joint history
  //      (workout_executions) is CONSERVED — clearPairAccountLinks never touches it.
  const users = await resolveAthleteUserIds(tx, Number(pair.a), Number(pair.b));
  if (!users) return; // athlete row vanished (FK cascade) — nothing left to clear

  await clearPairAccountLinks(tx, users.aUser, users.bUser);

  // 4) Notify the SURVIVING partner (the OTHER user) that the pairing ended, using
  //    the canonical 'system' + kind:'partner_left' contract (same as the account-
  //    deletion path, lib/athlete/account-deletion.ts) so the iOS inbox renders the
  //    existing "tu pareja ya no está" copy without introducing a new kind.
  const leavingUser = selfAthleteId === Number(pair.a) ? users.aUser : users.bUser;
  const survivingUser = selfAthleteId === Number(pair.a) ? users.bUser : users.aUser;
  const payload = {
    kind: 'partner_left',
    former_partner_user_id: leavingUser.toString(),
  };
  await tx`
    insert into notifications (user_id, type, payload_json)
    values (
      ${survivingUser}::bigint,
      'system'::notification_type,
      ${tx.json(payload)}
    )
  `;
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
