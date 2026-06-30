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
import { callLlmJsonWithImage, PabloIaLlmError } from '@/lib/dashboard/coach/ai/llm';
import { prescriptionToText } from '@fahybrid/shared/domain/prescription';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import type {
  AssignmentDetailResponse,
  AssignmentDetailItem,
} from '@/lib/athlete/assignment-detail';
import type { ExecutionMetricsInput } from '@/lib/sync/record-workout-execution';

// ── Config (env-gated, never hardcoded) ──────────────────────────────────────
export function getWorkoutVisionModel(): string | null {
  const m = (process.env.LLM_VISION_MODEL ?? process.env.LLM_MODEL)?.trim();
  return m ? m : null;
}
export function isWorkoutVisionConfigured(): boolean {
  return getWorkoutVisionModel() != null;
}

export { PabloIaLlmError as WorkoutVisionError };

// ── The app the screenshot came from (athlete picks it; drives the prompt hint
// and the honest provenance stamp). Kept as an open-ish set matched to the spec. ─
export const CAPTURE_APPS = ['concept2', 'garmin', 'coros', 'strava', 'apple', 'other'] as const;
export type CaptureApp = (typeof CAPTURE_APPS)[number];
export const captureAppSchema = z.enum(CAPTURE_APPS);

const APP_LABEL: Record<CaptureApp, string> = {
  concept2: 'Concept2 PM5',
  garmin: 'Garmin',
  coros: 'Coros',
  strava: 'Strava',
  apple: 'Apple Fitness / Apple Watch',
  other: 'otra app de entreno',
};

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
const splitSchema = z.object({
  index: z.coerce.number().int().positive().nullable().default(null),
  time_s: num,
  distance_m: num,
  pace_s: num,
  spm: num,
  avg_hr: z.coerce.number().finite().min(0).max(260).nullable().default(null),
  power_w: num,
  calories: num,
});
const visionRawSchema = z.object({
  total_time_s: num,
  distance_m: num,
  avg_pace_s: num,
  pace_unit: z.enum(['per_km', 'per_500m', 'per_mile']).nullable().default(null),
  avg_hr: z.coerce.number().finite().min(0).max(260).nullable().default(null),
  max_hr: z.coerce.number().finite().min(0).max(260).nullable().default(null),
  calories: num,
  avg_spm: num,
  avg_power_w: num,
  splits: z.array(splitSchema).max(100).default([]),
  uncertain: z.array(z.string().max(60)).max(40).default([]),
  notes: z.string().max(1000).nullable().default(null),
});
type VisionRaw = z.infer<typeof visionRawSchema>;

// ── Prescription context — what the workout ASKED for (drives the prompt) ─────
export interface PrescriptionContext {
  primary_modality: Modality;
  format: string;
  summary: string;
  bouts_expected: number | null;
  items: { modality: Modality | null; text: string; template_segment_id: number }[];
}

const CARDIO: Modality[] = ['run', 'row', 'ski', 'bike'];

function itemModality(item: AssignmentDetailItem): Modality | null {
  return item.prescription_json?.modality ?? null;
}

function itemText(item: AssignmentDetailItem): string {
  if (item.prescription_json) {
    const t = prescriptionToText(item.prescription_json).trim();
    if (t) return `${item.exercise_name}: ${t}`;
  }
  return item.exercise_name;
}

/** Distil the assignment's prescription into the context the prompt needs. */
export function buildPrescriptionContext(detail: AssignmentDetailResponse): PrescriptionContext {
  const items = (detail.workout?.blocks ?? []).flatMap((b) => b.items);
  const ctxItems = items.map((it) => ({
    modality: itemModality(it),
    text: itemText(it),
    template_segment_id: it.template_segment_id,
  }));

  // Screenshots are cardio-app summaries → prefer a cardio modality as primary.
  const cardioItem = items.find((it) => {
    const m = itemModality(it);
    return m != null && CARDIO.includes(m);
  });
  const primaryItem = cardioItem ?? items[0];
  const primary_modality = (primaryItem ? itemModality(primaryItem) : null) ?? 'other';

  // Best-effort prescribed bout count for the primary line (sets, else rounds).
  let bouts_expected: number | null = null;
  const p = primaryItem?.prescription_json;
  if (p) bouts_expected = p.sets?.length ?? p.rounds ?? null;

  const format = detail.workout?.blocks?.[0]?.format ?? primaryItem?.prescription_json?.scheme ?? '';
  const summary = ctxItems.map((i) => `- ${i.text}`).join('\n');

  return { primary_modality, format, summary, bouts_expected, items: ctxItems };
}

