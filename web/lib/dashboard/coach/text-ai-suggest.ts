import 'server-only';

import { z } from 'zod';
import {
  prescriptionSchema,
  prescriptionToText,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import {
  ITEM_NOTES_MAX,
  SESSION_NOTES_MAX,
} from '@fahybrid/shared/schema/program-templates';
import {
  describeBlocks,
  sessionTitleBlockSchema,
  type SessionContentBlock,
} from './ai/suggest-session-title';
import { CoachIaLlmError, callCoachIaLlmJson, isCoachIaLlmConfigured } from './ai/llm';

// text-ai-suggest — BORRADORES de texto libre para los campos del editor del
// coach. Devuelve SIEMPRE varias propuestas (no una sola): a diferencia del
// título, una nota es prosa y el coach elige entre 2-3 y la edita, no se le
// inserta un valor y ya.
//
// Dos superficies tienen camino de MODELO porque son las dos notas que el atleta
// lee en el móvil y las únicas que se pueden escribir a partir del contenido real
// que el coach ya ha puesto:
//   · `coach_note` — la nota del ENTRENO (cabecera de la sesión). Contexto: los
//     bloques y ejercicios de la sesión, el MISMO shape que `suggest-session-title`.
//   · `item_note`  — la nota de UNA línea prescrita (el ejercicio del compositor).
//     Contexto: ese ejercicio y SU dosis, no la sesión entera.
// El resto de superficies (nombres, focos) siguen siendo heurísticas: son
// etiquetas cortas, no prosa, y ahí el modelo no aporta.
//
// Sin LLM configurado, o si el modelo falla, se devuelven las propuestas
// estáticas de siempre: frases de entrenador GENÉRICAS pero reales, que el coach
// edita antes de guardar. No es inventar un dato del atleta (eso no se hace
// nunca): es un borrador en blanco con la voz correcta.
//
// Brain rule: NEVER hardcode the model/provider — el LLM lo resuelve `ai/llm.ts`
// enteramente desde el env.

/**
 * Canonical surfaces supported server-side. Public-facing aliases
 * (`block_title`, `day_focus`, `week_name`) are accepted for ergonomics
 * and normalised to canonical values before processing.
 *
 * La lista vive AQUÍ y la unión discriminada de abajo se valida contra ella
 * (`surfaceVariant` la exige), así que una superficie con su contexto sin
 * declarar, o al revés, no compila.
 */
export type TextSuggestSurface =
  | 'workout_name'
  | 'coach_note'
  | 'item_note'
  | 'block_name'
  | 'week_focus'
  | 'template_name';

const SURFACE_ALIASES: Record<string, TextSuggestSurface> = {
  block_title: 'block_name',
  day_focus: 'week_focus',
  week_name: 'template_name',
};

// ── Contexto TIPADO por superficie ───────────────────────────────────────────
// Antes esto era `z.record(z.unknown())` y cada rama iba pescando campos con
// `typeof x === 'string'`. Con el modelo en juego eso no vale: el prompt se
// construye con datos reales o no se construye.

const workoutNameContextSchema = z.object({
  exercises: z.array(z.string().max(200)).max(24).optional(),
  hr_zone: z.number().int().min(1).max(6).optional(),
  duration_min: z.number().int().positive().max(600).optional(),
});

const coachNoteContextSchema = z.object({
  /** El título que el coach ya le puso al entreno, si lo hay. */
  session_title: z.string().max(120).optional(),
  /** El contenido de la sesión — mismo shape que `suggest-session-title`. */
  blocks: z.array(sessionTitleBlockSchema).max(16).default([]),
});

const itemNoteContextSchema = z.object({
  exercise_name: z.string().max(200).optional(),
  /** El bloque donde vive la línea — sitúa el ejercicio dentro del entreno. */
  block_title: z.string().max(120).optional(),
  /**
   * La dosis REAL de esa línea (modelo compartido, una sola fuente). Va con
   * `.catch()` porque esto es una ayuda blanda: una prescripción que el esquema
   * estricto no reconozca deja al modelo sin dosis, pero JAMÁS tumba la petición
   * entera y deja al coach sin botón.
   */
  prescription: prescriptionSchema.optional().catch(undefined),
});

const blockNameContextSchema = z.object({
  format: z.string().max(60).optional(),
  items_count: z.number().int().nonnegative().max(100).optional(),
});

const weekFocusContextSchema = z.object({});

const templateNameContextSchema = z.object({
  level: z.string().max(60).optional(),
});

function surfaceVariant<S extends TextSuggestSurface, C extends z.ZodTypeAny>(
  surface: S,
  context: C,
) {
  return z.object({ surface: z.literal(surface), context: context.default({}) });
}

/**
 * Normaliza el alias ANTES de discriminar: así la unión discriminada trabaja con
 * literales canónicos y cada superficie recibe su contexto tipado de verdad.
 */
export const textSuggestInputSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  const alias = typeof obj.surface === 'string' ? SURFACE_ALIASES[obj.surface] : undefined;
  return alias ? { ...obj, surface: alias } : obj;
}, z.discriminatedUnion('surface', [
  surfaceVariant('workout_name', workoutNameContextSchema),
  surfaceVariant('coach_note', coachNoteContextSchema),
  surfaceVariant('item_note', itemNoteContextSchema),
  surfaceVariant('block_name', blockNameContextSchema),
  surfaceVariant('week_focus', weekFocusContextSchema),
  surfaceVariant('template_name', templateNameContextSchema),
]));

