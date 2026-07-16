import 'server-only';

// COMPOSE-WEEK — the week generator's authoring engine.
//
// `suggest-week` used to be a SELECTOR: it could only re-deal templates the coach
// already had. For a coach whose library is empty (every new coach, and Pablo's
// real account) that is not a degraded mode, it is a broken one — it dealt out his
// four CALIBRATION TESTS as if they were training. A test is a measurement, never
// a session.
//
// So this module COMPOSES. It writes the week from the exercise catalog, with a
// full prescription on every item, and treats the coach's library as the preferred
// source when he has one (it is his method — it wins over anything we author).
//
// Shape of the call, and why:
//   Phase 1 — ONE small call plans the skeleton (per day: theme, modalities,
//             intensity, and whether one of the coach's templates fits).
//   Phase 2 — ONE call PER SESSION, all in parallel, each composing that session's
//             warm-up → main → cool-down.
// A single 7-day call is what produced the garbage: it hit the 2048-token ceiling
// exactly and came back truncated. Per-day calls each get room to state a real
// dose, and the fan-out keeps the wall clock inside the route's 180s budget.
//
// Nothing here chooses a model: `callCoachIaLlmJson` resolves it from env.

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import {
  prescriptionSchema,
  prescriptionGrammarLines,
  checkPrescriptionCompleteness,
  modalitySchema,
  type Modality,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import { templateFormat, type TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import {
  structureGroupSchema,
  type StructureGroup,
  type WeekDayPart,
  type WeekDayPartItem,
} from '@fahybrid/shared/schema/program-templates';
import { newBlockUid } from '@/lib/dashboard/programming/studio-types';
import { callCoachIaLlmJson, CoachIaLlmError } from './llm';

// Budgets sized against a MEASURED fact, not a guess: the configured chat model
// is a reasoning model, and `max_tokens` caps reasoning + content TOGETHER. A
// trivial 7-day skeleton spent 1110 of 1501 completion tokens thinking before it
// wrote a character, hit finish_reason:'length', and the JSON came back cut in
// half — which is exactly how the old 2048-capped single call produced
// completion_tokens=2048 on the nose and a truncated week.
//
// So each call needs room for the model to think AND still finish. Per-session
// fan-out is what makes that affordable: N generous calls in parallel cost less
// wall clock than one call big enough to hold a whole week.
const MAX_TOKENS_SKELETON = Number(process.env.LLM_CHAT_MAX_TOKENS_WEEK_PLAN ?? 4000);
const MAX_TOKENS_SESSION = Number(process.env.LLM_CHAT_MAX_TOKENS_SESSION ?? 10000);

/** Catalog rows sent to the model. Above this the prompt is filtered by modality. */
const CATALOG_PROMPT_LIMIT = 400;

/**
 * Wall-clock budget for the whole compose, under the routes' `maxDuration = 180`.
 *
 * Sessions run in parallel, so the critical path is the SLOWEST one — and a retry
 * doubles it (measured: 171s end-to-end when one session retried, against a 180s
 * ceiling). Past this mark we stop retrying and ship what we have: a week with one
 * item flagged for review beats a timeout that hands the coach nothing.
 */
const COMPOSE_BUDGET_MS = Number(process.env.LLM_COMPOSE_BUDGET_MS ?? 130_000);

export function composeDeadline(now: number = Date.now()): number {
  return now + COMPOSE_BUDGET_MS;
}

export interface CatalogExercise {
  id: number;
  name: string;
  modality: Modality;
  category: string;
}

export interface ComposedSession {
  slot: 'am' | 'pm';
  theme: string;
  blocks: WeekDayPart[];
}

export interface ComposedDay {
  day_of_week: number;
  kind: 'rest' | 'workout';
  focus?: string | undefined;
  sessions: ComposedSession[];
  /** Library templates this day drew from, if any (coach's own method). */
  library_template_ids: string[];
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * The exercise catalog the model is allowed to draw from. `modality` is intrinsic
 * to the exercise row (mig 0053) — it is the TRUTH we validate prescriptions
 * against, never whatever `prescription.modality` the model felt like writing.
 */
export async function loadExerciseCatalog(client: Sql): Promise<CatalogExercise[]> {
  const rows = await client<Array<{ id: string; name: string; modality: string; category: string }>>`
    select id::text as id, name, modality, category::text as category
    from exercises
    order by modality, name
  `;
  return rows.flatMap((r) => {
    const modality = modalitySchema.safeParse(r.modality);
    if (!modality.success) return [];
    return [{ id: Number(r.id), name: r.name, modality: modality.data, category: r.category }];
  });
}

/**
 * Render the catalog for the prompt, grouped by modality. The model picks an
 * `exercise_id` FROM THIS LIST — that is what makes invention impossible: an id we
 * did not send cannot resolve, and an unresolvable item is dropped.
 */
export function formatCatalogForPrompt(
  catalog: CatalogExercise[],
  relevant?: Modality[] | null,
): string {
  // Only narrow when the catalog is big enough to threaten the prompt budget;
  // narrowing a small catalog just risks hiding the exercise the session needs.
  const pool =
    catalog.length > CATALOG_PROMPT_LIMIT && relevant && relevant.length > 0
      ? catalog.filter((e) => relevant.includes(e.modality))
      : catalog;

  const byModality = new Map<Modality, CatalogExercise[]>();
  for (const e of pool) {
    const list = byModality.get(e.modality) ?? [];
    list.push(e);
    byModality.set(e.modality, list);
  }
  const lines: string[] = [];
  for (const [modality, list] of byModality) {
    lines.push(`${modality}:`);
    for (const e of list) lines.push(`  ${e.id} = ${e.name}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Phase 1 — week skeleton
// ---------------------------------------------------------------------------

const skeletonSessionSchema = z.object({
  slot: z.enum(['am', 'pm']).default('am'),
  theme: z.string().min(2).max(200),
  // A HINT, not truth — it only steers the compose prompt and narrows a large
  // catalog. Modality truth is the exercise's own (mig 0053), stamped from the
  // catalog later. Observed: the model answers "sprint intervals" / "sled push"
  // here, not the enum. Rejecting a sound week plan over a free-text hint would
  // be the schema serving itself, so unknown values are dropped, not fatal.
  modalities: z
    .array(z.string().max(60))
    .max(8)
    .default([])
    .transform((raw) =>
      raw.flatMap((m) => {
        const parsed = modalitySchema.safeParse(m.trim().toLowerCase());
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  intensity: z.enum(['easy', 'moderate', 'hard']).catch('moderate').default('moderate'),
  library_template_name: z.string().max(200).nullish(),
});

const skeletonDaySchema = z.object({
  day_of_week: z.number().int().min(1).max(7),
  kind: z.enum(['rest', 'workout']),
  // `.nullish()`, not `.optional()`: models write `"focus": null` for a rest day
  // rather than omitting the key, and `.optional()` rejects an explicit null. That
  // one null on Sunday was enough to throw away the whole week and fall back.
  focus: z.string().max(200).nullish(),
  sessions: z.array(skeletonSessionSchema).max(2).default([]),
});

const skeletonSchema = z.object({ days: z.array(skeletonDaySchema).min(1).max(7) });

export type WeekSkeleton = z.infer<typeof skeletonSchema>;

export interface LibraryTemplate {
  id: string;
  name: string;
  format: string;
  target_block: string;
  target_level: number | null;
}

function buildSkeletonSystem(hasLibrary: boolean, boxBlock: string | null): string {
  const lines = [
    'Eres un coach de HYROX y entrenamiento híbrido de élite. Planificas la ESTRUCTURA de una semana.',
    'No escribes los ejercicios todavía: solo decides qué hace cada día.',
    'JSON EXACTO: { "days": [ { "day_of_week", "kind": "rest"|"workout", "focus"?, "sessions": [ { "slot": "am"|"pm", "theme", "modalities": [], "intensity": "easy"|"moderate"|"hard", "library_template_name"? } ] } ] }',
    '',
    'Reglas:',
    '- Siempre los 7 días (1=lunes … 7=domingo). Los días sin entreno van kind:"rest" con sessions vacío.',
    '- Un día normal lleva UNA sesión (slot "am"). Solo pon DOS sesiones (am + pm) si el coach pide doble sesión.',
    '- `modalities` usa el vocabulario: ' + modalitySchema.options.join(' | '),
    '- Alterna carga: una sesión dura va seguida de una fácil o de descanso. No apiles dos días duros de la misma modalidad.',
    '- Respeta el foco del coach: si pide HYROX, la semana lleva trabajo de estaciones, compromised running y fuerza específica.',
  ];
  if (hasLibrary) {
    lines.push(
      '- El coach tiene BIBLIOTECA propia. Si una plantilla suya encaja con el día, ponla en `library_template_name` copiando el nombre EXACTO. Su método manda sobre cualquier cosa que escribamos nosotros.',
      '- Si ninguna encaja, deja `library_template_name` a null y la sesión se compondrá desde el catálogo.',
    );
  }
  if (boxBlock) {
    lines.push(
      '',
      '- El atleta va a clases presenciales en su box. Complementa, no dupliques: si el box hace fuerza ese día, el plan va Z2/técnica; si hace HYROX/metabólico, el plan va aeróbico suave o descanso.',
      boxBlock,
    );
  }
  return lines.join('\n');
}

export async function planWeekSkeleton(args: {
  focus: string;
  level: string;
  training_days: number[];
  library: LibraryTemplate[];
  box_block: string | null;
  coach_id: number | bigint;
  athlete_id?: number | bigint | null;
}): Promise<WeekSkeleton> {
  const hasLibrary = args.library.length > 0;
  const userLines = [
    `Foco de la semana (literal del coach): ${args.focus}`,
    `Nivel del atleta: ${args.level}`,
    `Días de entreno preferidos: ${args.training_days.join(', ')} (1=lunes … 7=domingo)`,
  ];
  if (hasLibrary) {
    userLines.push(
      '',
      'Biblioteca del coach (nombres EXACTOS; son SUS entrenos, priorízalos cuando encajen):',
      ...args.library.map(
        (t) => `- "${t.name}" (formato=${t.format}, bloque=${t.target_block}, nivel=${t.target_level ?? '?'})`,
      ),
    );
  } else {
    userLines.push('', 'El coach NO tiene biblioteca todavía: todas las sesiones se compondrán desde el catálogo.');
  }

  const raw = await callCoachIaLlmJson({
    system: buildSkeletonSystem(hasLibrary, args.box_block),
    user: userLines.join('\n'),
    temperature: 0.3,
    max_tokens: MAX_TOKENS_SKELETON,
    meta: {
      surface: 'compose_week_plan',
      coach_id: args.coach_id,
      athlete_id: args.athlete_id ?? null,
    },
  });

  const parsed = skeletonSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CoachIaLlmError('invalid_json', `Skeleton inválido: ${parsed.error.message}`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Phase 2 — compose ONE session
// ---------------------------------------------------------------------------

// The envelope is parsed LOOSELY and each prescription is gated on its own below.
// `prescriptionSchema` is `.strict()`, so one stray key anywhere — the model likes
// writing `notes` inside a set, where the field is `note` — used to reject the
// WHOLE session and delete the day. One bad item may cost its own item and
// nothing more; that is the same "drop the line, keep the rest" rule the importer's
// `llm-assist` already follows.
const composedItemLooseSchema = z.object({
  exercise_id: z.number().int().positive(),
  prescription: z.unknown(),
  notes: z.string().max(500).nullish(),
});

const composedBlockSchema = z.object({
  title: z.string().min(1).max(120),
  role: structureGroupSchema.catch('principal'),
  // Normalised below against `templateFormat`; a format we don't know is not worth
  // losing a composed block over.
  format: z.string().max(40).nullish(),
  items: z.array(composedItemLooseSchema).min(1).max(24),
});

const composedSessionSchema = z.object({
  blocks: z.array(composedBlockSchema).min(1).max(8),
});

/** Fallback block format per role, when the model's own is missing/unknown. */
const ROLE_FALLBACK_FORMAT: Record<StructureGroup, TemplateFormat> = {
  calentamiento: 'warmup',
  principal: 'sets',
  vuelta: 'cooldown',
};

function normalizeFormatForRole(
  raw: string | null | undefined,
  role: StructureGroup,
): TemplateFormat {
  const parsed = templateFormat.safeParse(raw);
  return parsed.success ? parsed.data : ROLE_FALLBACK_FORMAT[role];
}

/**
 * Map the per-set `notes` the model reliably writes onto the canonical `note`.
 *
 * This invents nothing — it is the same alias-to-canonical lift `normalizeSet`
 * already does for `reps`/`rpe`/`hr_zone`, applied to a plural the model cannot
 * seem to resist. Without it a `.strict()` parse throws away a perfectly good
 * prescription over an `s`.
 */
function liftSetNoteAlias(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.sets)) return raw;
  return {
    ...p,
    sets: p.sets.map((s) => {
      if (typeof s !== 'object' || s === null) return s;
      const set = s as Record<string, unknown>;
      if (!('notes' in set)) return set;
      const { notes, ...rest } = set;
      return rest.note != null ? rest : { ...rest, note: notes };
    }),
  };
}

/**
 * The AUTHORING contract. Deliberately the mirror image of the importer's
 * (`llm-assist`, which must never invent a number because it is transcribing the
 * coach's text): here the model IS the author, so an omitted dose is the failure.
 */
function buildSessionSystem(): string {
  return [
    'Eres un coach de HYROX y entrenamiento híbrido de élite. ESCRIBES una sesión de entrenamiento completa.',
    'JSON EXACTO: { "blocks": [ { "title", "role": "calentamiento"|"principal"|"vuelta", "format", "items": [ { "exercise_id", "prescription", "notes"? } ] } ] }',
    '',
    'ESTRUCTURA OBLIGATORIA — toda sesión lleva, en este orden:',
    '  1. UN bloque role:"calentamiento" (format "warmup").',
    '  2. UNO o DOS bloques role:"principal" (el trabajo del día; el segundo, si existe, es accesorio).',
    '  3. UN bloque role:"vuelta" (format "cooldown").',
    '',
    'PRESCRIPCIÓN COMPLETA — un nombre de ejercicio NO es un entreno. Mínimos por modalidad:',
    '- Correr: cada serie con medida (distance en metros | duration en segundos) Y objetivo (pace per_km | hr_zone | rpe). Si hay varias series, rest_s entre ellas.',
    '- Remo/Ski/Bike: cada serie con medida (distance | duration | calories) Y objetivo (pace per_500m | watts | rpe | hr_zone). Si hay varias series, rest_s.',
    '- Fuerza: sets[] con UNA ENTRADA POR SERIE, cada una con measure { kind:"reps", value }, target de carga (percent_rm | kg | rir | rpe), rest_s y tempo cuando aplique.',
    '- WOD/metcon (amrap, emom, for_time, rounds, chipper): el formato manda. amrap/emom/tabata SIEMPRE con total_s o rounds. Cada movimiento con su measure.',
    '- Core/movilidad: measure de reps o duration.',
    '',
    'REGLAS DURAS:',
    '- `exercise_id` SIEMPRE del catálogo que te doy. JAMÁS inventes un id ni un ejercicio que no esté en la lista.',
    '- Un ejercicio de correr lleva prescripción de correr: la distancia y el ritmo van EN LA PRESCRIPCIÓN, no en el nombre.',
    '- NUNCA dejes una serie sin carga/ritmo/zona en el bloque principal. Si dudas, prescribe por RPE.',
    '- El texto libre va SOLO en "note"/"notes". Todo lo demás es estructura tipada.',
    '- Escribe en español natural de gimnasio (títulos como "Calentamiento", "Series de 1000", "Vuelta a la calma").',
    '',
    ...prescriptionGrammarLines(),
  ].join('\n');
}

interface ComposeSessionArgs {
  focus: string;
  level: string;
  day_label: string;
  theme: string;
  modalities: Modality[];
  intensity: string;
  catalog: CatalogExercise[];
  coach_id: number | bigint;
  athlete_id?: number | bigint | null;
  /** Reasons the previous attempt was incomplete — appended on the retry. */
  retry_reasons?: string[];
  /** Epoch ms after which no retry may start (see COMPOSE_BUDGET_MS). */
  deadline_ms?: number;
}

function buildSessionUser(args: ComposeSessionArgs): string {
  const lines = [
    `Foco de la semana (literal del coach): ${args.focus}`,
    `Nivel del atleta: ${args.level}`,
    `Día: ${args.day_label}`,
    `Tema de la sesión: ${args.theme}`,
    `Modalidades: ${args.modalities.length > 0 ? args.modalities.join(', ') : 'libre'}`,
    `Intensidad: ${args.intensity}`,
    '',
    'Catálogo de ejercicios — usa SOLO estos ids:',
    formatCatalogForPrompt(args.catalog, args.modalities),
  ];
  if (args.retry_reasons && args.retry_reasons.length > 0) {
    lines.push(
      '',
      'El intento anterior fue RECHAZADO por prescripción incompleta. Corrige exactamente esto:',
      ...args.retry_reasons.map((r) => `- ${r}`),
    );
  }
  return lines.join('\n');
}

export interface SessionComposeResult {
  blocks: WeekDayPart[];
  /** Items dropped because the model invented an id we never sent. */
  invented_ids: number[];
  /** Completeness reasons still outstanding after the retry. */
  incomplete_reasons: string[];
}

/**
 * Compose ONE session. Validates in three gates, in order:
 *   1. Zod (`prescriptionSchema`) — well-formed, or the item is dropped.
 *   2. `exercise_id` ∈ catalog — resolvable, or the item is dropped.
 *   3. `checkPrescriptionCompleteness` against the CATALOG's modality — a real
 *      dose, or one bounded retry, and whatever still fails stays flagged for
 *      review rather than posing as a finished workout.
 */
export async function composeSession(args: ComposeSessionArgs): Promise<SessionComposeResult> {
  const byId = new Map(args.catalog.map((e) => [e.id, e]));
  const system = buildSessionSystem();

  const attempt = async (retryReasons?: string[]): Promise<SessionComposeResult> => {
    const raw = await callCoachIaLlmJson({
      system,
      user: buildSessionUser({ ...args, ...(retryReasons ? { retry_reasons: retryReasons } : {}) }),
      temperature: 0.4,
      max_tokens: MAX_TOKENS_SESSION,
      meta: {
        surface: 'compose_session',
        coach_id: args.coach_id,
        athlete_id: args.athlete_id ?? null,
      },
    });
    const parsed = composedSessionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new CoachIaLlmError('invalid_json', `Sesión inválida: ${parsed.error.message}`);
    }

    const invented: number[] = [];
    const incomplete: string[] = [];
    const blocks: WeekDayPart[] = [];

    for (const b of parsed.data.blocks) {
      const items: WeekDayPartItem[] = [];
      for (const it of b.items) {
        const ex = byId.get(it.exercise_id);
        if (!ex) {
          // An id we never sent. It cannot resolve, so it cannot be saved — the
          // model does not get to invent an exercise.
          invented.push(it.exercise_id);
          continue;
        }
        // Gate #1 — well-formed. Malformed drops the ITEM, not the session.
        const shape = prescriptionSchema.safeParse(liftSetNoteAlias(it.prescription));
        if (!shape.success) {
          incomplete.push(`${ex.name} (${b.title}): prescripción mal formada.`);
          continue;
        }
        // Modality is the exercise's property, not the model's opinion: stamp it
        // from the catalog so every downstream gate reads the same truth.
        const prescription: Prescription = { ...shape.data, modality: ex.modality };
        // Gate #2 — a real dose. Failure is recorded (and drives the retry), but
        // the item is KEPT: the review gate downstream flags it honestly, which
        // is more useful to the coach than a silently missing exercise.
        const check = checkPrescriptionCompleteness(prescription, {
          modality: ex.modality,
          role: b.role,
        });
        if (!check.ok) {
          incomplete.push(`${ex.name} (${b.title}): ${check.reasons.join(' ')}`);
        }
        items.push({
          uid: newBlockUid(),
          exercise_id: ex.id,
          exercise_name: ex.name,
          prescription_json: prescription,
          ...(it.notes ? { notes: it.notes } : {}),
        });
      }
      if (items.length === 0) continue;
      blocks.push({
        uid: newBlockUid(),
        title: b.title,
        format: normalizeFormatForRole(b.format, b.role),
        group: b.role,
        items,
      });
    }
    return { blocks, invented_ids: invented, incomplete_reasons: incomplete };
  };

  const first = await attempt();
  if (first.incomplete_reasons.length === 0 && first.blocks.length > 0) return first;

  // Out of budget → ship the first attempt. Its gaps are flagged for review by the
  // same completeness gate downstream, so nothing incomplete poses as finished;
  // spending the remaining seconds on a retry that might not land would cost the
  // coach the entire week to a timeout.
  if (args.deadline_ms != null && Date.now() > args.deadline_ms) return first;

  // ONE bounded retry, told exactly what was missing. If it still comes back
  // incomplete we keep the better of the two.
  try {
    const second = await attempt(first.incomplete_reasons.slice(0, 8));
    if (second.blocks.length === 0) return first;
    return second.incomplete_reasons.length <= first.incomplete_reasons.length ? second : first;
  } catch {
    return first;
  }
}
