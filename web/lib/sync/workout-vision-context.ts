// Workout-capture vision — the ASSIGNMENT → MODEL-INPUTS half of Idea 1.
//
// This module turns the athlete's PRESCRIBED workout (+ the app the screenshot
// came from) into the structured context and the system/user prompts the
// multimodal LLM reads. The extraction/mapping half (raw JSON → honest proposal
// → confirm payload) lives in `workout-vision.ts`, which imports from here. Split
// out to keep each file focused (and under the size budget).

import 'server-only';

import { z } from 'zod';
import {
  prescriptionToText,
  prescriptionTarget,
  setMeasure,
  setTarget,
} from '@fahybrid/shared/domain/prescription';
import type { Modality, Prescription } from '@fahybrid/shared/domain/prescription';
import type {
  AssignmentDetailResponse,
  AssignmentDetailItem,
} from '@/lib/athlete/assignment-detail';

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

// ── Prescription context — what the workout ASKED for (drives the prompt) ─────
// Each item is passed to the model STRUCTURED (uid + modality + measure + target
// + bouts + rest) so it can MAP what it reads onto the prescription and echo the
// matching `item_uid` per split/segment. `template_segment_id` is the DB linkage
// we resolve that uid back to when building the confirm payload.
export type PrescribedMeasure = 'reps' | 'distance' | 'time' | 'cals';
export interface PrescribedItemContext {
  uid: string;
  modality: Modality | null;
  measure: PrescribedMeasure | null;
  // A short target token the model can reason with: 'pace' | 'zone' | 'RPE' |
  // 'RIR' | '%RM' | 'kg' | 'cal' | 'W' | 'ppm' | null.
  target: string | null;
  reps: number | null; // expected bouts (per-set count, else rounds)
  rest_s: number | null;
  text: string; // human-readable prescription line (for context)
  template_segment_id: number;
}
export interface PrescriptionContext {
  primary_modality: Modality;
  format: string;
  summary: string;
  bouts_expected: number | null;
  items: PrescribedItemContext[];
}

export const CARDIO: Modality[] = ['run', 'row', 'ski', 'bike'];

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

// The unit of WORK the line measures → the model's `measure` axis.
function itemMeasure(p: Prescription | null): PrescribedMeasure | null {
  if (!p) return null;
  const m = (p.sets ?? []).map(setMeasure).find((x) => x != null);
  switch (m?.kind) {
    case 'reps':
      return 'reps';
    case 'distance':
      return 'distance';
    case 'duration':
      return 'time';
    case 'calories':
      return 'cals';
    default:
      return null;
  }
}

// The intensity objective of the line → the model's `target` axis.
function itemTarget(p: Prescription | null): string | null {
  if (!p) return null;
  const t = prescriptionTarget(p) ?? (p.sets ?? []).map(setTarget).find((x) => x != null);
  switch (t?.kind) {
    case 'pace':
      return 'pace';
    case 'hr_zone':
      return 'zone';
    case 'hr_bpm':
      return 'ppm';
    case 'rpe':
      return 'RPE';
    case 'rir':
      return 'RIR';
    case 'percent_rm':
      return '%RM';
    case 'kg':
      return 'kg';
    case 'calories':
      return 'cal';
    case 'watts':
      return 'W';
    default:
      return null;
  }
}

// Expected bout count for a line: a real per-set array counts sets; a single
// representative set (the distance/cal stash of a conditioning block) takes its
// multiplier from `rounds`. Mirrors prescriptionToText's `count`.
function itemReps(p: Prescription | null): number | null {
  if (!p) return null;
  const setsLen = p.sets?.length ?? 0;
  if (setsLen > 1) return setsLen;
  return p.rounds ?? (setsLen > 0 ? setsLen : null);
}

function itemRestS(p: Prescription | null): number | null {
  if (!p) return null;
  const setRest = (p.sets ?? []).map((s) => s.rest_s).find((r) => r != null);
  return setRest ?? p.rest_s ?? null;
}

/** Distil the assignment's prescription into the context the prompt needs. */
export function buildPrescriptionContext(detail: AssignmentDetailResponse): PrescriptionContext {
  const items = (detail.workout?.blocks ?? []).flatMap((b) => b.items);
  const ctxItems: PrescribedItemContext[] = items.map((it) => {
    const p = it.prescription_json ?? null;
    return {
      uid: it.uid,
      modality: itemModality(it),
      measure: itemMeasure(p),
      target: itemTarget(p),
      reps: itemReps(p),
      rest_s: itemRestS(p),
      text: itemText(it),
      template_segment_id: it.template_segment_id,
    };
  });

  // Screenshots are cardio-app summaries → prefer a cardio modality as primary.
  const cardioItem = items.find((it) => {
    const m = itemModality(it);
    return m != null && CARDIO.includes(m);
  });
  const primaryItem = cardioItem ?? items[0];
  const primary_modality = (primaryItem ? itemModality(primaryItem) : null) ?? 'other';

  const bouts_expected = itemReps(primaryItem?.prescription_json ?? null);

  const format = detail.workout?.blocks?.[0]?.format ?? primaryItem?.prescription_json?.scheme ?? '';
  const summary = ctxItems.map((i) => `- ${i.text}`).join('\n');

  return { primary_modality, format, summary, bouts_expected, items: ctxItems };
}

