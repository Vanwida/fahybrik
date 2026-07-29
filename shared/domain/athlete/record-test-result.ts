// =============================================================================
// KEYSTONE — the single test-result writer (benchmark sink)
// =============================================================================
//
// THE ROOT FIX. Before this, `athlete_benchmarks` was written by exactly ONE
// place in the whole tree — the onboarding submit. Every POST-onboarding test
// (coach zone test, athlete zone test, coach/athlete strength test) wrote only
// its plan-facing PROJECTION (athlete_zone_profiles for thresholds,
// athlete_strength_maxes for lifts) and never appended a benchmark row. So the
// progression engine (progress-readiness) and the coach improvement signals read
// a benchmark history frozen at signup, and "did they actually get fitter?" was
// permanently null.
//
// This module is the (a) sink of the keystone: on ANY post-onboarding test it
// APPENDS one dated `athlete_benchmarks` row capturing the test as canonical
// progression evidence. The (b) sink — the versioned plan-facing projection — is
// inserted by the caller's existing per-app seam (insertZoneProfileVersion /
// insertStrengthMaxVersion), which lives server-side because it needs the COACH's
// methodology (zone offsets / 1RM formula). Each route now does BOTH writes in
// one transaction, so a test is one event with two derived rows that commit
// together — DRY, no parallel systems, no frozen store.
//
// HONESTY: a threshold (umbral) test records the THRESHOLD pace under its own
// per-modality slug (run_threshold_s_per_km …), NOT a `run_5k` row — a threshold
// test is not a 5 km time trial, and fabricating a 5 km from a pace would be a
// lie. The 5 km trend stays honestly empty until a real 5 km is logged; the
// threshold rows feed the progression engine + the coach test_logged signal.

import {
  BENCHMARK_UNIT_KG,
  BENCHMARK_UNIT_SECONDS,
  BENCHMARK_UNIT_BPM,
  thresholdBenchmarkSlug,
  type TestModality,
} from '../coach/benchmark-slugs';

/** Provenance tag stored in `athlete_benchmarks.notes`. Distinct from onboarding's
 *  'onboarding' tag, so an onboarding re-submit (which deletes ONLY its own tagged
 *  rows) never touches a real recorded test. */
export type TestSource = 'coach_test' | 'athlete_test';

export interface ThresholdTestEvent {
  kind: 'threshold';
  athlete_id: number;
  modality: TestModality;
  /** The umbral pace, seconds per the modality's unit (run → /km, ergo → /500m). */
  threshold_s: number;
  source: TestSource;
}

export interface StrengthTestEvent {
  kind: 'strength';
  athlete_id: number;
  /** A strength lift 1RM slug — already the canonical benchmark slug (back_squat_1rm…). */
  exercise_slug: string;
  one_rm_kg: number;
  source: TestSource;
}

// A REAL time-trial result (a 5 km run, a 2 km row, a HYROX half-sim) — the case
// the HONESTY note above anticipates ("until a real 5 km is logged"). UNLIKE a
// threshold event, this records the time-trial slug itself (run_5k / row_2k /
// hyrox_half_sim), which is what the level algorithm + the zone derivation read.
// The #34 week-1 calibration battery is the first producer of these.
export interface TimeTrialTestEvent {
  kind: 'timetrial';
  athlete_id: number;
  /** A time-trial benchmark slug — already canonical (run_5k, row_2k, hyrox_half_sim…). */
  exercise_slug: string;
  seconds: number;
  source: TestSource;
}

// A heart-rate-recovery result (hrr60 = bpm the HR dropped 60 s after stopping a
// near-maximal effort). A BASELINE benchmark: it records the bpm drop under its own
// slug (hrr60, unit bpm) and derives NOTHING — no zone, no 1RM. Higher = fitter.
export interface HrrTestEvent {
  kind: 'hrr';
  athlete_id: number;
  /** The HRR benchmark slug (hrr60…) — already canonical. */
  exercise_slug: string;
  /** bpm the HR dropped in the fixed recovery window. HIGHER is better. */
  bpm: number;
  source: TestSource;
}

// An absolute HEART-RATE result — today only the lactate-threshold HR (`lthr_bpm`),
// the average pulse over the last 20 min of a 30-min all-out effort. UNLIKE `hrr`
// (a DROP between two rates) this is a rate, and it is the ONE anchor of the HR zone
// model that is measured instead of inferred (shared/domain/methodology/hr-zones.ts).
// Recording the benchmark IS the calibration: the zone resolver reads the latest
// `lthr_bpm` row live, so no snapshot table has to be rewritten.
export interface HrTestEvent {
  kind: 'hr';
  athlete_id: number;
  /** An absolute-HR benchmark slug (lthr_bpm) — already canonical. */
  exercise_slug: string;
  /** Beats per minute. NOT a delta. */
  bpm: number;
  source: TestSource;
}

export type TestEvent =
  | ThresholdTestEvent
  | StrengthTestEvent
  | TimeTrialTestEvent
  | HrrTestEvent
  | HrTestEvent;

export interface BenchmarkAppendRow {
  exercise_slug: string;
  value: number;
  unit: string;
}

/**
 * The canonical benchmark row a test event records as progression evidence. PURE
 * (no I/O) so it's unit-testable against Pablo's real tests without a database;
 * the thin SQL append (the keystone's (a) sink) wraps this in the per-app DB layer
 * (web/lib/athlete/record-test-benchmark) where the transaction type lives.
 */
export function benchmarkForTestEvent(event: TestEvent): BenchmarkAppendRow {
  if (event.kind === 'strength') {
    return { exercise_slug: event.exercise_slug, value: event.one_rm_kg, unit: BENCHMARK_UNIT_KG };
  }
  if (event.kind === 'timetrial') {
    return { exercise_slug: event.exercise_slug, value: event.seconds, unit: BENCHMARK_UNIT_SECONDS };
  }
  if (event.kind === 'hrr' || event.kind === 'hr') {
    return { exercise_slug: event.exercise_slug, value: event.bpm, unit: BENCHMARK_UNIT_BPM };
  }
  return {
    exercise_slug: thresholdBenchmarkSlug(event.modality),
    value: event.threshold_s,
    unit: BENCHMARK_UNIT_SECONDS,
  };
}
