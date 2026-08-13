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
  BENCH_HRR_60,
  BENCH_LTHR,
} from './benchmark-slugs';
import {
  CMJ_PROFILE_PROTOCOL,
  CMJ_PROFILE_RESULTS,
  CMJ_PROFILE_SLUG,
} from '../jump/protocol';
import { STRENGTH_LIFTS } from '../strength/exercises';
import type { Prescription } from '../prescription/types';
import type { RunStructure } from '../prescription/run-structure';
import { prescriptionFromStructure } from '../prescription/run-structure-convert';

// ── Test CONTENT blueprint (#61 guided execution) ────────────────────────────
// A default test's session isn't a bare "run" — it's a real prescribed workout the
// guided cursor drives: a calentamiento, the effort proper, a vuelta a la calma. The
// materializer writes these segments with a STRUCTURED prescription_json (vs the
// generic one-empty-segment-per-result), so iOS has tramos to guide. A RUN carries
// the phased RunStructure in ONE segment (the engine is running-only); an ERG (row)
// carries separate legacy segments (warmup + main) — erg keeps its existing form.
export interface CalibrationContentSegment {
  /** Catalog exercise slug candidates; first that exists on the DB anchors it. */
  exercise: readonly string[];
  /** Block title shown to the athlete ("Calentamiento", "2K remo a fondo"). */
  title: string;
  /** Orders/groups the segment within the session. */
  block_position: number;
  /** The structured prescription the athlete executes (prescription_json). */
  prescription: Prescription;
}

// 5K control (run): one run item carrying the phased structure. Warmup + suelta are
// easy by RPE (no zone needed pre-test); the 5K itself is a fondo (RPE 9-10 — we are
// MEASURING the pace, not prescribing it). Distance in metres, time in seconds.
const TT_5K_RUN_STRUCTURE: RunStructure = [
  { role: 'warmup', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'rpe', value: 3 } }] },
  { role: 'main', elements: [{ kind: 'work', measure: { type: 'distance', m: 5000 }, target: { type: 'rpe', min: 9, max: 10 } }] },
  { role: 'cooldown', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'rpe', value: 2 } }] },
];

const TT_5K_CONTENT: readonly CalibrationContentSegment[] = [
  { exercise: ['run'], title: '5K control', block_position: 0, prescription: prescriptionFromStructure(TT_5K_RUN_STRUCTURE) },
];

// 2K remo (erg): warmup + the 2000 m a fondo, as two erg segments (RunStructure is
// run-only). Steady scheme, one set each; the main is distance 2000 m at RPE 9-10.
const TT_2K_ROW_CONTENT: readonly CalibrationContentSegment[] = [
  {
    exercise: ['row', 'row-z2-long'],
    title: 'Calentamiento',
    block_position: 0,
    prescription: { scheme: 'steady', modality: 'row', sets: [{ measure: { kind: 'duration', seconds: 600 }, target: { kind: 'rpe', value: 3 } }] },
  },
  {
    exercise: ['row', 'row-z2-long'],
    title: '2K remo a fondo',
    block_position: 1,
    prescription: { scheme: 'steady', modality: 'row', sets: [{ measure: { kind: 'distance', meters: 2000 }, target: { kind: 'rpe', min: 9, max: 10 } }] },
  },
];

