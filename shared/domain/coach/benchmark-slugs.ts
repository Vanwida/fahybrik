// =============================================================================
// Canonical benchmark slug vocabulary — SINGLE SOURCE OF TRUTH
// =============================================================================
//
// `athlete_benchmarks.exercise_slug` is a free-text key (no FK into the
// `exercises` catalog — that catalog holds programming exercises like
// `run-z2-long`, a different namespace). So nothing in the DB constrains these
// strings; the ONLY contract is that whoever WRITES a benchmark and whoever
// READS it must agree on the slug. This module is that contract.
//
// Before this existed, three vocabularies had drifted apart:
//   - onboarding wrote   `back_squat_1rm`, `run_5k`, …  (dropped row/ski/hyrox)
//   - the level algorithm read `back_squat`, `run_5k`, `row_2k`, `hyrox_open`
//   - intake suggestions read `back_squat`, `5k_run`, `2k_row`, `hyrox_pro`, …
// Only `run_5k` ever matched. The level/suggestions were computed on partial
// or empty data. Everything now references the constants below.
//
// CONVENTION: keep the slugs the DB already contains (written by onboarding)
// as the spine, because other consumers already read them
// (`dobles-session.ts` → *_1rm, `running-analysis.ts` → run_5k). Readers were
// the divergent side and are migrated onto these.

// ── Strength 1RMs (unit: kg) ─────────────────────────────────────────────────
export const BENCH_BACK_SQUAT_1RM = 'back_squat_1rm';
export const BENCH_DEADLIFT_1RM = 'deadlift_1rm';
export const BENCH_BENCH_PRESS_1RM = 'bench_press_1rm';
export const BENCH_OHP_1RM = 'ohp_1rm';
export const BENCH_CLEAN_1RM = 'clean_1rm';
export const BENCH_SNATCH_1RM = 'snatch_1rm';

// ── Calisthenics / rep tests (unit: reps) ────────────────────────────────────
export const BENCH_STRICT_PULL_UP_MAX = 'strict_pull_up_max';
export const BENCH_PUSH_UPS_PER_MIN = 'push_ups_per_min';

// ── Endurance / running (unit: seconds) ──────────────────────────────────────
export const BENCH_RUN_5K = 'run_5k';
export const BENCH_RUN_10K = 'run_10k';
export const BENCH_RUN_HALF = 'run_half';
export const BENCH_RUN_MARATHON = 'run_marathon';

// ── Ergometer time trials (unit: seconds) ────────────────────────────────────
export const BENCH_ROW_2K = 'row_2k';
export const BENCH_SKI_1K = 'ski_1k';

// ── HYROX best time, by division (unit: seconds) ─────────────────────────────
export const BENCH_HYROX_OPEN = 'hyrox_open';
export const BENCH_HYROX_PRO = 'hyrox_pro';

/**
 * Map a HYROX division string to its benchmark slug. Open is the default for
 * any unknown / missing division (matches the level-algorithm thresholds,
 * which only model `hyrox_open`).
 */
export function hyroxBenchmarkSlug(division: string | null | undefined): string {
  return division === 'pro' ? BENCH_HYROX_PRO : BENCH_HYROX_OPEN;
}

export const BENCHMARK_UNIT_KG = 'kg';
export const BENCHMARK_UNIT_REPS = 'reps';
export const BENCHMARK_UNIT_SECONDS = 'seconds';