export type TextSuggestInput = z.infer<typeof textSuggestInputSchema>;

export interface TextSuggestResponse {
  suggestions: string[];
  source: 'ai' | 'fallback';
}

export class TextSuggestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TextSuggestError';
  }
}

/** Cuántas propuestas ve el coach. Tres cabe en pantalla y ya da a elegir. */
const MAX_SUGGESTIONS = 3;

/** Tope de caracteres por superficie — el MISMO que acepta el esquema al guardar. */
const SURFACE_MAX_CHARS: Partial<Record<TextSuggestSurface, number>> = {
  coach_note: SESSION_NOTES_MAX,
  item_note: ITEM_NOTES_MAX,
};

// ── Entrada ──────────────────────────────────────────────────────────────────
export async function suggestFreeText(params: {
  coach_id: number | bigint;
  body: unknown;
}): Promise<TextSuggestResponse> {
  const parsed = textSuggestInputSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new TextSuggestError('invalid_request', parsed.error.message, 400);
  }
  const input = parsed.data;

  if (isCoachIaLlmConfigured() && (input.surface === 'coach_note' || input.surface === 'item_note')) {
    try {
      const drafts = await llmSuggestNote({ input, coach_id: params.coach_id });
      const clean = cleanSuggestions(drafts, input.surface);
      if (clean.length > 0) return { suggestions: clean, source: 'ai' };
    } catch {
      // Cae al borrador estático honesto — nunca se queda el coach sin nada.
    }
  }

  return { suggestions: fallbackSuggestions(input), source: 'fallback' };
}

// ── Camino del modelo ────────────────────────────────────────────────────────
const llmSuggestionsSchema = z.object({
  suggestions: z.array(z.string()).min(1).max(8),
});

/**
 * Reglas de voz comunes a las dos notas. Se escriben UNA vez: las dos las lee el
 * mismo atleta en el mismo móvil, así que no pueden sonar a dos personas.
 */
const NOTE_VOICE_RULES = [
  'Tuteas al atleta y hablas como su entrenador, en español de España.',
  'Cada propuesta es UNA sola frase, sin lista ni viñetas.',
  'Nada de jerga técnica ni siglas: se entiende a la primera en el gimnasio.',
  'Sin emojis, sin comillas y SIN guiones largos.',
  'No inventes NUNCA datos del atleta (marcas, pulsaciones, cargas previas, cansancio): no los conoces.',
];

async function llmSuggestNote(args: {
  input: Extract<TextSuggestInput, { surface: 'coach_note' | 'item_note' }>;
  coach_id: number | bigint;
}): Promise<string[]> {
  const { system, user } =
    args.input.surface === 'coach_note'
      ? sessionNotePrompt(args.input.context)
      : itemNotePrompt(args.input.context);

  const raw = await callCoachIaLlmJson({
    system,
    user,
    temperature: 0.6,
    // OJO: `max_tokens` capa razonamiento + contenido juntos (ver ai/llm.ts).
    // Tres frases cortas caben de sobra; el presupuesto es para que el modelo
    // pueda pensar antes sin devolver un JSON cortado por la mitad.
    max_tokens: Number(process.env.LLM_CHAT_MAX_TOKENS_NOTE ?? 2048),
    meta: { surface: `text_suggest_${args.input.surface}`, coach_id: args.coach_id },
  });

  const parsed = llmSuggestionsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CoachIaLlmError(
      'invalid_json',
      `LLM suggestions schema inválido: ${parsed.error.message}`,
    );
  }
  return parsed.data.suggestions;
}