// The hrr60 (recuperación de FC 60 s) OPTIONAL result seeded on the resistance tests
// (5K, 2K remo, half-sim — NOT the 1RM battery: HRR después de un test neuromuscular
// no es estándar y contaminaría la serie). Baseline (derives 'none', bpm), optional so
// it never blocks the test's completion — la app la mide sola desde la FC si puede.
const HRR60_OPTIONAL_RESULT: StoreResultSpec = {
  slug: BENCH_HRR_60,
  unit: 'bpm',
  measure: 'hrr',
  derives: 'none',
  label: 'Recuperación FC 60s',
  optional: true,
};

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
  // Anchored to the athlete's first week (relative Monday). The four week-1
  // tests = 1. NULL means the test is NOT auto-scheduled: it exists in the coach's
  // catalog, the athlete can run it on demand ("Probarme"), and the coach can drop
  // it into a plan whenever it fits. That is how a test joins the catalog without
  // being imposed on week 1.
  week_offset: number | null;
  // Preferred weekday (1 = Mon … 7 = Sun) so the four spread across the week
  // rather than piling on one day (each is demanding). A suggestion; the coach
  // can move them (Fork A: auto + override). Null iff `week_offset` is null.
  day_of_week: number | null;
  // The contract: what this test measures and calibrates.
  store_results: StoreResultSpec[];
  // The SESSION the athlete executes (#61 guided tramos). When present, the
  // materializer writes these structured segments; when absent (half-sim, 1RM,
  // coach-authored tests) it falls back to the generic one-segment-per-result.
  content?: readonly CalibrationContentSegment[];
}

export const CALIBRATION_META_KEY = 'calibration' as const;

/** The threshold-pulse protocol's slug. Shared because it is the ONE test the
 *  "tus zonas son estimadas" states send the athlete to — the phone starts it by
 *  slug, so this string cannot be retyped anywhere. */
export const LTHR_30MIN_SLUG = 'lthr_30min';

// Umbral de pulso (30 min): the ONLY protocol that measures a heart-rate anchor.
// Friel's field test — 30 min all out, alone, and the average pulse of the LAST 20
// min is the threshold. The first 10 min are excluded on purpose: HR lags the
// effort at the start, so averaging the whole half hour under-reads the threshold.
// One run item, three phases; the effort itself is prescribed by RPE because the
// pace is not what we are measuring.
const LTHR_30MIN_RUN_STRUCTURE: RunStructure = [
  { role: 'warmup', elements: [{ kind: 'work', measure: { type: 'duration', s: 900 }, target: { type: 'rpe', value: 3 } }] },
  { role: 'main', elements: [{ kind: 'work', measure: { type: 'duration', s: 1800 }, target: { type: 'rpe', min: 8, max: 9 } }] },
  { role: 'cooldown', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'rpe', value: 2 } }] },
];

const LTHR_30MIN_CONTENT: readonly CalibrationContentSegment[] = [
  { exercise: ['run'], title: 'Umbral 30 min', block_position: 0, prescription: prescriptionFromStructure(LTHR_30MIN_RUN_STRUCTURE) },
];

// The default v1 battery. The first four are the week-1 promise (Fork B: fixed 4);
// the threshold-pulse test ships in the catalog UNSCHEDULED — it is a fifth maximal
// effort and does not belong in the same week as the other four.
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
      HRR60_OPTIONAL_RESULT,
    ],
    content: TT_5K_CONTENT,
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
      HRR60_OPTIONAL_RESULT,
    ],
    content: TT_2K_ROW_CONTENT,
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
      HRR60_OPTIONAL_RESULT,
    ],
  },
  {
    slug: LTHR_30MIN_SLUG,
    label: 'Umbral de pulso',
    format: 'test',
    primary_modality: 'run',
    protocol:
      'Calienta 15 min. Luego 30 min a tope sostenido, solo y en llano, con la cinta del pulso puesta. Tu umbral es el pulso medio de los últimos 20 min: los primeros 10 no cuentan porque el pulso todavía va por detrás del esfuerzo.',
    // NOT auto-scheduled: available on demand, never a fifth maximal effort in week 1.
    week_offset: null,
    day_of_week: null,
    store_results: [
      {
        slug: BENCH_LTHR,
        unit: 'bpm',
        measure: 'hr',
        derives: 'hr_zones',
        label: 'Umbral de pulso',
      },
      // Same treatment as every other resistance test: the app measures it from
      // the HR stream and it never gates finishing.
      HRR60_OPTIONAL_RESULT,
    ],
    content: LTHR_30MIN_CONTENT,
  },
  {
    slug: CMJ_PROFILE_SLUG,
    label: 'Perfil de salto (CMJ)',
    format: 'test',
    primary_modality: 'strength',
    protocol: CMJ_PROFILE_PROTOCOL,
    // Solo a request del coach: en el catálogo, nunca en semana 1.
    week_offset: null,
    day_of_week: null,
    store_results: [...CMJ_PROFILE_RESULTS],
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
  measure: Extract<StoreResultMeasure, 'time' | 'load' | 'hr'>;
  unit: Extract<StoreResultUnit, 'seconds' | 'kg' | 'bpm'>;
  derives: Exclude<StoreResultDerives, 'none'>;
  /** The modality a PACE zone derivation belongs to. NULL for the HR zones: they
   *  are one physiological ladder for the whole athlete, not one per modality. */
  modality: 'run' | 'row' | 'ski' | 'strength' | null;
}

