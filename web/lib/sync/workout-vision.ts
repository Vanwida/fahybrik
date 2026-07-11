// Workout-capture vision — Idea 1: "sube una captura → la IA rellena el resultado".
//
// The athlete trained with ANOTHER app (Concept2 PM5 · Garmin · Coros · Strava ·
// Apple) without the watch connected. They upload a screenshot of that app's
// workout summary; a multimodal LLM (text+image) READS the numbers and maps them
// onto our canonical execution model — the SAME shape `recordWorkoutExecution`
// consumes — so the confirm step reuses the honest-logging path.
//
// HONESTY IS THE WHOLE POINT. The LLM extracts ONLY what is visibly in the image.
// Anything it can't read clearly comes back null with confidence 'review' — NEVER
// a fabricated number. The response is a PROPOSAL: nothing is saved here. The
// athlete reviews/corrects, then POSTs the confirmed values to
// /api/sync/workout-execution (adding the assignment_id + their edits).
//
// MODEL: read from env (LLM_VISION_MODEL ?? LLM_MODEL), never hardcoded (Brain
// rule). Provider/base/key are shared with the rest of the stack via the extended
// LLM client (callLlmJsonWithImage). One multimodal model (text+image) serves it.

import 'server-only';

import { z } from 'zod';
import { callLlmJsonWithImage, CoachIaLlmError } from '@/lib/dashboard/coach/ai/llm';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import type { AssignmentDetailResponse } from '@/lib/athlete/assignment-detail';
import type { ExecutionMetricsInput } from '@/lib/sync/record-workout-execution';
import {
  CARDIO,
  CAPTURE_APPS,
  captureAppSchema,
  buildPrescriptionContext,
  buildUserPrompt,
  SYSTEM_PROMPT,
} from './workout-vision-context';
import type {
  CaptureApp,
  PrescribedItemContext,
  PrescribedMeasure,
  PrescriptionContext,
} from './workout-vision-context';
import {
  matchVisionSegments,
  type DetectedSegmentForMatch,
  type PrescribedSegmentForMatch,
} from '@/lib/athlete/vision-segment-match';

// Re-export the "assignment → model inputs" public surface so callers (the
// vision-result route + future consumers) keep importing it from this module.
export { CAPTURE_APPS, captureAppSchema, buildPrescriptionContext };
export type { CaptureApp, PrescribedItemContext, PrescribedMeasure, PrescriptionContext };

// ── Config (env-gated, never hardcoded) ──────────────────────────────────────
export function getWorkoutVisionModel(): string | null {
  const m = (process.env.LLM_VISION_MODEL ?? process.env.LLM_MODEL)?.trim();
  return m ? m : null;
}
export function isWorkoutVisionConfigured(): boolean {
  return getWorkoutVisionModel() != null;
}

export { CoachIaLlmError as WorkoutVisionError };

// Map the capture app to the canonical `biometric_source` enum the execution
// model stores. Only true DEVICES map to themselves; everything else is honestly
// 'manual' (the athlete brought the result in via a photo, not a live sync).
function appToBiometricSource(app: CaptureApp | null): ExecutionMetricsInput['source'] {
  switch (app) {
    case 'garmin':
      return 'garmin';
    case 'coros':
      return 'coros';
    case 'concept2':
      return 'concept2';
    default:
      return 'manual';
  }
}

// ── Honesty wrapper — every proposed value carries WHY we believe it ──────────
// confidence 'detected' = clearly read from the image; 'review' = absent/blurry/
// ambiguous → value is null, the athlete must fill/confirm it. `source` is the
// provenance (the app the capture came from, or 'image' when unattributed).
export type FieldConfidence = 'detected' | 'review';
export interface Field<T> {
  value: T | null;
  confidence: FieldConfidence;
  source: string;
}

function paceUnitForModality(m: Modality): 'per_km' | 'per_500m' {
  return m === 'run' ? 'per_km' : 'per_500m';
}

