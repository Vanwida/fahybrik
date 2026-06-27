import 'server-only';

// STRENGTH / 1RM — the shared WRITE + READ path for athlete_strength_maxes (0076).
//
// The strength analog of lib/dashboard/v2/zone-{derivation,profile}: every entry
// that produces a 1RM goes through insertStrengthMaxVersion, so the version+1
// snapshot logic exists ONCE (DRY) and the entries never diverge:
//   · the athlete self-test   (/api/athlete/strength-test)              → athlete_test
//   · the coach test/override (/api/coach/athletes/[id]/strength-test)  → coach_test
//   · the onboarding seed     (onboarding/submit, version 1)            → onboarding
//
// Reads return the CURRENT (highest-version) max per lift, coach-scoped or
// athlete-derived, plus the full history for progression. The 1RM MATH lives in
// the shared domain (estimateOneRm); this is only the persistence around it.

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { OneRmMethod } from '@fahybrid/shared/domain/strength';
import {
  athleteStrengthMaxSchema,
  type AthleteStrengthMax,
  type StrengthMaxSource,
} from '@fahybrid/shared/schema/strength';

// One row from athlete_strength_maxes, joined to confirm coach ownership.
interface StrengthMaxRow {
  id: string;
  athlete_id: string;
  exercise_slug: string;
  one_rm_kg: number;
  source: string;
  test_weight_kg: number | null;
  test_reps: number | null;
  one_rm_method: string | null;
  needs_review: boolean;
  version: number;
  notes: string | null;
  // Returned as JS Date by the postgres driver (timestamptz, uncast) → .toISOString().
  recorded_at: Date;
  created_at: Date;
}

export interface InsertStrengthMaxParams {
  athlete_id: number;
  exercise_slug: string;
  one_rm_kg: number;
  source: StrengthMaxSource;
  // The test set this was estimated from. Null for a direct / onboarding entry.
  test_weight_kg: number | null;
  test_reps: number | null;
  // The coach formula used to estimate one_rm_kg. Null for a direct entry.
  one_rm_method: OneRmMethod | null;
  needs_review: boolean;
  notes?: string | null;
}

export interface InsertedStrengthMax {
  id: string;
  version: number;
  recorded_at: Date;
}

/**
 * Insert a new versioned strength max (version = max+1 for athlete×lift). The
 * select + insert run in one transaction so concurrent records don't collide the
 * unique (athlete, exercise_slug, version). EXACT mirror of insertZoneProfileVersion.
 */
export async function insertStrengthMaxVersion(
  params: InsertStrengthMaxParams,
  client: Sql = defaultSql,
): Promise<InsertedStrengthMax> {
  return client.begin(async (tx) => {
    const [{ next_version }] = await tx<{ next_version: number }[]>`
      select coalesce(max(version), 0) + 1 as next_version
      from athlete_strength_maxes
      where athlete_id = ${params.athlete_id} and exercise_slug = ${params.exercise_slug}
    `;
    const rows = await tx<InsertedStrengthMax[]>`
      insert into athlete_strength_maxes
        (athlete_id, exercise_slug, one_rm_kg, source, test_weight_kg, test_reps,
         one_rm_method, needs_review, version, notes)
      values (
        ${params.athlete_id}, ${params.exercise_slug}, ${params.one_rm_kg}, ${params.source},
        ${params.test_weight_kg}, ${params.test_reps}, ${params.one_rm_method},
        ${params.needs_review}, ${next_version}, ${params.notes ?? null}
      )
      returning id::text, version, recorded_at
    `;
    return rows[0];
  });
}

/**
 * The coach's 1RM estimation formula (coach_methodology.one_rm_estimation,
 * default Epley). Agnostic per coach — the math is canonical, the choice is theirs.
 */
export async function loadCoachOneRmMethod(client: Sql, coach_id: number): Promise<OneRmMethod> {
  const rows = await client<{ one_rm_estimation: string }[]>`
    select one_rm_estimation from coach_methodology where coach_id = ${coach_id} limit 1
  `;
  const v = rows[0]?.one_rm_estimation;
  return v === 'Epley' || v === 'Brzycki' || v === 'Lombardi' ? v : 'Epley';
}

/**
 * ATHLETE-side: the CURRENT (highest-version) max per lift for the authenticated
 * athlete, deriving the owning coach from `athletes.coach_id` (the athlete session
 * carries none). The join to athletes binds the row to its OWN coach_id, so there
 * is no cross-athlete leak. An athlete with no max yet yields an empty array.
 */