// ── Prompt ────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = [
  'Eres un asistente que LEE la captura de pantalla del resumen de un entreno hecho en',
  'otra app (Concept2 PM5, Garmin, Coros, Strava o Apple) y extrae EXCLUSIVAMENTE los',
  'números que aparecen visiblemente en la imagen.',
  '',
  'REGLAS DE HONESTIDAD (críticas):',
  '- NO inventes ningún valor. Si un dato no está claramente legible en la imagen,',
  '  devuélvelo como null y añade su nombre al array "uncertain". Nunca lo estimes.',
  '- No calcules ni deduzcas valores que no se ven (p.ej. no inventes RPE: las apps',
  '  no lo muestran).',
  '- Los tiempos van en SEGUNDOS totales (9:41.2 = 581 s). Los ritmos en segundos por',
  '  unidad (1:54/500m = 114). Distancias en metros. FC en ppm. Calorías en kcal.',
  '- Devuelve los splits/series en el orden que aparecen, con su índice.',
  '',
  'Responde SOLO con JSON con esta forma exacta (cualquier dato ausente = null):',
  '{"total_time_s":number|null,"distance_m":number|null,"avg_pace_s":number|null,',
  '"pace_unit":"per_km"|"per_500m"|"per_mile"|null,"avg_hr":number|null,"max_hr":number|null,',
  '"calories":number|null,"avg_spm":number|null,"avg_power_w":number|null,',
  '"splits":[{"index":number,"time_s":number|null,"distance_m":number|null,"pace_s":number|null,',
  '"spm":number|null,"avg_hr":number|null,"power_w":number|null,"calories":number|null}],',
  '"uncertain":[string],"notes":string|null}',
].join('\n');

function buildUserPrompt(ctx: PrescriptionContext, app: CaptureApp | null): string {
  const native = ctx.primary_modality === 'run' ? '/km' : '/500m';
  return [
    app ? `La captura es de: ${APP_LABEL[app]}.` : 'La captura es de una app de entreno.',
    '',
    'El entreno PRESCRITO pedía:',
    ctx.summary || `- (modalidad ${ctx.primary_modality})`,
    '',
    `Modalidad principal a medir: ${ctx.primary_modality} (ritmo nativo ${native}).`,
    ctx.bouts_expected
      ? `Se esperaban ~${ctx.bouts_expected} series/bloques: busca sus splits.`
      : 'Busca el tiempo total, la distancia, el ritmo medio y los splits si los hay.',
    '',
    'Extrae SOLO lo que veas en la imagen y devuélvelo en el JSON indicado.',
  ].join('\n');
}

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
  // The SAME shape recordWorkoutExecution consumes — only DETECTED values are
  // filled (review/null fields are omitted). The confirm step POSTs this (plus
  // assignment_id + any athlete edits) to /api/sync/workout-execution.
  proposed_execution: ExecutionMetricsInput;
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

  // If the model reported a pace in a unit that contradicts the modality's native
  // unit, we can't trust the placement → force that pace to 'review'.
  const paceUnitMismatch = raw.pace_unit != null && raw.pace_unit !== nativeUnit;

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

  const segments: DetectedSegment[] = raw.splits.map((s, i) => {
    const position = (s.index != null ? s.index : i + 1) - 1;
    return {
      position: position >= 0 ? position : i,
      modality: modality === 'other' ? 'other' : modality,
      fields: {
        duration_seconds: field(s.time_s != null ? Math.round(s.time_s) : null, 'time_s', uncertain, src),
        distance_meters: field(s.distance_m, 'distance_m', uncertain, src),
        avg_pace_s: paceUnitMismatch
          ? { value: null, confidence: 'review', source: src }
          : field(s.pace_s, 'pace_s', uncertain, src),
        avg_hr: field(round(s.avg_hr), 'avg_hr', uncertain, src),
        avg_power_w: field(s.power_w, 'power_w', uncertain, src),
        stroke_rate_spm: field(s.spm, 'spm', uncertain, src),
        calories: field(s.calories, 'calories', uncertain, src),
      },
    };
  });

  const proposed_execution = buildProposedExecution({ metrics, segments, modality, nativeUnit, app, notes: raw.notes });

  return { prescription: ctx, metrics, segments, notes: raw.notes, proposed_execution, model };
}