// ── What we ASK the LLM to return — strict JSON, modality-native, all nullable ─
// Coerced+nullable so a missing/blurry value lands as null (→ 'review'), never a
// fabricated number. `uncertain` lets the model self-flag fields it isn't sure
// about even when it guessed a value; we downgrade those to 'review' too.
const num = z.coerce.number().finite().nonnegative().nullable().default(null);
const hr = z.coerce.number().finite().min(0).max(260).nullable().default(null);
const splitSchema = z.object({
  index: z.coerce.number().int().positive().nullable().default(null),
  // The prescribed item the model THINKS this split maps to, echoed from the
  // context we pass in. Retained as provenance only — linkage is now resolved
  // deterministically server-side (vision-segment-match), not from this hint.
  item_uid: z.string().max(60).nullable().default(null),
  time_s: num,
  distance_m: num,
  pace_s: num,
  spm: num,
  avg_hr: hr,
  power_w: num,
  calories: num,
});
// One time-in-zone row (Garmin/Coros/Polar zone table), e.g. "Umbral 17% 11:35".
const zoneRowSchema = z.object({
  label: z.string().max(80).nullable().default(null),
  seconds: num,
  pct: z.coerce.number().finite().min(0).max(100).nullable().default(null),
});
const visionRawSchema = z.object({
  total_time_s: num,
  distance_m: num,
  avg_pace_s: num,
  // Best/fastest split pace read from a "mejor" tile (same unit as avg pace).
  best_pace_s: num,
  pace_unit: z.enum(['per_km', 'per_500m', 'per_mile']).nullable().default(null),
  avg_hr: hr,
  max_hr: hr,
  calories: num,
  avg_spm: num,
  avg_power_w: num,
  // Training load (Garmin "Carga", etc.) — a unitless device score.
  training_load: num,
  splits: z.array(splitSchema).max(100).default([]),
  // Time-in-zone table rows when the screenshot shows one.
  zones: z.array(zoneRowSchema).max(12).default([]),
  uncertain: z.array(z.string().max(60)).max(40).default([]),
  notes: z.string().max(1000).nullable().default(null),
});
type VisionRaw = z.infer<typeof visionRawSchema>;
export type VisionZoneRow = z.infer<typeof zoneRowSchema>;

// ── Mapping: LLM raw JSON → honesty-wrapped fields + a ready-to-confirm proposal ─
export interface DetectedMetrics {
  total_duration_seconds: Field<number>;
  distance_meters: Field<number>;
  avg_pace_s: Field<number>;
  pace_unit: 'per_km' | 'per_500m';
  avg_hr: Field<number>;
  max_hr: Field<number>;
  calories: Field<number>;
  avg_power_w: Field<number>;
  stroke_rate_spm: Field<number>;
  // Screenshots never contain RPE → always 'review' for the athlete to add.
  perceived_exertion: Field<number>;
}
export interface DetectedSegment {
  position: number;
  modality: Modality;
  // The prescribed template_segments.id this segment maps to, resolved by the
  // deterministic matcher (modality + relative order + expected-measure
  // tolerance — vision-segment-match). Null when no honest match exists →
  // surfaced as an unmatched lap (better unlinked than misattributed).
  template_segment_id: number | null;
  fields: {
    duration_seconds: Field<number>;
    distance_meters: Field<number>;
    avg_pace_s: Field<number>;
    avg_hr: Field<number>;
    avg_power_w: Field<number>;
    stroke_rate_spm: Field<number>;
    calories: Field<number>;
  };
}
export interface WorkoutVisionProposal {
  prescription: PrescriptionContext;
  metrics: DetectedMetrics;
  segments: DetectedSegment[];
  notes: string | null;
  // The SAME shape recordWorkoutExecution consumes — only DETECTED (or
  // deterministically DERIVED) values are filled (review/null fields are omitted).
  // The confirm step POSTs this (plus assignment_id + any athlete edits) to
  // /api/sync/workout-execution.
  proposed_execution: ExecutionMetricsInput;
  // The prescribed link for the AGGREGATE (chart-only) path: when a screenshot
  // shows totals but no per-split table, there are no `segments` to carry a link,
  // so the client attaches this to its single collapsed segment. Null unless the
  // prescription has exactly one cardio item to attribute the whole effort to.
  aggregate_template_segment_id: number | null;
  // Interim device extras not yet promoted to first-class stored/analytics
  // fields. Surfaced so nothing the model read is silently dropped, and folded
  // into the notes on the confirm payload.
  // TODO(next layer): promote training_load + time-in-zone to first-class
  // stored + analytics fields (own columns + running-section cards).
  training_load: number | null;
  best_pace_s: number | null;
  zones: VisionZoneRow[];
  model: string;
}

