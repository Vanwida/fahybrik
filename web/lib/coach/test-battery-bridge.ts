import 'server-only';

// #34 — the ejecución→benchmark BRIDGE. The piece that closes the broken loop:
// a finished calibration-test session's entered result(s) become ground-truth
// benchmarks + their calibrations, tagged with real-test provenance, superseding
// the self-declared/onboarding_auto estimates.
//
// It reads the assignment's template `store_results` (the contract) and routes
// each entered value:
//   · time-trial (run_5k / row_2k)   → benchmark + DERIVED zone profile
//   · time-trial baseline (half-sim) → benchmark only (no zone/max)
//   · load (back_squat_1rm …)        → versioned strength max + benchmark
//   · hr (lthr_bpm)                  → benchmark only — and that IS the HR-zone
//     calibration, because the zone model resolves live off the latest anchor
//   · hrr (hrr60)                    → benchmark only (baseline evidence)
// then re-runs the LEVEL suggestion (it reads athlete_benchmarks fresh, so the
// real 5K/2K/1RM firm up the athlete's level from data, not self-report).
//
// Reuses the EXISTING seams (recordTestBenchmark, insertStrengthMaxVersion,
// deriveZoneProfilesFromBenchmarks + insertZoneProfileVersion, the coach test
// endpoints' exact pattern) — no new math, no parallel store. Writes run on the
// pool sequentially (benchmark committed before the zone derivation reads it),
// mirroring the coach/athlete test-result routes.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { setAssignmentStatus } from '@/lib/sync/assignment-status';
import { recordTestBenchmark } from '@/lib/athlete/record-test-benchmark';
import { insertStrengthMaxVersion } from '@/lib/strength/strength-max';
import { loadCoachZonesForUnit, insertZoneProfileVersion } from '@/lib/dashboard/v2/zone-derivation';
import { computeAndStoreLevelSuggestion } from '@/lib/coach/level-proposal';
import {
  athleteBenchmarksFromSlugRows,
  deriveZoneProfilesFromBenchmarks,
} from '@fahybrid/shared/domain/methodology';
import {
  BENCH_RUN_5K,
  BENCH_ROW_2K,
  BENCH_SKI_1K,
  benchmarkLowerIsBetter,
  benchmarkIsDirectional,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { storeResultsSchema, type StoreResultSpec } from '@fahybrid/shared/schema/test-battery';
import type { TestSource } from '@fahybrid/shared/domain/athlete/record-test-result';

type ZoneModality = 'run' | 'row' | 'ski';
const ZONE_ANCHOR_SLUG: Record<ZoneModality, string> = {
  run: BENCH_RUN_5K,
  row: BENCH_ROW_2K,
  ski: BENCH_SKI_1K,
};

export type BridgeError =
  | 'assignment_not_found'
  | 'not_a_test'
  | 'no_coach'
  | 'unknown_slug';

/** One recorded value with its progression delta vs the athlete's previous value
 *  for the same slug. `prev_value` is the last dated `athlete_benchmarks` value
 *  BEFORE this write (any source); `improved` is null on a first-ever result or a
 *  tie, else the direction-correct verdict (time faster / kg-bpm-reps higher). */
export interface RecordedEntry {
  slug: string;
  value: number;
  prev_value: number | null;
  improved: boolean | null;
}

export interface RecordBatteryResult {
  ok: boolean;
  error?: BridgeError;
  benchmarks_written: number;
  zones_derived: Array<{ modality: ZoneModality; threshold_s: number }>;
  strength_maxes_written: number;
  level_recomputed: boolean;
  /** Per recorded entry, its value + delta vs the previous value (for the
   *  post-capture "mejoraste" surface). Empty on an error return. */
  entries: RecordedEntry[];
}

/** One entered value for a store_results slug. */
export interface BatteryEntry {
  slug: string;
  value: number;
}

/**
 * Record a calibration test session's results and calibrate. Ownership-scoped:
 * the assignment MUST belong to the athlete. `source` is 'athlete_test' (the
 * athlete self-entered on finish) or 'coach_test' (the coach entered it) — the
 * only difference in the loop, and both win over onboarding_auto/self-declared.
 */
export async function recordBatteryResults(params: {
  athlete_id: number;
  assignment_id: number;
  entries: BatteryEntry[];
  source: TestSource;
  client?: Sql;
}): Promise<RecordBatteryResult> {
  const sql = params.client ?? defaultSql;
  const { athlete_id, assignment_id, entries, source } = params;
  const out: RecordBatteryResult = {
    ok: false,
    benchmarks_written: 0,
    zones_derived: [],
    strength_maxes_written: 0,
    level_recomputed: false,
    entries: [],
  };

  // Load the assignment's template store_results (ownership-scoped) + the coach.
  const rows = await sql<{ store_results: unknown; coach_id: string | null }[]>`
    select t.meta_json -> 'store_results' as store_results,
           a.coach_id::text as coach_id
    from workout_assignments wa
    join templates t on t.id = wa.template_id
    join athletes a on a.id = wa.athlete_id
    where wa.id = ${assignment_id} and wa.athlete_id = ${athlete_id}
    limit 1
  `;
  if (!rows[0]) return { ...out, error: 'assignment_not_found' };

  const specsParsed = storeResultsSchema.safeParse(rows[0].store_results ?? []);
  const specs: StoreResultSpec[] = specsParsed.success ? specsParsed.data : [];
  if (specs.length === 0) return { ...out, error: 'not_a_test' };

  const specBySlug = new Map(specs.map((s) => [s.slug, s]));

  // Validate every entered slug belongs to THIS test's contract.
  for (const e of entries) {
    if (!specBySlug.has(e.slug)) return { ...out, error: 'unknown_slug' };
  }

  const coach_id = rows[0].coach_id ? Number(rows[0].coach_id) : null;

  // Snapshot the athlete's PREVIOUS value per slug BEFORE writing anything, so the
  // delta (prev_value / improved) compares against the last recorded value, not the
  // one we're about to append. Latest dated row per slug, any source.
  const entrySlugs = entries.map((e) => e.slug);
  const prevRows = await sql<{ exercise_slug: string; value: number }[]>`
    select distinct on (exercise_slug) exercise_slug, value::float8 as value
    from athlete_benchmarks
    where athlete_id = ${athlete_id} and exercise_slug = any(${entrySlugs})
    order by exercise_slug, recorded_at desc, id desc
  `;
  const prevBySlug = new Map(prevRows.map((r) => [r.exercise_slug, r.value]));

  // 1) Write every benchmark FIRST (committed on the pool), so the zone
  //    derivation below reads the just-recorded run_5k/row_2k.
  const zoneModalities = new Set<ZoneModality>();
  for (const e of entries) {
    const spec = specBySlug.get(e.slug)!;
    if (spec.measure === 'load') {
      await recordTestBenchmark(
        sql,
        {
          kind: 'strength',
          athlete_id,
          exercise_slug: spec.slug,
          one_rm_kg: e.value,
          source,
        },
        { assignment_id },
      );
    } else if (spec.measure === 'hrr') {
      // heart-rate recovery (hrr60) — a baseline benchmark in bpm; derives nothing.
      await recordTestBenchmark(
        sql,
        {
          kind: 'hrr',
          athlete_id,
          exercise_slug: spec.slug,
          bpm: e.value,
          source,
        },
        { assignment_id },
      );
    } else if (spec.measure === 'hr') {
      // An absolute heart rate (lthr_bpm). This branch is load-bearing: without it
      // the `else` below would file a threshold of 156 ppm as 156 SECONDS.
      //
      // Writing the benchmark IS the whole calibration for `hr_zones` — unlike the
      // pace zones there is no profile to snapshot, because the HR model is
      // resolved live from the latest `lthr_bpm` row (web/lib/athlete/hr-zones.ts →
      // shared/domain/methodology/hr-zones.ts). The moment this row lands, the
      // athlete's phone, the coach's read-back and the watch alert all switch from
      // an estimated anchor to a measured one. Do not "finish" this by adding a
      // snapshot table: there is nothing missing.
      await recordTestBenchmark(
        sql,
        {
          kind: 'hr',
          athlete_id,
          exercise_slug: spec.slug,
          bpm: e.value,
          source,
        },
        { assignment_id },
      );
    } else if (spec.measure === 'height') {
      // Jump height in cm. MUST sit before the timetrial else: that branch
      // stores unit 'seconds', and 47 cm would render as 0:47 with lower-is-better.
      await recordTestBenchmark(
        sql,
        {
          kind: 'jump',
          athlete_id,
          exercise_slug: spec.slug,
          height_cm: e.value,
          source,
        },
        { assignment_id },
      );
    } else {
      // time-trial (run_5k / row_2k / hyrox_half_sim)
      await recordTestBenchmark(
        sql,
        {
          kind: 'timetrial',
          athlete_id,
          exercise_slug: spec.slug,
          seconds: e.value,
          source,
        },
        { assignment_id },
      );
    }
    out.benchmarks_written += 1;
    if (
      (spec.derives === 'run_zones' || spec.derives === 'row_zones' || spec.derives === 'ski_zones') &&
      (spec.modality === 'run' || spec.modality === 'row' || spec.modality === 'ski')
    ) {
      zoneModalities.add(spec.modality);
    }
  }

  // 2) Strength maxes (versioned projection) for each load entry, ancladas a ESTA
  //    ocurrencia igual que sus marcas.
  for (const e of entries) {
    const spec = specBySlug.get(e.slug)!;
    if (spec.measure !== 'load') continue;
    await insertStrengthMaxVersion(
      {
        athlete_id,
        exercise_slug: spec.slug,
        one_rm_kg: e.value,
        source,
        test_weight_kg: null,
        test_reps: null,
        one_rm_method: null,
        needs_review: false,
        // El ancla (0200). Sin ella la ficha no puede distinguir este kilo —que
        // salió de esta batería— de uno que el coach escribió a mano, y acaba
        // llamando «medidas» a las dos cosas.
        assignment_id,
      },
      sql,
    );
    out.strength_maxes_written += 1;
  }

  // 3) Zone profiles from the freshly-written time-trials (coach model needed).
  if (zoneModalities.size > 0 && coach_id) {
    out.zones_derived = await deriveAndStoreTestZones({
      athlete_id,
      coach_id,
      source,
      modalities: zoneModalities,
      client: sql,
    });
  }

  // 4) Re-run the level suggestion — it re-reads athlete_benchmarks, so the real
  //    5K/2K/1RM now recolocate the athlete's level from data (never overwrites a
  //    coach-assigned level; safe to re-run).
  if (coach_id) {
    try {
      await computeAndStoreLevelSuggestion(athlete_id, coach_id);
      out.level_recomputed = true;
    } catch {
      // best-effort: the benchmarks + projections above are the contract.
    }
  }

  // Per-entry progression delta vs the snapshot taken before the writes. Direction
  // is unit-correct (time faster = better; kg / bpm / reps higher = better), and a
  // pure calibration anchor (threshold HR) gets NO verdict at all — it re-scales
  // training without being better or worse, so `improved` stays null and the app
  // shows the change without praising or scolding it.
  out.entries = entries.map((e) => {
    const spec = specBySlug.get(e.slug)!;
    const prev = prevBySlug.get(e.slug) ?? null;
    const improved =
      prev == null || e.value === prev || !benchmarkIsDirectional(e.slug)
        ? null
        : benchmarkLowerIsBetter(spec.unit)
          ? e.value < prev
          : e.value > prev;
    return { slug: e.slug, value: e.value, prev_value: prev, improved };
  });

  // El resultado ES el cierre del día. Sin esto el atleta guarda y Hoy sigue
  // diciendo Empezar — el puente escribía marcas y no tocaba el assignment.
  await setAssignmentStatus(sql, assignment_id, athlete_id, 'completed');

  out.ok = true;
  return out;
}

/**
 * Derive + store zone profiles for the given modalities with a REAL-test source
 * tag (coach_test / athlete_test), reading the athlete's benchmarks (which now
 * include the just-written time-trials). Mirrors deriveAndStoreOnboardingZones but
 * (a) uses the chosen source, (b) needs_review=false (a real test is validated),
 * (c) scopes to the tested modalities, and (d) always writes a new version (a
 * real test WINS — that is the point), so no unchanged-skip.
 */
async function deriveAndStoreTestZones(params: {
  athlete_id: number;
  coach_id: number;
  source: TestSource;
  modalities: Set<ZoneModality>;
  client: Sql;
}): Promise<Array<{ modality: ZoneModality; threshold_s: number }>> {
  const { athlete_id, coach_id, source, modalities, client } = params;
  const inserted: Array<{ modality: ZoneModality; threshold_s: number }> = [];

  const benchRows = await client<{ id: string; exercise_slug: string; value: number }[]>`
    select id::text as id, exercise_slug, value::float8 as value
    from athlete_benchmarks
    where athlete_id = ${athlete_id}
  `;
  const benchmarks = athleteBenchmarksFromSlugRows(benchRows);

  const [per500m, perKm] = await Promise.all([
    loadCoachZonesForUnit(client, coach_id, 'per_500m'),
    loadCoachZonesForUnit(client, coach_id, 'per_km'),
  ]);

  const derived = deriveZoneProfilesFromBenchmarks(benchmarks, { per_500m: per500m, per_km: perKm });
  for (const d of derived) {
    if (!modalities.has(d.modality)) continue;
    const anchorId =
      benchRows.find((r) => r.exercise_slug === ZONE_ANCHOR_SLUG[d.modality])?.id ?? null;
    await insertZoneProfileVersion(
      {
        athlete_id,
        modality: d.modality,
        threshold_s: d.threshold_s,
        pace_unit: d.pace_unit,
        source_test_slug: null,
        source_benchmark_id: anchorId,
        zones: d.zones,
        source,
        needs_review: false,
      },
      client,
    );
    inserted.push({ modality: d.modality, threshold_s: d.threshold_s });
  }
  return inserted;
}
