// @fahybrid/shared/domain/coach/test-battery — the default week-1 calibration
// battery (#34). Single source of truth for the four tests that fix an athlete's
// REAL point of departure in their first week: 5K control, 2K row, 1RM battery,
// HYROX half-sim. Replaces the dead `web/lib/coach/athlete-benchmark-tests.ts`
// stub (which had unwired, non-canonical slugs).
//
// Each protocol declares its `store_results` (the meta_json contract, see
// shared/schema/test-battery) so ONE definition drives: the seed template, the
// is_test badge, and the ejecución→benchmark bridge. Slugs are the LIVE ones
// (benchmark-slugs.ts / STRENGTH_LIFT_SLUGS), not the stub's.

import type {
  StoreResultSpec,
  StoreResultMeasure,
  StoreResultUnit,
  StoreResultDerives,
} from '../../schema/test-battery';
import {
  BENCH_RUN_5K,
  BENCH_ROW_2K,
  BENCH_SKI_1K,
  BENCH_HYROX_HALF_SIM,
  BENCH_BACK_SQUAT_1RM,
  BENCH_DEADLIFT_1RM,
  BENCH_BENCH_PRESS_1RM,
} from './benchmark-slugs';
import { STRENGTH_LIFTS } from '../strength/exercises';

/** The `template_format` a seed test template uses (subset of the enum). */
export type CalibrationFormat = 'test' | 'strength_block' | 'hyrox_sim';

export interface CalibrationTestProtocol {
  // Protocol id — mirrors methodology_tests where one exists; also the value of
  // `templates.meta_json.calibration` so scheduling finds the template without a
  // hardcoded id.
  slug: string;
  label: string;
  // Seed-template shape.
  format: CalibrationFormat;
  primary_modality: 'run' | 'row' | 'strength' | 'hyrox';
  // Coach-facing protocol instructions (the session brief).
  protocol: string;
  // Anchored to the athlete's first week (relative Monday). All four = 1.
  week_offset: number;
  // Preferred weekday (1 = Mon … 7 = Sun) so the four spread across the week
  // rather than piling on one day (each is demanding). A suggestion; the coach
  // can move them (Fork A: auto + override).
  day_of_week: number;
  // The contract: what this test measures and calibrates.
  store_results: StoreResultSpec[];
}

export const CALIBRATION_META_KEY = 'calibration' as const;

// The default v1 battery (Fork B: fixed 4 — the day-1 promise). Coach can
// remove/move any as a normal plan session.
export const DEFAULT_CALIBRATION_BATTERY: readonly CalibrationTestProtocol[] = [
  {
    slug: 'tt_5k',
    label: '5K control',
    format: 'test',
    primary_modality: 'run',
    protocol: '5 km a fondo (contrarreloj). Calienta 10–15 min, luego 5 km al máximo sostenible.',
    week_offset: 1,
    day_of_week: 3, // Wed
    store_results: [
      {
        slug: BENCH_RUN_5K,
        unit: 'seconds',
        measure: 'time',
        derives: 'run_zones',
        modality: 'run',
        label: 'Tiempo 5K',
      },
    ],
  },
  {
    slug: 'tt_2k_row',
    label: 'Remo 2K',
    format: 'test',
    primary_modality: 'row',
    protocol: '2000 m en remoergómetro a fondo. Calienta 10 min, luego 2 km al máximo sostenible.',
    week_offset: 1,
    day_of_week: 5, // Fri
    store_results: [
      {
        slug: BENCH_ROW_2K,
        unit: 'seconds',
        measure: 'time',
        derives: 'row_zones',
        modality: 'row',
        label: 'Tiempo 2K remo',
      },
    ],
  },
  {
    slug: 'one_rm_battery',
    label: 'Batería 1RM',
    format: 'strength_block',
    primary_modality: 'strength',
    protocol: '1RM en sentadilla, peso muerto y press banca. Progresa en series hasta el máximo técnico.',
    week_offset: 1,
    day_of_week: 2, // Tue
    store_results: [
      { slug: BENCH_BACK_SQUAT_1RM, unit: 'kg', measure: 'load', derives: 'strength_max', modality: 'strength', label: 'Sentadilla' },
      { slug: BENCH_DEADLIFT_1RM, unit: 'kg', measure: 'load', derives: 'strength_max', modality: 'strength', label: 'Peso muerto' },
      { slug: BENCH_BENCH_PRESS_1RM, unit: 'kg', measure: 'load', derives: 'strength_max', modality: 'strength', label: 'Press banca' },
    ],
  },
  {
    slug: 'hyrox_half_sim',
    label: 'HYROX half-sim',
    format: 'hyrox_sim',
    primary_modality: 'hyrox',
    protocol: 'Simulacro HYROX a media distancia (4 estaciones + 4 corridas de 500 m). A ritmo de carrera.',
    week_offset: 1,
    day_of_week: 6, // Sat
    store_results: [
      {
        slug: BENCH_HYROX_HALF_SIM,
        unit: 'seconds',
        measure: 'time',
        derives: 'none',
        modality: 'hyrox',
        label: 'Tiempo half-sim',
      },
    ],
  },
] as const;