function round(n: number | null): number | null {
  return n == null ? null : Math.round(n);
}

// Assemble the ExecutionMetricsInput from ONLY the detected fields. Omitted keys
// (review/null) stay undefined so the confirm step / Zod treat them as "not set",
// never as a fabricated 0. Pace lands in the modality-native column.
function buildProposedExecution(args: {
  metrics: DetectedMetrics;
  segments: DetectedSegment[];
  modality: Modality;
  nativeUnit: 'per_km' | 'per_500m';
  app: CaptureApp | null;
  notes: string | null;
}): ExecutionMetricsInput {
  const { metrics, segments, modality, nativeUnit, app, notes } = args;
  // The sync layer (normalizeModality) maps any non-canonical modality (functional/
  // core/mobility/other) to 'other'; we pass the prescription modality verbatim.
  const segModality = modality;

  const exec: ExecutionMetricsInput = {
    source: appToBiometricSource(app),
    // Detected only; a missing total stays undefined (never 0).
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
      if (f.duration_seconds.value != null) seg.duration_seconds = f.duration_seconds.value;
      if (f.distance_meters.value != null) seg.distance_meters = f.distance_meters.value;
      if (f.avg_pace_s.value != null) seg[paceKey] = f.avg_pace_s.value;
      if (f.avg_hr.value != null) seg.avg_hr = f.avg_hr.value;
      if (f.avg_power_w.value != null) seg.avg_power_w = f.avg_power_w.value;
      if (f.stroke_rate_spm.value != null) seg.stroke_rate_spm = f.stroke_rate_spm.value;
      if (f.calories.value != null) seg.calories = f.calories.value;
      return seg;
    })
    // Drop segments that carry no measured value at all (pure noise).
    .filter((seg) => Object.keys(seg).length > 2);

  if (segs.length > 0) {
    exec.segments = segs as ExecutionMetricsInput['segments'];
  } else {
    // No per-split detail but we have an aggregate → represent it as ONE segment
    // so the measured work isn't lost on the confirm path.
    const agg: Record<string, unknown> = { position: 0, modality: segModality };
    if (metrics.distance_meters.value != null) agg.distance_meters = metrics.distance_meters.value;
    if (metrics.avg_pace_s.value != null) agg[paceKey] = metrics.avg_pace_s.value;
    if (metrics.avg_hr.value != null) agg.avg_hr = metrics.avg_hr.value;
    if (metrics.max_hr.value != null) agg.max_hr = metrics.max_hr.value;
    if (metrics.calories.value != null) agg.calories = metrics.calories.value;
    if (metrics.avg_power_w.value != null) agg.avg_power_w = metrics.avg_power_w.value;
    if (metrics.stroke_rate_spm.value != null) agg.stroke_rate_spm = metrics.stroke_rate_spm.value;
    if (Object.keys(agg).length > 2) {
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
  if (!model) throw new PabloIaLlmError('unconfigured', 'LLM_VISION_MODEL / LLM_MODEL no configurado');

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
    throw new PabloIaLlmError('invalid_json', 'La IA devolvió un resultado con forma inesperada');
  }

  return mapVisionToProposal({ raw: parsed.data, ctx, app, model });
}
