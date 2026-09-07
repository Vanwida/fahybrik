// Gate a measured or declared value to what the column can store.
// Out-of-band / unknown → null (honest "unknown"), never a 400 on the session.
// Identity fields (assignment, position, modality) do NOT go through here.

import {
  biometricSource,
  executionRecordingMethod,
  HR_SOURCES,
  REPS_STATUSES,
  RX_SCALED_VALUES,
  type BiometricSource,
  type ExecutionRecordingMethod,
  type HrSource,
  type RepsStatus,
  type RxScaled,
} from '@fahybrid/shared/schema';
import { SEGMENT_LEG_PHASES, SEGMENT_LEG_ROLES } from '@/lib/execution/segment-work';

export const RUN_CADENCE_MIN_SPM = 100;
export const RUN_CADENCE_MAX_SPM = 250;
export const INCLINE_MAX_PCT = 30;
export const HR_MIN_BPM = 30;
export const HR_MAX_BPM = 260;
export const NOTES_MAX = 4000;
export const PAIN_NOTE_MAX = 500;
export const SCALED_NOTE_MAX = 500;
export const ROUTE_POLYLINE_MAX = 200_000;
export const SOURCE_WORKOUT_REF_MAX = 200;

export function sanitizeHrBpm(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return r >= HR_MIN_BPM && r <= HR_MAX_BPM ? r : null;
}

export function sanitizeConfidence(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v >= 0 && v <= 1 ? v : null;
}

export function sanitizeRunCadenceSpm(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return r >= RUN_CADENCE_MIN_SPM && r <= RUN_CADENCE_MAX_SPM ? r : null;
}

export function sanitizeInclinePct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const r = Math.round(v * 10) / 10;
  return r >= 0 && r <= INCLINE_MAX_PCT ? r : null;
}

/** Finite and ≥ 0, else null. Floats stay floats (distance, pace, power). */
export function sanitizeNonNegative(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v < 0) return null;
  return v;
}

/**
 * Fit a non-negative measure into a Postgres `numeric(p,s)` column.
 * Overflow (a GPS spike, a bogus calorie) used to 500 the INSERT after Zod
 * had already accepted the number — another day's different error.
 */
export function sanitizeNumericColumn(
  v: number | null | undefined,
  maxAbs: number,
): number | null {
  const n = sanitizeNonNegative(v);
  if (n == null || n > maxAbs) return null;
  return n;
}

export const DISTANCE_M_MAX = 999_999.99; // numeric(8,2)
export const CALORIES_MAX = 99_999.99; // numeric(7,2)
export const WEIGHT_KG_MAX = 9_999.99; // numeric(6,2)
export const PACE_S_MAX = 99_999.99; // numeric(7,2)
export const POWER_W_MAX = 999_999.9; // numeric(7,1)
export const STROKE_SPM_MAX = 9_999.9; // numeric(5,1)
/** Postgres `integer` / `int4`. A 1e15 from a bad timer used to 500 the INSERT. */
export const INT4_MAX = 2_147_483_647;
/** Persist caps — extra rows are dropped, they do not 400 the POST. */
export const SEGMENTS_PER_EXECUTION_MAX = 200;
export const SETS_PER_SEGMENT_MAX = 60;
export const ERG_SPLITS_MAX = 200;

function int4OrNull(n: number): number | null {
  return n > INT4_MAX ? null : n;
}

/** Whole seconds: finite, ≥ 0, rounded. A 2820.4 from a timer is 2820, not a 400. */
export function sanitizeDurationSeconds(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v < 0) return null;
  return int4OrNull(Math.round(v));
}

/** Count / integer column: finite, ≥ 0, rounded. Negatives, NaN, overflow → null. */
export function sanitizeNonNegativeInt(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v < 0) return null;
  return int4OrNull(Math.round(v));
}

/** Positive integer identity (template id, set_index). Floats that aren't whole → null. */
export function sanitizePositiveInt(v: number | null | undefined): number | null {
  if (v == null || !Number.isInteger(v) || v < 1) return null;
  return int4OrNull(v);
}

export function sanitizeRpe(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return r >= 0 && r <= 10 ? r : null;
}

export function sanitizePerceivedExertion(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return r >= 1 && r <= 10 ? r : null;
}