/** Every store_results spec flattened, keyed by slug (the bridge's routing table). */
export function storeResultSpecBySlug(slug: string): StoreResultSpec | null {
  for (const p of DEFAULT_CALIBRATION_BATTERY) {
    const s = p.store_results.find((r) => r.slug === slug);
    if (s) return s;
  }
  return null;
}

// =============================================================================
// CALIBRATION TARGETS — the FIXED catalog of results that actually calibrate.
//
// This is the objective-correctness spine of the coach test builder (#34).
// Calibration is NOT free-form: the ejecución→benchmark bridge + the zone/1RM
// engine only ever calibrate off a KNOWN slug/modality:
//   · zones  — the derivation anchors ONLY on run_5k (per_km), row_2k / ski_1k
//              (per_500m). A "run zones" result on any other slug writes a
//              benchmark but derives NO profile — a silent failure.
//   · 1RM    — insertStrengthMaxVersion + the %RM resolver key on the six tracked
//              STRENGTH_LIFTS. Any other slug never resolves a load.
// So a coach never picks a raw slug: they pick a TARGET from this catalog, and
// slug/measure/unit/modality are DERIVED (guaranteed coherent). A result outside
// the catalog is BASELINE (derives:'none') — a stored number, no calibration.
// The measures here are exactly `time` and `load`, which is also why the
// schema-level guard (only time/load may calibrate) holds by construction.
// =============================================================================

export interface CalibrationTarget {
  /** Stable key for the coach UI + API (`run_zones`, `back_squat_1rm`). */
  key: string;
  /** Coach-facing option label ("Zonas de carrera", "1RM · Sentadilla"). */
  coach_label: string;
  /** Default result label the coach can override ("Tiempo 5K", "Sentadilla"). */
  result_label: string;
  /** The canonical benchmark slug this target writes (run_5k, back_squat_1rm…). */
  slug: string;
  measure: Extract<StoreResultMeasure, 'time' | 'load'>;
  unit: Extract<StoreResultUnit, 'seconds' | 'kg'>;
  derives: Exclude<StoreResultDerives, 'none'>;
  modality: 'run' | 'row' | 'ski' | 'strength';
}

const ZONE_TARGETS: readonly CalibrationTarget[] = [
  { key: 'run_zones', coach_label: 'Zonas de carrera', result_label: 'Tiempo 5K', slug: BENCH_RUN_5K, measure: 'time', unit: 'seconds', derives: 'run_zones', modality: 'run' },
  { key: 'row_zones', coach_label: 'Zonas de remo', result_label: 'Tiempo 2K remo', slug: BENCH_ROW_2K, measure: 'time', unit: 'seconds', derives: 'row_zones', modality: 'row' },
  { key: 'ski_zones', coach_label: 'Zonas de ski', result_label: 'Tiempo 1K ski', slug: BENCH_SKI_1K, measure: 'time', unit: 'seconds', derives: 'ski_zones', modality: 'ski' },
];

