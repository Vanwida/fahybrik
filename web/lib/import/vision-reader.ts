// vision-reader — N capturas de un calendario semanal de entreno → `ImportedWeek[]`.
//
// Es el LECTOR de la importación por foto: la tercera fuente del importador, junto
// al Excel (`xlsx-reader`) y al texto pegado. Las tres convergen en el mismo
// intermedio (`./imported-week`) y a partir de ahí el camino es UNO solo: gramática
// determinista → resolución de ejercicios → rejilla de revisión → confirmar.
//
// LA VISIÓN TRANSCRIBE, NO TIPA. El modelo devuelve el texto que ve, partido por
// semana / día / tarjeta; NO devuelve prescripciones. Tipar es trabajo de
// `shared/domain/import/notation.ts`, que ya sabe leer la notación real del coach.
// Si el modelo tipara aquí tendríamos dos caminos de notación → prescripción y
// divergirían. El prompt vive en `shared/domain/import/vision-prompt.ts`.
//
// LO QUE ESTE MÓDULO DECIDE (mecanismo, no adivinanza):
//   · el número de semana sale de la POSICIÓN de la semana en las capturas, no del
//     modelo: leer "SEMANA 12" en un rótulo no lo convierte en la semana 12 del plan
//     que el coach está montando. Ese rótulo, eso sí, se conserva como tarjeta `note`.
//   · el nombre del día lo pone el sistema a partir de `day_of_week` (1 = lunes).
//   · "4 More" implica cortado: `truncated` se deriva, no se cree a ciegas.
//
// LO QUE SE DESCARTA A PROPÓSITO: lo REALIZADO. Una tarjeta de TrainingPeaks mezcla
// el plan ("P: 0:44:10") con lo ejecutado ("0:46:02"); esto importa un PLAN, así que
// el esquema le da al modelo un sitio donde dejar los resultados (`performed`) para
// que no contaminen la prescripción, y el lector los tira. Sin ese campo acabarían
// dentro de `lines` y la gramática los tiparía como si fueran trabajo prescrito.
//
// MODELO: de env (LLM_VISION_MODEL ?? LLM_MODEL), jamás cableado (regla del Brain).

import 'server-only';

import { z } from 'zod';
import {
  callLlmJsonWithImage,
  CoachIaLlmError,
  type LlmImageInput,
} from '@/lib/dashboard/coach/ai/llm';
import type { Modality } from '@fahybrid/shared/domain/prescription/types';
import { modalitySchema } from '@fahybrid/shared/domain/prescription/types';
import {
  buildVisionWeekUserPrompt,
  VISION_CARD_KINDS,
  VISION_WEEK_SYSTEM_PROMPT,
} from '@fahybrid/shared/domain/import/vision-prompt';
import { DAY_LABELS_FULL, WEEKDAY_COUNT } from '@/lib/dashboard/constants/calendar';
import { cardToSessionText, workoutCards } from './imported-week';
import type { ImportedCard, ImportedDay, ImportedWeek } from './imported-week';

export type { LlmImageInput };
export { CoachIaLlmError as ImportVisionError };

// ── Config (env-gated, nunca cableado) ───────────────────────────────────────
export function getImportVisionModel(): string | null {
  const m = (process.env.LLM_VISION_MODEL ?? process.env.LLM_MODEL)?.trim();
  return m ? m : null;
}
export function isImportVisionConfigured(): boolean {
  return getImportVisionModel() != null;
}

/** De dónde se leyó la semana, para `ImportedWeek.sheet` (el Excel pone su hoja). */
const PHOTO_SHEET = 'foto';

/** Sin indicación del coach, la primera semana leída es la 1. */
const DEFAULT_START_WEEK = 1;

/** Transcribir no es redactar: cero temperatura. */
const TRANSCRIPTION_TEMPERATURE = 0;

/**
 * Presupuesto de salida. Una semana de ~18 tarjetas transcritas VERBATIM son unos
 * 3k tokens de JSON, y el modelo configurado puede RAZONAR dentro del MISMO
 * presupuesto (ver `DEFAULT_MAX_TOKENS` en llm.ts): un tope corto no devuelve un
 * JSON más corto, devuelve un JSON CORTADO que revienta el parseo. La base cubre el
 * razonamiento más una semana; cada captura añade sitio para otra.
 */
const MAX_TOKENS_BASE = 6_000;
const MAX_TOKENS_PER_IMAGE = 3_000;
const MAX_TOKENS_CEILING = 24_000;