function sessionNotePrompt(context: { session_title?: string; blocks: SessionContentBlock[] }): {
  system: string;
  user: string;
} {
  const system = [
    'Eres el entrenador que escribe la NOTA DEL ENTRENO: lo que el atleta lee en el móvil justo antes de empezar la sesión.',
    'Te paso el contenido de ESA sesión (sus bloques y ejercicios).',
    `Devuelve SOLO un JSON: { "suggestions": ["...", "...", "..."] } con ${MAX_SUGGESTIONS} propuestas DISTINTAS entre sí.`,
    'Cada propuesta habla de ESTE entreno concreto: qué priorizar hoy, dónde no pasarse y con qué sensación salir.',
    'Máximo 160 caracteres por propuesta.',
    ...NOTE_VOICE_RULES,
  ].join('\n');

  const user = [
    context.session_title ? `Título del entreno: ${context.session_title}` : null,
    'Contenido de la sesión:',
    describeBlocks(context.blocks),
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  return { system, user };
}

function itemNotePrompt(context: {
  exercise_name?: string;
  block_title?: string;
  prescription?: Prescription;
}): { system: string; user: string } {
  const system = [
    'Eres el entrenador que escribe la NOTA DE UN EJERCICIO: lo que el atleta lee al abrir ESE ejercicio dentro del entreno, en el móvil.',
    `Devuelve SOLO un JSON: { "suggestions": ["...", "...", "..."] } con ${MAX_SUGGESTIONS} propuestas DISTINTAS entre sí.`,
    'Cada propuesta es un ajuste o una clave de ejecución para ESE ejercicio con ESA dosis: técnica, ritmo, carga, respiración o qué hacer si algo no le sale.',
    'Es el ajuste de HOY, no la descripción del ejercicio ni sus claves de siempre.',
    'Habla de lo que tiene delante: si la dosis lleva series, ritmo o carga, la nota va sobre eso.',
    'Máximo 140 caracteres por propuesta.',
    ...NOTE_VOICE_RULES,
  ].join('\n');

  const dose = context.prescription ? prescriptionToText(context.prescription).trim() : '';
  const user = [
    `Ejercicio: ${context.exercise_name?.trim() || '(sin nombre todavía)'}`,
    dose ? `Dosis prescrita: ${dose}` : 'Dosis prescrita: (todavía sin poner)',
    context.block_title?.trim() ? `Bloque del entreno: ${context.block_title.trim()}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  return { system, user };
}

/**
 * Deja las propuestas listas para pegarlas en el campo: una línea, sin espacios
 * dobles, sin guiones largos (regla dura del copy — delata el texto generado),
 * sin repetidas, sin vacías y NUNCA por encima del tope que aceptará el esquema
 * al guardar. Si al recortar quedara una frase a medias, mejor eso que un
 * guardado rechazado con lo escrito perdido.
 */
export function cleanSuggestions(raw: string[], surface: TextSuggestSurface): string[] {
  const max = SURFACE_MAX_CHARS[surface];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of raw) {
    const line = candidate
      .replace(/\s+/g, ' ')
      .replace(/\s*[—–]\s*/g, ', ')
      .trim();
    if (!line) continue;
    const clamped = max !== undefined && line.length > max ? line.slice(0, max).trim() : line;
    const key = clamped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clamped);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

// ── Borradores honestos sin modelo ───────────────────────────────────────────
// Heurísticas: cero LLM. Frases reales de entrenador que el coach edita, nunca
// un dato inventado del atleta.
export function fallbackSuggestions(input: TextSuggestInput): string[] {
  if (input.surface === 'workout_name') {
    const exercises = input.context.exercises ?? [];
    const zone = input.context.hr_zone !== undefined ? `Z${input.context.hr_zone}` : null;
    const duration =
      input.context.duration_min !== undefined ? `${input.context.duration_min}'` : null;
    const base = exercises[0] ?? 'Sesión';
    const hints = [
      [zone, duration].filter(Boolean).join(' · ') || `${base} principal`,
      `Entreno ${duration ?? ''}`.trim(),
      exercises.length > 1 ? `${exercises[0]} + ${exercises.length - 1} más` : base,
    ];
    return [...new Set(hints.map((s) => s.trim()).filter(Boolean))].slice(0, MAX_SUGGESTIONS);
  }

  if (input.surface === 'coach_note') {
    return cleanSuggestions(
      [
        'Cuida la técnica en las series fuertes. Si vienes cargado, baja un punto la intensidad.',
        'Come e hidrátate bien después y dedica diez minutos a movilidad. Cuéntame cómo te has visto.',
        'Respeta el esfuerzo que te pido. Si no estás fino hoy, no persigas los números.',
      ],
      'coach_note',
    );
  }

  if (input.surface === 'item_note') {
    return cleanSuggestions(
      [
        'Empieza con la carga cómoda y sube solo si las primeras repeticiones te salen limpias.',
        'Prioriza hacerlo bien antes que rápido. Si se te rompe la técnica, para la serie ahí.',
        'Si hoy no llegas a lo prescrito, baja un poco y termina todas las series completas.',
      ],
      'item_note',
    );
  }

  if (input.surface === 'week_focus') {
    return [
      'Densidad media, una sesión clave',
      'Semana de acumulación controlada',
      'Recuperación activa entre estímulos duros',
    ];
  }

  if (input.surface === 'block_name') {
    const format = input.context.format ?? '';
    const itemsCount = input.context.items_count ?? 0;
    const base: string[] = [];
    if (format.includes('warmup') || itemsCount <= 2) base.push('Calentamiento');
    if (format === 'strength_block' || format === 'circuit') base.push('Principal');
    if (format === 'hyrox_sim' || format === 'amrap' || format === 'for_time') base.push('Finisher');
    base.push('Bloque principal', 'Trabajo metabólico', 'Accesorios');
    return [...new Set(base)].slice(0, MAX_SUGGESTIONS);
  }

  const level = input.context.level ?? 'Pro';
  return [`${level} · Semana base`, `${level} · densidad media`, `${level} HYROX`];
}