// The six tracked lifts → a strength_max calibration target each (DRY: reuses
// STRENGTH_LIFTS, the single source of truth for the tracked 1RM lifts).
const STRENGTH_TARGETS: readonly CalibrationTarget[] = STRENGTH_LIFTS.map((lift) => ({
  key: lift.slug,
  coach_label: `1RM · ${lift.label}`,
  result_label: lift.label,
  slug: lift.slug,
  measure: 'load',
  unit: 'kg',
  derives: 'strength_max',
  modality: 'strength',
}));

/** Every calibration target the coach can pick, zones first then the lifts. */
export const CALIBRATION_TARGETS: readonly CalibrationTarget[] = [
  ...ZONE_TARGETS,
  ...STRENGTH_TARGETS,
];

const CALIBRATION_TARGET_BY_KEY: ReadonlyMap<string, CalibrationTarget> = new Map(
  CALIBRATION_TARGETS.map((t) => [t.key, t]),
);
const CALIBRATION_TARGET_BY_SLUG: ReadonlyMap<string, CalibrationTarget> = new Map(
  CALIBRATION_TARGETS.map((t) => [t.slug, t]),
);

export function calibrationTargetByKey(key: string): CalibrationTarget | null {
  return CALIBRATION_TARGET_BY_KEY.get(key) ?? null;
}

/** Build the full store_results spec for a calibration target + coach label. */
export function specForCalibrationTarget(
  target: CalibrationTarget,
  label?: string | null,
): StoreResultSpec {
  return {
    slug: target.slug,
    measure: target.measure,
    unit: target.unit,
    derives: target.derives,
    modality: target.modality,
    label: (label && label.trim()) || target.result_label,
  };
}

/** The baseline (non-calibrating) measures a coach may pick for a stored number,
 *  each with its natural unit. Distance/reps/calories can ONLY be baseline (they
 *  don't calibrate yet — #44); time also appears here for baseline time results
 *  (e.g. a HYROX half-sim time that is stored, not used to derive zones). */
export const BASELINE_MEASURE_UNITS: ReadonlyArray<{
  measure: StoreResultMeasure;
  unit: StoreResultUnit;
  label: string;
}> = [
  { measure: 'time', unit: 'seconds', label: 'Tiempo' },
  { measure: 'distance', unit: 'meters', label: 'Distancia' },
  { measure: 'reps', unit: 'reps', label: 'Repeticiones' },
  { measure: 'calories', unit: 'calories', label: 'Calorías' },
];

/**
 * OBJECTIVE coherence check for a store_results spec, enforced server-side so a
 * malformed client can never author a test that silently fails to calibrate.
 * Returns null when coherent, else a human reason:
 *   · derives:'none'  → baseline, any measure allowed (nothing to verify).
 *   · a calibrating derive → the spec MUST match its catalog target EXACTLY
 *     (slug + measure + unit + modality). This is what guarantees the bridge and
 *     the zone/1RM engine actually pick it up.
 */
export function calibrationCoherenceError(spec: StoreResultSpec): string | null {
  if (spec.derives === 'none') return null;
  const target = CALIBRATION_TARGET_BY_SLUG.get(spec.slug);
  if (!target || target.derives !== spec.derives) {
    return `El resultado "${spec.label}" no calibra: su medida no está en el catálogo de calibración (zonas de carrera/remo/ski o 1RM de un levantamiento).`;
  }
  if (spec.measure !== target.measure || spec.unit !== target.unit || spec.modality !== target.modality) {
    return `El resultado "${spec.label}" es incoherente con lo que calibra (${target.coach_label}).`;
  }
  return null;
}