function maxTokensFor(imageCount: number): number {
  const n = Math.max(1, imageCount);
  return Math.min(MAX_TOKENS_CEILING, MAX_TOKENS_BASE + MAX_TOKENS_PER_IMAGE * n);
}

// ── Topes del esquema ────────────────────────────────────────────────────────
// Acotan lo que aceptamos de un modelo. Son holgados para que jamás corten una
// transcripción legítima: pasarse significa que el modelo dejó de transcribir y se
// puso a redactar, y entonces fallar es la respuesta correcta.
const MAX_TITLE_CHARS = 240;
const MAX_LINE_CHARS = 400;
const MAX_LINES_PER_CARD = 60;
const MAX_CARDS_PER_DAY = 12;
/** 7 días, con margen para que dos capturas repitan un día antes de fusionarlo. */
const MAX_DAY_ENTRIES = 14;
const MAX_WEEKS = 8;
const MAX_UNCERTAIN = 60;
const MAX_UNCERTAIN_CHARS = 200;
const MAX_NOTES_CHARS = 1_000;
const MAX_HIDDEN_COUNT = 99;

// ── Lo que pedimos al modelo — estricto en la estructura, tolerante en las pistas ─
// La ESTRUCTURA (weeks/days/cards/lines/kind) es obligatoria: si no viene, la
// respuesta no es una lectura y falla limpio, sin reparar el JSON a mano. Las
// PISTAS (modalidad del icono, cortado, cuántas oculta) nunca pueden tumbar una
// lectura buena: caen a su valor honesto por defecto.
const MODALITY_HINTS = new Set<string>(modalitySchema.options);

const modalityHintSchema = z
  .string()
  .transform((v): Modality | null => {
    const key = v.trim().toLowerCase();
    return MODALITY_HINTS.has(key) ? (key as Modality) : null;
  })
  .nullable()
  .catch(null);

const cardSchema = z.object({
  title: z.string().max(MAX_TITLE_CHARS).nullable().default(null),
  // Sin `default`: una tarjeta sin clase es un modelo que ignoró el contrato, y
  // adivinar la clase es justo el fallo que hunde el importador (la analítica del
  // sueño acabaría tipada como trabajo).
  kind: z.enum(VISION_CARD_KINDS),
  lines: z.array(z.string().max(MAX_LINE_CHARS)).max(MAX_LINES_PER_CARD).default([]),
  /** Lo EJECUTADO. Existe para que no se cuele en `lines`; el lector lo descarta. */
  performed: z.array(z.string().max(MAX_LINE_CHARS)).max(MAX_LINES_PER_CARD).default([]),
  modality_hint: modalityHintSchema,
  truncated: z.boolean().catch(false),
  hidden_count: z.coerce.number().int().min(0).max(MAX_HIDDEN_COUNT).nullable().catch(null),
});

const daySchema = z.object({
  day_of_week: z.coerce.number().int().min(1).max(WEEKDAY_COUNT),
  cards: z.array(cardSchema).max(MAX_CARDS_PER_DAY).default([]),
});

const weekSchema = z.object({
  days: z.array(daySchema).max(MAX_DAY_ENTRIES).default([]),
});

const visionWeekRawSchema = z.object({
  weeks: z.array(weekSchema).max(MAX_WEEKS),
  uncertain: z.array(z.string().max(MAX_UNCERTAIN_CHARS)).max(MAX_UNCERTAIN).default([]),
  notes: z.string().max(MAX_NOTES_CHARS).nullable().default(null),
});

type VisionWeekRaw = z.infer<typeof visionWeekRawSchema>;
type RawCard = z.infer<typeof cardSchema>;

// ── Crudo → contrato ─────────────────────────────────────────────────────────

/** Una tarjeta transcrita. `null` cuando no quedó nada legible en ella. */
function toCard(raw: RawCard): ImportedCard | null {
  const title = raw.title?.trim() || null;
  const lines = raw.lines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (title === null && lines.length === 0) return null;

  // Un "0 More" no oculta nada: solo cuenta como oculto lo que de verdad lo está.
  const hidden = raw.hidden_count != null && raw.hidden_count > 0 ? raw.hidden_count : null;
  return {
    title,
    kind: raw.kind,
    lines,
    modality_hint: raw.modality_hint,
    // Un contador de ocultas ES un corte, lo marque el modelo o no.
    truncated: raw.truncated || hidden !== null,
    hidden_count: hidden,
  };
}