// ── Prompt ────────────────────────────────────────────────────────────────────
export const SYSTEM_PROMPT = [
  'Eres un experto que LEE la captura de pantalla del resumen de un entreno hecho en',
  'otra app o dispositivo (Garmin · Strava · Concept2 PM5 · Apple Fitness · Coros ·',
  'Polar) y MAPEA lo que ves sobre el entreno PRESCRITO del atleta en FAHYBRIK.',
  '',
  'HONESTIDAD (lo más importante):',
  '- NO inventes NADA. Si un dato no está claramente legible, devuélvelo null Y añade',
  '  su nombre a "uncertain". Nunca estimes ni deduzcas un número que no se ve.',
  '- NUNCA devuelvas RPE ni esfuerzo percibido: es subjetivo y NO aparece en capturas.',
  '  No incluyas ningún campo de esfuerzo percibido.',
  '- Extrae SOLO lo visible. Ante la duda: null + "uncertain".',
  '',
  'UNIDADES (obligatorias):',
  '- Tiempos totales en SEGUNDOS (1:07:02 = 4022; 9:41 = 581).',
  '- Ritmo de carrera en s/km (4:48/km = 288). Ritmo de ergómetro en s/500m (1:54 = 114).',
  '- Distancia en METROS. FC en ppm. Calorías en kcal. Potencia en W. Cadencia en spm.',
  '',
  'EL ENTRENO PRESCRITO ES TU MARCO:',
  '- Te paso los ítems prescritos (item_uid, modalidad, medida, objetivo, repeticiones,',
  '  descanso). Mapea lo que leas sobre ellos y, en cada split/segmento que corresponda',
  '  a un ítem prescrito, devuelve su "item_uid" exactamente como te lo doy.',
  '',
  'DOS CAMINOS (elige según lo que MUESTRE la captura):',
  '(a) Si hay una TABLA numérica de vueltas/splits (una fila por serie con su tiempo/',
  '    distancia/ritmo/FC): devuelve un objeto en "splits" por cada serie, en orden,',
  '    mapeadas a las repeticiones prescritas.',
  '(b) Si SOLO hay un gráfico/curva + totales (sin tabla numérica por serie): NO',
  '    inventes splits por serie. Devuelve "splits":[], rellena los totales, añade',
  '    "per_rep_splits" a "uncertain" y explica en "notes" que las series no eran',
  '    legibles una a una.',
  '',
  'EXTRAE TODOS los totales que aparezcan: total_time_s, distance_m, avg_pace_s + pace_unit,',
  'best_pace_s (mejor / más rápido), avg_hr, max_hr, calories, avg_power_w, avg_spm,',
  'training_load (p.ej. Garmin "Carga 212"), y la tabla de zonas (filas tipo',
  '"Umbral 17% 11:35" → {label:"Umbral", seconds:695, pct:17}).',
  '',
  'DÓNDE MIRAR POR APP:',
  '- Garmin: totales en tarjetas arriba; "Carga" como número suelto; gráfico de ritmo/FC',
  '  con picos; tabla de zonas (Calentamiento/Fácil/Aeróbico/Umbral/Máximo) con % y tiempo.',
  '- Strava: cabecera con distancia/tiempo/ritmo; sección "Análisis" con splits por km; FC/potencia.',
  '- Concept2 PM5: pantalla de memoria con tiempo/distancia/ritmo /500m/spm; lista de intervalos por fila.',
  '- Apple Fitness: anillos + tarjetas de tiempo/distancia/FC media/calorías (normalmente sin splits).',
  '- Coros: totales arriba; secciones de ritmo, FC y zonas parecidas a Garmin.',
  '',
  'Responde SOLO con JSON con esta forma EXACTA (dato ausente = null):',
  '{"total_time_s":n,"distance_m":n,"avg_pace_s":n,"best_pace_s":n,',
  '"pace_unit":"per_km"|"per_500m"|"per_mile"|null,"avg_hr":n,"max_hr":n,',
  '"calories":n,"avg_spm":n,"avg_power_w":n,"training_load":n,',
  '"splits":[{"index":n,"item_uid":s,"time_s":n,"distance_m":n,"pace_s":n,',
  '"spm":n,"avg_hr":n,"power_w":n,"calories":n}],',
  '"zones":[{"label":s,"seconds":n,"pct":n}],',
  '"uncertain":[s],"notes":s} (n = number|null, s = string|null)',
].join('\n');

export function buildUserPrompt(ctx: PrescriptionContext, app: CaptureApp | null): string {
  const native = ctx.primary_modality === 'run' ? '/km' : '/500m';
  const items = ctx.items.map((i) => ({
    item_uid: i.uid,
    modality: i.modality,
    measure: i.measure,
    target: i.target,
    reps: i.reps,
    rest_s: i.rest_s,
    prescribed: i.text,
  }));
  return [
    app
      ? `La captura es de: ${APP_LABEL[app]}.`
      : 'La captura es de una app o dispositivo de entreno.',
    '',
    'ÍTEMS PRESCRITOS (tu marco — mapea la captura sobre ellos y devuelve item_uid):',
    items.length ? JSON.stringify(items) : `- (modalidad ${ctx.primary_modality})`,
    '',
    `Modalidad principal a medir: ${ctx.primary_modality} (ritmo nativo ${native}).`,
    ctx.bouts_expected
      ? `Se esperaban ~${ctx.bouts_expected} series/repeticiones. Si la captura muestra una tabla numérica por serie, devuélvelas mapeadas a las repeticiones; si SOLO hay gráfico + totales, deja "splits":[] y marca "per_rep_splits" en "uncertain".`
      : 'Extrae el tiempo total, la distancia, el ritmo medio y los splits solo si hay tabla numérica por serie.',
    '',
    'Extrae SOLO lo que veas y devuélvelo en el JSON indicado. No inventes. No devuelvas RPE.',
  ].join('\n');
}