export function clipText(v: string | null | undefined, max: number): string | null {
  if (v == null) return null;
  return v.length <= max ? v : v.slice(0, max);
}

export function sanitizeNotes(v: string | null | undefined): string | null {
  return clipText(v, NOTES_MAX);
}

export function sanitizeSegmentSource(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (t.length === 0 || t.length > 40) return null;
  return t;
}

const HR_SOURCE_SET = new Set<string>(HR_SOURCES);
export function sanitizeHrSource(v: string | null | undefined): HrSource | null {
  if (v == null) return null;
  return HR_SOURCE_SET.has(v) ? (v as HrSource) : null;
}

const REPS_SOURCE_SET = new Set(['athlete_tap', 'sensor', 'sensor_corrected']);
export type RepsSource = 'athlete_tap' | 'sensor' | 'sensor_corrected';
export function sanitizeRepsSource(v: string | null | undefined): RepsSource | null {
  if (v == null) return null;
  return REPS_SOURCE_SET.has(v) ? (v as RepsSource) : null;
}

const REPS_STATUS_SET = new Set<string>(REPS_STATUSES);
export function sanitizeRepsStatus(v: string | null | undefined): RepsStatus | null {
  if (v == null) return null;
  return REPS_STATUS_SET.has(v) ? (v as RepsStatus) : null;
}

const RX_SET = new Set<string>(RX_SCALED_VALUES);
export function sanitizeRxScaled(v: string | null | undefined): RxScaled | null {
  if (v == null) return null;
  return RX_SET.has(v) ? (v as RxScaled) : null;
}

const LEG_ROLE_SET = new Set<string>(SEGMENT_LEG_ROLES);
export function sanitizeLegRole(v: string | null | undefined): string | null {
  if (v == null) return null;
  return LEG_ROLE_SET.has(v) ? v : null;
}

const LEG_PHASE_SET = new Set<string>(SEGMENT_LEG_PHASES);
export function sanitizeLegPhase(v: string | null | undefined): string | null {
  if (v == null) return null;
  return LEG_PHASE_SET.has(v) ? v : null;
}

const DIFFICULTY_SET = new Set(['too_easy', 'as_expected', 'too_hard']);
export type PerceivedDifficulty = 'too_easy' | 'as_expected' | 'too_hard';
export function sanitizePerceivedDifficulty(
  v: string | null | undefined,
): PerceivedDifficulty | null {
  if (v == null) return null;
  return DIFFICULTY_SET.has(v) ? (v as PerceivedDifficulty) : null;
}

const PAIN_AREA_SET = new Set(['rodilla', 'tobillo', 'cadera', 'espalda', 'hombro', 'otra']);
export type PainArea = 'rodilla' | 'tobillo' | 'cadera' | 'espalda' | 'hombro' | 'otra';
export function sanitizePainArea(v: string | null | undefined): PainArea | null {
  if (v == null) return null;
  return PAIN_AREA_SET.has(v) ? (v as PainArea) : null;
}

/**
 * Whole-execution `source` is a HINT. Unknown tokens (`pm5`) are ignored —
 * `deriveExecutionProvenance` decides from the tramos. Never cast a stray
 * string into `biometric_source`.
 */
export function sanitizeDeclaredSource(v: string | null | undefined): BiometricSource | undefined {
  if (v == null || v === '') return undefined;
  const parsed = biometricSource.safeParse(v);
  return parsed.success ? parsed.data : undefined;
}

export function sanitizeRecordedVia(
  v: string | null | undefined,
): ExecutionRecordingMethod | undefined {
  if (v == null || v === '') return undefined;
  const parsed = executionRecordingMethod.safeParse(v);
  return parsed.success ? parsed.data : undefined;
}

/** Unknown completeness → omitted → the writer treats it as `full`. */
export function sanitizeCompleteness(v: string | null | undefined): 'full' | 'partial' | undefined {
  if (v === 'full' || v === 'partial') return v;
  return undefined;
}

export function sanitizeRoutePolyline(v: string | null | undefined): string | null {
  if (v == null || v.length === 0) return null;
  return v.length <= ROUTE_POLYLINE_MAX ? v : null;
}

export function sanitizeSourceWorkoutRef(v: string | null | undefined): string | null {
  return clipText(v, SOURCE_WORKOUT_REF_MAX);
}