// A value becomes a detected field iff it's non-null AND the model didn't flag
// its key as uncertain. Otherwise it's null/'review' — never fabricated.
function field<T extends number>(
  value: T | null,
  key: string,
  uncertain: Set<string>,
  source: string,
): Field<T> {
  const detected = value != null && !uncertain.has(key);
  return detected
    ? { value, confidence: 'detected', source }
    : { value: null, confidence: 'review', source };
}

// A duration-only "segment" shorter than this is device noise (the "00:03" ghost
// some apps emit at the transition between laps), never real work → dropped.
const MIN_REAL_DURATION_S = 20;

function round(n: number | null): number | null {
  return n == null ? null : Math.round(n);
}

// seconds → m:ss (for the interim "Mejor 4:19/km" note).
function clock(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Distance = time ÷ pace, deterministically (never by the LLM). Only when both
// are present and positive; unit picks the multiplier (per_km → 1000, /500m → 500).
function deriveDistanceMeters(
  timeS: number | null,
  paceS: number | null,
  unit: 'per_km' | 'per_500m',
): number | null {
  if (timeS == null || paceS == null || timeS <= 0 || paceS <= 0) return null;
  const unitMeters = unit === 'per_km' ? 1000 : 500;
  return Math.round((timeS / paceS) * unitMeters);
}

export function mapVisionToProposal(args: {
  raw: VisionRaw;
  ctx: PrescriptionContext;
  app: CaptureApp | null;
  model: string;
}): WorkoutVisionProposal {
  const { raw, ctx, app, model } = args;
  const uncertain = new Set(raw.uncertain.map((s) => s.trim().toLowerCase()));
  const src = app ?? 'image';
  const modality = ctx.primary_modality;
  const nativeUnit = paceUnitForModality(modality === 'other' ? 'run' : modality);

  // The SOLE cardio item's id is the linkage for the AGGREGATE (chart-only) path:
  // when there are no per-split rows, the whole effort attaches to its single
  // prescription instead of orphaning. Per-split linkage is resolved below by the
  // deterministic matcher (modality + order + measure), NOT the LLM's item_uid.
  const cardioItems = ctx.items.filter((i) => i.modality != null && CARDIO.includes(i.modality));
  const soleCardioSegId = cardioItems.length === 1 ? cardioItems[0]!.template_segment_id : null;

  // If the model reported a pace in a unit that contradicts the modality's native
  // unit, we can't trust the placement → force that pace to 'review'.
  const paceUnitMismatch = raw.pace_unit != null && raw.pace_unit !== nativeUnit;

  let distanceDerived = false;

  const metrics: DetectedMetrics = {
    total_duration_seconds: field(
      raw.total_time_s != null ? Math.round(raw.total_time_s) : null,
      'total_time_s',
      uncertain,
      src,
    ),
    distance_meters: field(raw.distance_m, 'distance_m', uncertain, src),
    avg_pace_s: paceUnitMismatch
      ? { value: null, confidence: 'review', source: src }
      : field(raw.avg_pace_s, 'avg_pace_s', uncertain, src),
    pace_unit: nativeUnit,
    avg_hr: field(round(raw.avg_hr), 'avg_hr', uncertain, src),
    max_hr: field(round(raw.max_hr), 'max_hr', uncertain, src),
    calories: field(raw.calories, 'calories', uncertain, src),
    avg_power_w: field(raw.avg_power_w, 'avg_power_w', uncertain, src),
    stroke_rate_spm: field(raw.avg_spm, 'avg_spm', uncertain, src),
    // RPE is never in a screenshot — the athlete adds it on review.
    perceived_exertion: { value: null, confidence: 'review', source: 'athlete' },
  };

  // DERIVE the aggregate distance when it wasn't legible but time + pace were, so
  // analytics (which gate a run on distance_meters>0) still count it. Honest, not
  // fabricated: it's flagged 'derived' + surfaced amber for the athlete to confirm.
  if (metrics.distance_meters.value == null) {
    const d = deriveDistanceMeters(metrics.total_duration_seconds.value, metrics.avg_pace_s.value, nativeUnit);
    if (d != null) {
      metrics.distance_meters = { value: d, confidence: 'review', source: 'derived' };
      distanceDerived = true;
    }
  }

  const segments: DetectedSegment[] = raw.splits.map((s, i) => {
    const position = (s.index != null ? s.index : i + 1) - 1;
    const durationField = field(s.time_s != null ? Math.round(s.time_s) : null, 'time_s', uncertain, src);
    const paceField = paceUnitMismatch
      ? { value: null, confidence: 'review' as const, source: src }
      : field(s.pace_s, 'pace_s', uncertain, src);
    let distanceField = field(s.distance_m, 'distance_m', uncertain, src);
    if (distanceField.value == null) {
      const d = deriveDistanceMeters(durationField.value, paceField.value, nativeUnit);
      if (d != null) {
        distanceField = { value: d, confidence: 'review', source: 'derived' };
        distanceDerived = true;
      }
    }
    return {
      position: position >= 0 ? position : i,
      modality: modality === 'other' ? 'other' : modality,
      // Filled by the deterministic matcher below (null until then).
      template_segment_id: null,
      fields: {
        duration_seconds: durationField,
        distance_meters: distanceField,
        avg_pace_s: paceField,
        avg_hr: field(round(s.avg_hr), 'avg_hr', uncertain, src),
        avg_power_w: field(s.power_w, 'power_w', uncertain, src),
        stroke_rate_spm: field(s.spm, 'spm', uncertain, src),
        calories: field(s.calories, 'calories', uncertain, src),
      },
    };
  });

  // ── Deterministic prescription linkage (server-side, honest) ────────────────
  // Match each REAL detected split to a prescribed template_segment by modality
  // + relative order + expected-measure tolerance (see vision-segment-match).
  // Ghost / no-work splits never anchor a link, and they're excluded from the
  // count so a stray transition ghost can't break an otherwise-clean 1:1 match.
  const realMask = segments.map((seg) => detectedHasWork(seg));
  const detForMatch: DetectedSegmentForMatch[] = segments
    .filter((_, i) => realMask[i])
    .map((seg) => ({
      modality: seg.modality,
      distance_meters: seg.fields.distance_meters.value,
      duration_seconds: seg.fields.duration_seconds.value,
      calories: seg.fields.calories.value,
    }));
  const prescForMatch: PrescribedSegmentForMatch[] = ctx.items.map((it) => ({
    template_segment_id: it.template_segment_id,
    modality: it.modality,
    measure_kind: it.measure,
    measure_value: it.measure_value,
  }));
  const matchedIds = matchVisionSegments(detForMatch, prescForMatch);
  let matchIdx = 0;
  for (let i = 0; i < segments.length; i++) {
    if (!realMask[i]) continue;
    segments[i]!.template_segment_id = matchedIds[matchIdx] ?? null;
    matchIdx += 1;
  }

  // Interim device extras (best pace, training load) + the derived-distance flag
  // ride along in the notes so nothing read is dropped and the estimate is honest.
  const noteParts: string[] = [];
  if (raw.notes) noteParts.push(raw.notes);
  if (raw.training_load != null) noteParts.push(`Carga ${Math.round(raw.training_load)}`);
  if (raw.best_pace_s != null) {
    noteParts.push(`Mejor ${clock(raw.best_pace_s)}${nativeUnit === 'per_km' ? '/km' : '/500m'}`);
  }
  if (distanceDerived) noteParts.push('distancia estimada (tiempo×ritmo)');
  const notes = noteParts.length ? noteParts.join(' · ') : null;

  const zones = raw.zones.filter((z) => z.label != null || z.seconds != null);

  const proposed_execution = buildProposedExecution({
    metrics,
    segments,
    modality,
    nativeUnit,
    app,
    notes,
    zones,
    aggregateSegId: soleCardioSegId,
  });

  return {
    prescription: ctx,
    metrics,
    segments,
    notes,
    proposed_execution,
    aggregate_template_segment_id: soleCardioSegId,
    training_load: raw.training_load,
    best_pace_s: raw.best_pace_s != null ? Math.round(raw.best_pace_s) : null,
    zones,
    model,
  };
}

// A DETECTED split carries real work iff it has positive distance or a
// non-trivial duration (a cardio split has no reps). Mirrors isRealSegment's
// intent on the mapped shape so the matcher's count logic ignores ghosts.
function detectedHasWork(seg: DetectedSegment): boolean {
  const dist = seg.fields.distance_meters.value;
  const dur = seg.fields.duration_seconds.value;
  if (dist != null && dist > 0) return true;
  if (dur != null && dur >= MIN_REAL_DURATION_S) return true;
  return false;
}

// Attach the whole effort's time-in-zone rows to a segment's raw_lap_data_json
// under the `zone_seconds` key (the shape ingestExecutionSegments already stores).
function attachZones(seg: Record<string, unknown>, zones: VisionZoneRow[]): void {
  if (zones.length > 0) seg.zone_seconds_json = zones;
}

// A segment carries real work iff it has distance, reps, or a non-trivial
// duration. Drops the stray sub-20s duration-only ghost.
function isRealSegment(seg: Record<string, unknown>): boolean {
  const dist = seg.distance_meters as number | undefined;
  const reps = seg.reps_completed as number | undefined;
  const dur = seg.duration_seconds as number | undefined;
  if (dist != null && dist > 0) return true;
  if (reps != null && reps > 0) return true;
  if (dur != null && dur >= MIN_REAL_DURATION_S) return true;
  return false;
}

// Assemble the ExecutionMetricsInput from the mapped fields. Omitted keys
// (review/null) stay undefined so the confirm step / Zod treat them as "not set",
// never a fabricated 0. Pace lands in the modality-native column; the prescribed
// linkage rides along as template_segment_id; time-in-zone rows are preserved.
function buildProposedExecution(args: {
  metrics: DetectedMetrics;
  segments: DetectedSegment[];
  modality: Modality;
  nativeUnit: 'per_km' | 'per_500m';
  app: CaptureApp | null;
  notes: string | null;
  zones: VisionZoneRow[];
  aggregateSegId: number | null;
}): ExecutionMetricsInput {
  const { metrics, segments, modality, nativeUnit, app, notes, zones, aggregateSegId } = args;
  // The sync layer (normalizeModality) maps any non-canonical modality (functional/
  // core/mobility/other) to 'other'; we pass the prescription modality verbatim.
  const segModality = modality;

  const exec: ExecutionMetricsInput = {
    source: appToBiometricSource(app),
    // Detected/derived only; a missing total stays undefined (never 0).
    ...(metrics.total_duration_seconds.value != null
      ? { total_duration_seconds: metrics.total_duration_seconds.value }
      : {}),
    ...(notes ? { notes } : {}),
  };

  const paceKey = nativeUnit === 'per_km' ? 'avg_pace_s_per_km' : 'avg_pace_s_per_500m';

  const segs = segments
    .map((s) => {
      const f = s.fields;
      const seg: Record<string, unknown> = { position: s.position, modality: segModality };
      if (s.template_segment_id != null) seg.template_segment_id = s.template_segment_id;
      if (f.duration_seconds.value != null) seg.duration_seconds = f.duration_seconds.value;
      if (f.distance_meters.value != null) seg.distance_meters = f.distance_meters.value;
      if (f.avg_pace_s.value != null) seg[paceKey] = f.avg_pace_s.value;
      if (f.avg_hr.value != null) seg.avg_hr = f.avg_hr.value;
      if (f.avg_power_w.value != null) seg.avg_power_w = f.avg_power_w.value;
      if (f.stroke_rate_spm.value != null) seg.stroke_rate_spm = f.stroke_rate_spm.value;
      if (f.calories.value != null) seg.calories = f.calories.value;
      return seg;
    })
    // KILL GARBAGE: keep only segments with real measured work (drops the ghost).
    .filter(isRealSegment);

  if (segs.length > 0) {
    // Zones belong to the whole effort → stash them on the first segment.
    attachZones(segs[0]!, zones);
    exec.segments = segs as ExecutionMetricsInput['segments'];
  } else {
    // No usable per-split detail but we have an aggregate (chart-only path) →
    // represent it as ONE segment so the measured work isn't lost.
    const agg: Record<string, unknown> = { position: 0, modality: segModality };
    if (aggregateSegId != null) agg.template_segment_id = aggregateSegId;
    if (metrics.total_duration_seconds.value != null) agg.duration_seconds = metrics.total_duration_seconds.value;
    if (metrics.distance_meters.value != null) agg.distance_meters = metrics.distance_meters.value;
    if (metrics.avg_pace_s.value != null) agg[paceKey] = metrics.avg_pace_s.value;
    if (metrics.avg_hr.value != null) agg.avg_hr = metrics.avg_hr.value;
    if (metrics.max_hr.value != null) agg.max_hr = metrics.max_hr.value;
    if (metrics.calories.value != null) agg.calories = metrics.calories.value;
    if (metrics.avg_power_w.value != null) agg.avg_power_w = metrics.avg_power_w.value;
    if (metrics.stroke_rate_spm.value != null) agg.stroke_rate_spm = metrics.stroke_rate_spm.value;
    attachZones(agg, zones);
    if (isRealSegment(agg)) {
      exec.segments = [agg] as ExecutionMetricsInput['segments'];
    }
  }

  return exec;
}

// ── Orchestrator — the route's single entry point ─────────────────────────────
export async function extractWorkoutResultFromImage(args: {
  detail: AssignmentDetailResponse;
  image_base64: string;
  mime_type: string;
  app?: CaptureApp | null;
  athlete_id?: bigint | number | null;
  fetchImpl?: typeof fetch;
}): Promise<WorkoutVisionProposal> {
  const model = getWorkoutVisionModel();
  if (!model) throw new CoachIaLlmError('unconfigured', 'LLM_VISION_MODEL / LLM_MODEL no configurado');

  const app = args.app ?? null;
  const ctx = buildPrescriptionContext(args.detail);

  const rawUnknown = await callLlmJsonWithImage({
    model,
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(ctx, app),
    image_base64: args.image_base64,
    mime_type: args.mime_type,
    meta: { surface: 'workout_capture', athlete_id: args.athlete_id ?? null },
    fetchImpl: args.fetchImpl,
  });

  const parsed = visionRawSchema.safeParse(rawUnknown);
  if (!parsed.success) {
    throw new CoachIaLlmError('invalid_json', 'La IA devolvió un resultado con forma inesperada');
  }

  return mapVisionToProposal({ raw: parsed.data, ctx, app, model });
}