/**
 * El texto de sesión del día: las tarjetas de ENTRENO, en orden, separadas por una
 * línea en blanco. Es la degradación honesta del día para cualquier consumidor que
 * aún no lea `cards` — quien las lea debe preferirlas SIEMPRE, porque cada tarjeta
 * es un bloque propio y esta cadena las aplana en uno.
 */
function sessionTextFrom(day: ImportedDay): string | null {
  const text = workoutCards(day)
    .map(cardToSessionText)
    .filter((t) => t.trim().length > 0)
    .join('\n\n');
  return text.length > 0 ? text : null;
}

function toImportedWeeks(raw: VisionWeekRaw, startWeek: number): ImportedWeek[] {
  const weeks: ImportedWeek[] = [];

  for (const rawWeek of raw.weeks) {
    // Dos capturas de la misma semana pueden traer el mismo día dos veces: se
    // fusionan por día conservando el orden de llegada, nunca se pierde una.
    const byDay = new Map<number, ImportedCard[]>();
    for (const rawDay of rawWeek.days) {
      const cards = rawDay.cards
        .map(toCard)
        .filter((c): c is ImportedCard => c !== null);
      const acc = byDay.get(rawDay.day_of_week);
      if (acc) acc.push(...cards);
      else byDay.set(rawDay.day_of_week, cards);
    }

    // Una semana sin una sola tarjeta no es una semana en blanco: es una lectura que
    // no vio nada. No ocupa número de semana.
    const total = [...byDay.values()].reduce((n, cards) => n + cards.length, 0);
    if (total === 0) continue;

    const days: ImportedDay[] = [];
    for (let dow = 1; dow <= WEEKDAY_COUNT; dow += 1) {
      const day: ImportedDay = {
        day_of_week: dow,
        dow: DAY_LABELS_FULL[dow - 1]!,
        // Un calendario no tiene línea de estímulo (eso es la Capa 1 del Excel): el
        // foco del día vive en el título de cada tarjeta.
        stimulus: null,
        session_text: null,
        // Vacío ≠ ausente: aquí SÍ miramos el día, y no había nada.
        cards: byDay.get(dow) ?? [],
      };
      day.session_text = sessionTextFrom(day);
      days.push(day);
    }

    weeks.push({
      week: startWeek + weeks.length,
      sheet: PHOTO_SHEET,
      fell_back: false,
      days,
    });
  }

  return weeks;
}

// ── Orquestador ──────────────────────────────────────────────────────────────

export interface WeekVisionArgs {
  /** Las capturas, EN ORDEN visual. Viajan en un solo turno: son una lectura. */
  images: LlmImageInput[];
  /** Número de la primera semana leída; las siguientes van correlativas. */
  start_week?: number;
  coach_id?: number | bigint | null;
  fetchImpl?: typeof fetch;
}

export interface WeekVisionReading {
  weeks: ImportedWeek[];
  /** Lo que el modelo declaró no haber leído con seguridad. Se enseña, no se tapa. */
  uncertain: string[];
  notes: string | null;
  model: string;
}

/** La lectura completa, con las señales de honestidad del modelo. */
export async function readWeekVision(args: WeekVisionArgs): Promise<WeekVisionReading> {
  const model = getImportVisionModel();
  if (!model) {
    throw new CoachIaLlmError('unconfigured', 'LLM_VISION_MODEL / LLM_MODEL no configurado');
  }

  const rawUnknown = await callLlmJsonWithImage({
    model,
    system: VISION_WEEK_SYSTEM_PROMPT,
    user: buildVisionWeekUserPrompt({ image_count: args.images.length }),
    images: args.images,
    temperature: TRANSCRIPTION_TEMPERATURE,
    max_tokens: maxTokensFor(args.images.length),
    meta: { surface: 'plan_import_vision', coach_id: args.coach_id ?? null },
    fetchImpl: args.fetchImpl,
  });

  const parsed = visionWeekRawSchema.safeParse(rawUnknown);
  // Se falla limpio: un JSON con otra forma NO se repara a mano ni se rescata a
  // trozos. Media lectura silenciosa es peor que ninguna.
  if (!parsed.success) {
    throw new CoachIaLlmError('invalid_json', 'La IA devolvió una lectura con forma inesperada');
  }

  return {
    weeks: toImportedWeeks(parsed.data, args.start_week ?? DEFAULT_START_WEEK),
    uncertain: parsed.data.uncertain,
    notes: parsed.data.notes,
    model,
  };
}

/** Las semanas leídas, listas para el resto del importador. */
export async function readWeekFromImages(args: WeekVisionArgs): Promise<ImportedWeek[]> {
  const reading = await readWeekVision(args);
  return reading.weeks;
}
