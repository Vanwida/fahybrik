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
// The HYROX repeat unit — the race is 8 of these. Self-testable (#Marcas).
export const BENCH_RUN_1K = 'run_1k';
// Cooper: distance covered in a FIXED 12 minutes. The one benchmark whose value
// is METERS, not seconds — higher is better, benchmarkLowerIsBetter already
// handles it (only seconds improves downward).
export const BENCH_COOPER_12MIN = 'cooper_12min';

// ── Ergometer time trials (unit: seconds) ────────────────────────────────────
export const BENCH_ROW_2K = 'row_2k';
export const BENCH_SKI_1K = 'ski_1k';
// The race station distance (1000 m row) and the dirty sprint (#Marcas).
export const BENCH_ROW_1K = 'row_1k';
export const BENCH_ROW_500M = 'row_500m';

// ── HYROX best time, by division (unit: seconds) ─────────────────────────────
export const BENCH_HYROX_OPEN = 'hyrox_open';
export const BENCH_HYROX_PRO = 'hyrox_pro';

// ── HYROX half-simulation baseline (unit: seconds) ───────────────────────────
// The week-1 calibration half-sim (#34): a media-distancia simulation, NOT a full
// race. Kept a SEPARATE slug from hyrox_open/pro on purpose — a half-sim time is
// not a race time and must never be conflated with one (the level algorithm reads
// hyrox_open, so a half-sim never inflates the level). It is a performance
// baseline / projection anchor the coach reads.
export const BENCH_HYROX_HALF_SIM = 'hyrox_half_sim';

// ── Threshold (test) pace per modality (unit: seconds) ───────────────────────
// The trained Z4-lower-bound pace recorded as progression evidence EACH time a
// zone test is logged (coach- or athlete-entered). DISTINCT from the time-trial
// slugs above (run_5k…): a threshold test is not a 5 km — it's the umbral pace,
// per the modality's unit (run → /km, row/ski/bike → /500m). Kept out of the
// zone-derivation anchors (CANONICAL_ANCHOR_SLUG) so it never feeds zone math;
// its only consumers are the progression engine + the coach test_logged signal.
export const BENCH_RUN_THRESHOLD = 'run_threshold_s_per_km';
export const BENCH_ROW_THRESHOLD = 'row_threshold_s_per_500m';
export const BENCH_SKI_THRESHOLD = 'ski_threshold_s_per_500m';
export const BENCH_BIKE_THRESHOLD = 'bike_threshold_s_per_500m';

// ── Heart-rate recovery (unit: bpm) ──────────────────────────────────────────
// The bpm the HR drops in a fixed window after stopping a near-maximal effort —
// a standard cardiovascular-recovery marker. hrr60 = the drop 60 s after stopping.
// HIGHER is better (a fitter athlete recovers more bpm). A BASELINE benchmark:
// it never derives zones or a 1RM, it's progression evidence only.
export const BENCH_HRR_60 = 'hrr60';

export type TestModality = 'run' | 'row' | 'ski' | 'bike';

/** The benchmark slug for a modality's threshold (umbral) test result. */
export function thresholdBenchmarkSlug(modality: TestModality): string {
  switch (modality) {
    case 'run':
      return BENCH_RUN_THRESHOLD;
    case 'row':
      return BENCH_ROW_THRESHOLD;
    case 'ski':
      return BENCH_SKI_THRESHOLD;
    case 'bike':
      return BENCH_BIKE_THRESHOLD;
  }
}

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
export const BENCHMARK_UNIT_BPM = 'bpm';
export const BENCHMARK_UNIT_METERS = 'meters';

/** Direction of improvement for a benchmark, from its stored unit. Only a TIME
 *  benchmark (seconds) improves DOWNWARD (faster = better); every other unit
 *  (kg 1RM, reps, meters, calories, bpm heart-rate recovery) improves UPWARD.
 *  Single source of truth for the progression "improved?" signal. */
export function benchmarkLowerIsBetter(unit: string): boolean {
  return unit === BENCHMARK_UNIT_SECONDS;
}

// ── Display labels (Spanish) — canonical home for benchmark UI copy ───────────
// Non-strength benchmarks (time-trials + rep tests + HYROX). Strength 1RM labels
// live with the lift catalog (strengthLiftLabel) so there's a single source per
// concept — these are the only ones a benchmark series needs a name for.
export const BENCHMARK_LABEL: Readonly<Record<string, string>> = {
  [BENCH_RUN_5K]: 'Carrera 5 km',
  [BENCH_RUN_10K]: 'Carrera 10 km',
  [BENCH_RUN_HALF]: 'Media maratón',
  [BENCH_RUN_MARATHON]: 'Maratón',
  [BENCH_RUN_1K]: '1 km a tope',
  [BENCH_COOPER_12MIN]: 'Cooper 12 min',
  [BENCH_ROW_2K]: 'Remo 2000 m',
  [BENCH_SKI_1K]: 'SkiErg 1000 m',
  [BENCH_ROW_1K]: 'Remo 1000 m',
  [BENCH_ROW_500M]: 'Remo 500 m',
  [BENCH_HYROX_OPEN]: 'HYROX Open',
  [BENCH_HYROX_PRO]: 'HYROX Pro',
  [BENCH_STRICT_PULL_UP_MAX]: 'Dominadas estrictas',
  [BENCH_PUSH_UPS_PER_MIN]: 'Flexiones / min',
  [BENCH_RUN_THRESHOLD]: 'Umbral carrera',
  [BENCH_ROW_THRESHOLD]: 'Umbral remo',
  [BENCH_SKI_THRESHOLD]: 'Umbral ski',
  [BENCH_BIKE_THRESHOLD]: 'Umbral bici',
  [BENCH_HRR_60]: 'Recuperación FC 60s',
};

/** Human label for a benchmark slug; falls back to a humanized slug. */
export function benchmarkLabel(slug: string): string {
  return (
    BENCHMARK_LABEL[slug] ??
    slug.replace(/_/g, ' ').replace(/\b([a-z])/g, (m) => m.toUpperCase())
  );
}

/**
 * How a benchmark's value reads, from its stored unit:
 *  · 'time' (seconds)     → mm:ss, LOWER is better
 *  · 'reps'               → count, HIGHER is better
 *  · 'load' (kg)          → 1RM in kg, HIGHER is better
 *  · 'distance' (meters)  → "2.870 m" (Cooper), HIGHER is better
 */
export type BenchmarkMetric = 'time' | 'reps' | 'load' | 'distance';
export function benchmarkMetric(unit: string): BenchmarkMetric {
  if (unit === BENCHMARK_UNIT_KG) return 'load';
  if (unit === BENCHMARK_UNIT_REPS) return 'reps';
  if (unit === BENCHMARK_UNIT_METERS) return 'distance';
  return 'time';
}