const ZONE_TARGETS: readonly CalibrationTarget[] = [
  { key: 'run_zones', coach_label: 'Zonas de carrera', result_label: 'Tiempo 5K', slug: BENCH_RUN_5K, measure: 'time', unit: 'seconds', derives: 'run_zones', modality: 'run' },
  { key: 'row_zones', coach_label: 'Zonas de remo', result_label: 'Tiempo 2K remo', slug: BENCH_ROW_2K, measure: 'time', unit: 'seconds', derives: 'row_zones', modality: 'row' },
  { key: 'ski_zones', coach_label: 'Zonas de ski', result_label: 'Tiempo 1K ski', slug: BENCH_SKI_1K, measure: 'time', unit: 'seconds', derives: 'ski_zones', modality: 'ski' },
  // The ONLY target that writes a MEASURED heart-rate anchor. Without it every
  // athlete's HR zones are estimated forever — the model prefers a measured
  // threshold and, until this existed, nothing on any surface could produce one.
  { key: 'hr_zones', coach_label: 'Zonas de pulso', result_label: 'Umbral de pulso', slug: BENCH_LTHR, measure: 'hr', unit: 'bpm', derives: 'hr_zones', modality: null },
];

// The six tracked lifts → a strength_max calibration target each (DRY: reuses
// STRENGTH_LIFTS, the single source of truth for the tracked 1RM lifts).
const STRENGTH_TARGETS: readonly CalibrationTarget[] = STRENGTH_LIFTS.map((lift): CalibrationTarget => ({
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
    // The spec omits the modality rather than carrying a null (the schema models
    // "no modality" as absent), so an HR target serializes as a clean object.
    ...(target.modality ? { modality: target.modality } : {}),
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
  { measure: 'height', unit: 'cm', label: 'Altura de salto' },
];

/**
 * OBJECTIVE coherence check for a store_results spec, enforced server-side so a
 * malformed client can never author a test that silently fails to calibrate.
 * Returns null when coherent, else a human reason:
 *   · derives:'none'  → baseline, any measure allowed (nothing to verify).
 *   · a calibrating derive → the spec MUST match its catalog target EXACTLY
 *     (slug + measure + unit + modality). This is what guarantees the bridge and
 *     the zone/1RM engine actually pick it up.
 *
 * "No modality" is written `null` on a target and ABSENT on a spec, so both sides
 * are normalized before comparing — otherwise the HR target could never match.
 */
export function calibrationCoherenceError(spec: StoreResultSpec): string | null {
  if (spec.derives === 'none') return null;
  const target = CALIBRATION_TARGET_BY_SLUG.get(spec.slug);
  if (!target || target.derives !== spec.derives) {
    return `El resultado "${spec.label}" no calibra: su medida no está en el catálogo de calibración (zonas de carrera/remo/ski, zonas de pulso o 1RM de un levantamiento).`;
  }
  if (
    spec.measure !== target.measure ||
    spec.unit !== target.unit ||
    (spec.modality ?? null) !== target.modality
  ) {
    return `El resultado "${spec.label}" es incoherente con lo que calibra (${target.coach_label}).`;
  }
  return null;
}
