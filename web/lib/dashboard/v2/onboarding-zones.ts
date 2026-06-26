import 'server-only';

// v2 · ONBOARDING → AUTO ZONE PROFILES — the connection service.
//
// Turns an athlete's onboarding benchmarks into per-modality zone profiles
// (source='onboarding_auto', needs_review=true), reusing the shared resolver
// (deriveZoneProfilesFromBenchmarks) and the shared write path
// (insertZoneProfileVersion). This is the missing twin of the level suggestion:
// the same benchmarks that already propose a training level now also seed zones,
// so the coach no longer has to re-register a test by hand for ritmos to resolve.
//
// RULES (a coach test always wins; idempotent):
//   · skip a modality whose CURRENT profile is a coach_test (don't clobber it).
//   · skip when the current onboarding_auto profile already has this threshold
//     (re-running the trigger/backfill is a no-op — no version spam).
//   · otherwise insert a new onboarding_auto version, pending coach review.
//   · no benchmark for a modality → no profile (honest, never fabricated).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  athleteBenchmarksFromSlugRows,
  deriveZoneProfilesFromBenchmarks,
} from '@fahybrid/shared/domain/methodology';
import {
  BENCH_RUN_5K,
  BENCH_ROW_2K,
  BENCH_SKI_1K,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { loadCoachZonesForUnit, insertZoneProfileVersion } from './zone-derivation';

// The canonical benchmark anchor per modality, used to attribute source_benchmark_id
// (a soft audit ref). Null when that exact row is absent (e.g. run derived from 10K).
const CANONICAL_ANCHOR_SLUG: Record<'run' | 'row' | 'ski', string> = {
  run: BENCH_RUN_5K,
  row: BENCH_ROW_2K,
  ski: BENCH_SKI_1K,
};

export interface OnboardingZonesResult {
  athlete_id: number;
  inserted: Array<{ modality: 'run' | 'row' | 'ski'; threshold_s: number }>;
  skipped: Array<{ modality: 'run' | 'row' | 'ski'; reason: 'real_test_wins' | 'unchanged' }>;
}

interface BenchmarkRow {
  id: string;
  exercise_slug: string;
  value: number;
}

interface CurrentProfileRow {
  source: string;
  threshold_s: number;
}

/**
 * Derive and store onboarding-auto zone profiles for ONE athlete. Coach-derived
 * from athletes.coach_id (no coach_id needed from the caller). Best-effort and
 * self-contained: an athlete with no coach, no benchmarks, or an incomplete coach
 * zone model simply yields an empty result.
 */
export async function deriveAndStoreOnboardingZones(params: {
  athlete_id: number;
  client?: Sql;
}): Promise<OnboardingZonesResult> {
  const client = params.client ?? defaultSql;
  const athlete_id = params.athlete_id;
  const result: OnboardingZonesResult = { athlete_id, inserted: [], skipped: [] };

  // Owning coach (the zone model is the coach's data). No coach → nothing to do.
  const [athlete] = await client<{ coach_id: string }[]>`
    select coach_id::text as coach_id
    from athletes
    where id = ${athlete_id} and coach_id is not null
    limit 1
  `;
  if (!athlete) return result;
  const coach_id = Number(athlete.coach_id);

  // The athlete's benchmark rows (onboarding + any later). Slug-keyed.
  const benchRows = await client<BenchmarkRow[]>`
    select id::text as id, exercise_slug, value::float8 as value
    from athlete_benchmarks
    where athlete_id = ${athlete_id}
  `;
  if (benchRows.length === 0) return result;

  const benchmarks = athleteBenchmarksFromSlugRows(benchRows);

  // Coach offset bands for both unit families (one query each).
  const [per500m, perKm] = await Promise.all([
    loadCoachZonesForUnit(client, coach_id, 'per_500m'),
    loadCoachZonesForUnit(client, coach_id, 'per_km'),
  ]);

  const derived = deriveZoneProfilesFromBenchmarks(benchmarks, { per_500m: per500m, per_km: perKm });

  for (const d of derived) {
    // Current (highest-version) profile for this modality, if any.
    const [current] = await client<CurrentProfileRow[]>`
      select source, threshold_s::float8 as threshold_s
      from athlete_zone_profiles
      where athlete_id = ${athlete_id} and modality = ${d.modality}
      order by version desc
      limit 1
    `;

    // A real recorded test (coach- OR athlete-entered) is the validated source of
    // record — an onboarding auto-derive must never clobber it with a newer version.
    if (current && (current.source === 'coach_test' || current.source === 'athlete_test')) {
      result.skipped.push({ modality: d.modality, reason: 'real_test_wins' });
      continue;
    }
    // Idempotent: an existing auto profile with the same threshold is unchanged.
    if (
      current &&
      current.source === 'onboarding_auto' &&
      Math.round(current.threshold_s) === Math.round(d.threshold_s)
    ) {
      result.skipped.push({ modality: d.modality, reason: 'unchanged' });
      continue;
    }

    const source_benchmark_id =
      benchRows.find((r) => r.exercise_slug === CANONICAL_ANCHOR_SLUG[d.modality])?.id ?? null;

    await insertZoneProfileVersion(
      {
        athlete_id,
        modality: d.modality,
        threshold_s: d.threshold_s,
        pace_unit: d.pace_unit,
        source_test_slug: null,
        source_benchmark_id,
        zones: d.zones,
        source: 'onboarding_auto',
        needs_review: true,
      },
      client,
    );
    result.inserted.push({ modality: d.modality, threshold_s: d.threshold_s });
  }

  return result;
}

/**
 * Backfill auto zone profiles for EVERY already-onboarded athlete that has
 * benchmarks (so existing athletes get their auto-zones too). Sequential to keep
 * the connection pool calm; idempotent (re-running is a no-op via the per-athlete
 * skip rules). Returns the per-athlete results.
 */
export async function backfillOnboardingZones(
  params: { coach_id?: number; client?: Sql } = {},
): Promise<OnboardingZonesResult[]> {
  const client = params.client ?? defaultSql;
  const coachFilter = params.coach_id ?? null;
  const athletes = await client<{ id: number }[]>`
    select distinct a.id
    from athletes a
    join athlete_benchmarks b on b.athlete_id = a.id
    where a.coach_id is not null
      and (${coachFilter}::bigint is null or a.coach_id = ${coachFilter}::bigint)
    order by a.id asc
  `;
  const out: OnboardingZonesResult[] = [];
  for (const a of athletes) {
    out.push(await deriveAndStoreOnboardingZones({ athlete_id: Number(a.id), client }));
  }
  return out;
}