export async function loadStrengthMaxesForAthlete(params: {
  athlete_id: number | bigint;
  client?: Sql;
}): Promise<AthleteStrengthMax[]> {
  const client = params.client ?? defaultSql;
  const athlete_id = Number(params.athlete_id);

  const rows = await client<StrengthMaxRow[]>`
    select distinct on (sm.exercise_slug)
      sm.id::text,
      sm.athlete_id::text,
      sm.exercise_slug,
      sm.one_rm_kg::float8 as one_rm_kg,
      sm.source,
      sm.test_weight_kg::float8 as test_weight_kg,
      sm.test_reps,
      sm.one_rm_method,
      sm.needs_review,
      sm.version,
      sm.notes,
      sm.recorded_at,
      sm.created_at
    from athlete_strength_maxes sm
    join athletes a on a.id = sm.athlete_id and a.coach_id is not null
    where a.id = ${athlete_id}
    order by sm.exercise_slug, sm.version desc
  `;
  return parseStrengthRows(rows);
}

/**
 * COACH-scoped: the CURRENT max per lift for one athlete the coach owns (the
 * coach↔athlete join is the ownership gate). An athlete the coach doesn't own
 * yields an empty array.
 */
export async function loadStrengthMaxes(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<AthleteStrengthMax[]> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const athlete_id = params.athlete_id;

  const rows = await client<StrengthMaxRow[]>`
    select distinct on (sm.exercise_slug)
      sm.id::text,
      sm.athlete_id::text,
      sm.exercise_slug,
      sm.one_rm_kg::float8 as one_rm_kg,
      sm.source,
      sm.test_weight_kg::float8 as test_weight_kg,
      sm.test_reps,
      sm.one_rm_method,
      sm.needs_review,
      sm.version,
      sm.notes,
      sm.recorded_at,
      sm.created_at
    from athlete_strength_maxes sm
    join athletes a on a.id = sm.athlete_id
    where a.id = ${athlete_id} and a.coach_id = ${coach_id}
    order by sm.exercise_slug, sm.version desc
  `;
  return parseStrengthRows(rows);
}

/**
 * ALL versions for one athlete (oldest→newest per lift) — the progression history
 * the coach detail + athlete benchmarks screens read for deltas. Coach-ownership
 * is enforced via the same `a.coach_id is not null` join used athlete-side.
 */
export async function loadStrengthMaxHistory(params: {
  athlete_id: number | bigint;
  client?: Sql;
}): Promise<AthleteStrengthMax[]> {
  const client = params.client ?? defaultSql;
  const athlete_id = Number(params.athlete_id);

  const rows = await client<StrengthMaxRow[]>`
    select
      sm.id::text,
      sm.athlete_id::text,
      sm.exercise_slug,
      sm.one_rm_kg::float8 as one_rm_kg,
      sm.source,
      sm.test_weight_kg::float8 as test_weight_kg,
      sm.test_reps,
      sm.one_rm_method,
      sm.needs_review,
      sm.version,
      sm.notes,
      sm.recorded_at,
      sm.created_at
    from athlete_strength_maxes sm
    join athletes a on a.id = sm.athlete_id and a.coach_id is not null
    where a.id = ${athlete_id}
    order by sm.exercise_slug asc, sm.version asc
  `;
  return parseStrengthRows(rows);
}

/**
 * Seed onboarding 1RMs as version-1 rows INSIDE the onboarding transaction (the
 * `tx` is passed in — do NOT open a new one). Idempotent: a lift is seeded only
 * when the athlete has no max for it yet, so re-running onboarding never creates a
 * new version (and never clobbers a later athlete/coach test).
 */
export async function seedOnboardingStrengthMaxes(
  tx: Sql | TransactionClient,
  athlete_id: number,
  entries: { exercise_slug: string; one_rm_kg: number }[],
): Promise<void> {
  for (const entry of entries) {
    await tx`
      insert into athlete_strength_maxes
        (athlete_id, exercise_slug, one_rm_kg, source, test_weight_kg, test_reps,
         one_rm_method, needs_review, version)
      select ${athlete_id}, ${entry.exercise_slug}, ${entry.one_rm_kg}, 'onboarding',
             null, null, null, false, 1
      where not exists (
        select 1 from athlete_strength_maxes
        where athlete_id = ${athlete_id} and exercise_slug = ${entry.exercise_slug}
      )
    `;
  }
}

// Validate the raw rows into AthleteStrengthMax[]. A malformed stored row is
// skipped rather than crashing (the row was zod-validated on write). Mirrors
// parseProfileRows.
function parseStrengthRows(rows: StrengthMaxRow[]): AthleteStrengthMax[] {
  const out: AthleteStrengthMax[] = [];
  for (const r of rows) {
    const parsed = athleteStrengthMaxSchema.safeParse({
      id: r.id,
      athlete_id: r.athlete_id,
      exercise_slug: r.exercise_slug,
      one_rm_kg: r.one_rm_kg,
      source: r.source,
      test_weight_kg: r.test_weight_kg,
      test_reps: r.test_reps,
      one_rm_method: r.one_rm_method,
      needs_review: r.needs_review,
      version: r.version,
      notes: r.notes,
      recorded_at: r.recorded_at.toISOString(),
      created_at: r.created_at.toISOString(),
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
