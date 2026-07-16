import 'server-only';

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { joinCoachOverride } from '@/lib/exercises/coach-override';
import {
  weekDaySchema,
  blockUseModifiersSchema,
  type WeekDay,
  type BlockUseModifiers,
} from '@fahybrid/shared/schema/program-templates';
import type { Block } from '@fahybrid/shared/schema/blocks';
import {
  checkPrescriptionCompleteness,
  isExecutable,
  safeParsePrescription,
} from '@fahybrid/shared/domain/prescription';
import { isCoachIaLlmConfigured, callCoachIaLlmJson, CoachIaLlmError } from './llm';
import {
  createPartFromLibraryBlock,
  type LibraryBlockExercise,
} from '@/lib/dashboard/programming/block-to-part';

/**
 * Coach IA — composición de SEMANA a partir de la BIBLIOTECA DE BLOQUES (0037).
 *
 * Principio de producto (Documento Maestro): la IA NO genera entrenos de cero —
 * SELECCIONA y ADAPTA bloques existentes de Pablo. Esta es la diferencia con
 * `suggest-week.ts`, que reparte TEMPLATES del catálogo (sesiones completas con
 * `template_segments` hidratables a ejercicios).
 *
 * Un bloque se materializa como un `WeekDayPart` con:
 *   - `title`       = block.title
 *   - `items[]`     = sus `block_exercises`, con `exercise_id` + prescripción tipada
 *   - `coach_note`  = block.description verbatim (+ modificadores sugeridos)
 *   - `format`      = mapeo coarse → templateFormat (para que el Studio renderice)
 *
 * OJO — este módulo decía "los bloques NO tienen estructura de ejercicios" y
 * emitía `items: []`. Era falso: los 99 bloques del método de Pablo tienen
 * 121/121 ejercicios con `exercise_id` y `prescription_json`. Verificado contra
 * la DB, no contra el comentario.
 *
 * El shape de salida es compatible con el modal "Generar semana" del dashboard:
 * `days: WeekDay[]` consumible por `onAcceptWeek`. Además expone `matched_blocks`
 * con los `block_id` reales referenciados (trazabilidad — nunca inventamos).
 *
 * La materialización bloque → `WeekDayPart` (format mapping, items, coach_note,
 * source_block_id, modificadores) la hace `createPartFromLibraryBlock`. NO
 * duplicamos esa lógica aquí.
 */

// ---------------------------------------------------------------------------
// Methodology-group taxonomy (the 10 fixed groups, migration 0030)
// ---------------------------------------------------------------------------

/**
 * Clasificación gruesa de cada grupo (1..10) para balancear la semana: evitar
 * apilar fuerza-fuerza-fuerza y alternar carga/recuperación. Es la misma
 * taxonomía del Documento Maestro §10.
 */
type GroupKind = 'strength' | 'cardio' | 'metcon' | 'recovery';

const GROUP_KIND: Record<number, GroupKind> = {
  1: 'strength', // Fuerza Base
  2: 'strength', // Fuerza Explosiva / Pliométrica
  3: 'cardio', // Series de Ergómetros
  4: 'cardio', // Series de Running
  5: 'recovery', // Zona 2 / Recuperación
  6: 'metcon', // WODs / Metcons
  7: 'metcon', // Simulaciones de Carrera (HYROX / DEKA)
  8: 'recovery', // Core, Movilidad y Preventivos
  9: 'metcon', // Circuitos Funcionales
  10: 'recovery', // Tapering / Activación
};

// ---------------------------------------------------------------------------
// Request / response
// ---------------------------------------------------------------------------

const programLevel = z.enum(['beginner', 'intermediate', 'pro', 'elite']);

export const suggestWeekFromBlocksRequestSchema = z
  .object({
    name: z.string().min(2).max(200).optional(),
    focus: z.string().min(2).max(400),
    level: programLevel.optional(),
    /** rápido = heurístico determinista. slow = LLM compone (si configurado). */
    mode: z.enum(['fast', 'slow']).default('fast'),
    days_per_week: z.number().int().min(3).max(7).default(7),
  })
  .strict();

export type SuggestWeekFromBlocksRequest = z.infer<typeof suggestWeekFromBlocksRequestSchema>;

export interface MatchedBlock {
  day_of_week: number;
  block_id: number;
  block_title: string;
  methodology_group_id: number;
  modifiers: BlockUseModifiers | null;
}

export interface SuggestedWeekDay extends WeekDay {
  preview_label?: string;
}

export interface SuggestWeekFromBlocksResponse {
  mode: 'fast' | 'slow';
  source: 'library' | 'llm' | 'library_fallback';
  name: string;
  focus: string;
  days: SuggestedWeekDay[];
  /** Bloques reales referenciados (trazabilidad: nunca se inventa contenido). */
  matched_blocks: MatchedBlock[];
  rest_days: number[];
  notes?: string | undefined;
}

export class SuggestWeekFromBlocksError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SuggestWeekFromBlocksError';
  }
}

// ---------------------------------------------------------------------------
// Block loading (selects default_modifiers, unlike the catalog listBlocks)
// ---------------------------------------------------------------------------

/**
 * Bloque cargado para composición. Superset del shape mínimo que necesita
 * `createPartFromLibraryBlock` (id/title/description/format) más la metadata de
 * clasificación (grupo, hint ATR) y los modificadores por defecto.
 */
export interface ComposableBlock {
  id: number;
  slug: string;
  title: string;
  description: string;
  methodology_group_id: number;
  format: string | null;
  source_ref: string | null;
  default_modifiers: BlockUseModifiers | null;
  /** The block's own exercises + their typed dose (`block_exercises`). */
  exercises: LibraryBlockExercise[];
}

export async function loadComposableBlocks(
  coachId: number | bigint,
  client: Sql,
): Promise<ComposableBlock[]> {
  const rows = await client<
    Array<{
      id: number;
      slug: string;
      title: string;
      description: string;
      methodology_group_id: number;
      format: string | null;
      source_ref: string | null;
      default_modifiers: BlockUseModifiers | null;
    }>
  >`
    select id, slug, title, description, methodology_group_id,
           format, source_ref, default_modifiers
    from blocks
    where coach_id = ${Number(coachId)}
    order by methodology_group_id asc, id asc
  `;
  if (rows.length === 0) return [];

  // The block's REAL dose. This loader used to skip `block_exercises` entirely
  // while the comment above claimed it only handled "bloques desglosables", so
  // every block materialised as `items: []` with the prescription stranded in
  // `coach_note` — Pablo's whole method arriving as dead text. One extra query
  // for the lot; blocks are ~100 per coach.
  //
  // The name is the coach's (mig 0132): they compose the week reading THEIR
  // vocabulary, so a base exercise they renamed must show up renamed here too.
  // The override join is a LEFT JOIN and only changes the label — never which
  // rows come back. No visibility predicate: `be.exercise_id` already arrives
  // from a block scoped by `b.coach_id`, and filtering here would make assigned
  // work vanish.
  const exRows = await client<
    Array<{
      block_id: number;
      exercise_id: number;
      exercise_name: string;
      prescription_json: unknown;
      params_json: Record<string, unknown> | null;
      notes: string | null;
    }>
  >`
    select be.block_id,
           be.exercise_id,
           coalesce(ceo.name, e.name) as exercise_name,
           be.prescription_json,
           be.params_json,
           be.notes
    from block_exercises be
    join blocks b on b.id = be.block_id
    join exercises e on e.id = be.exercise_id
    ${joinCoachOverride(client, BigInt(coachId))}
    where b.coach_id = ${Number(coachId)}
    order by be.block_id asc, be.block_position asc, be.position asc
  `;

  const byBlock = new Map<number, LibraryBlockExercise[]>();
  for (const r of exRows) {
    const list = byBlock.get(Number(r.block_id)) ?? [];
    list.push({
      exercise_id: Number(r.exercise_id),
      exercise_name: r.exercise_name,
      prescription_json: r.prescription_json,
      params_json: r.params_json,
      notes: r.notes,
    });
    byBlock.set(Number(r.block_id), list);
  }

  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    methodology_group_id: Number(r.methodology_group_id),
    exercises: byBlock.get(Number(r.id)) ?? [],
  }));
}

/**
 * Limpia los modificadores antes de materializarlos: tanto `default_modifiers`
 * (jsonb) como el `withLevelModifier` pueden traer claves a `null` (placeholders
 * sin valor de la biblioteca), pero `blockUseModifiersSchema` espera number/
 * string o AUSENTE — `null` lo rechaza al validar `block_modifiers`. Omitimos las
 * claves nulas/vacías/NaN en vez de propagarlas. Devuelve `null` si no queda
 * ningún modificador útil (evita objetos `{}` que disparen el modifier badge).
 */
function sanitizeModifiers(mods: BlockUseModifiers | null): BlockUseModifiers | null {
  if (!mods) return null;
  const next: BlockUseModifiers = {};
  if (typeof mods.intensity_pct === 'number' && !Number.isNaN(mods.intensity_pct)) {
    next.intensity_pct = mods.intensity_pct;
  }
  if (typeof mods.level === 'string' && mods.level.trim() !== '') {
    next.level = mods.level;
  }
  if (typeof mods.duration_min === 'number' && !Number.isNaN(mods.duration_min)) {
    next.duration_min = mods.duration_min;
  }
  if (typeof mods.rounds === 'number' && !Number.isNaN(mods.rounds)) {
    next.rounds = mods.rounds;
  }
  return Object.keys(next).length > 0 ? next : null;
}

/** Adapta un `ComposableBlock` al shape `Block` que consume el materializador. */
function toBlock(b: ComposableBlock): Block {
  return {
    id: b.id,
    slug: b.slug,
    title: b.title,
    description: b.description,
    methodology_group_id: b.methodology_group_id,
    // OJO: `blocks.format` es texto libre del importador ('zone2', 'race_sim'…),
    // NO el enum `templateFormat`. Va crudo aquí porque `Block` es el tipo del
    // dominio y lo guarda crudo; la traducción ocurre UNA vez, en
    // `templateFormatForBlock` dentro del materializador. Meterlo tal cual en un
    // `WeekDayPart` da 400 al guardar en 87 de los 99 bloques.
    format: b.format,
    source_ref: b.source_ref,
    // `needs_review` es del flujo de revisión de la biblioteca; el materializador
    // no lo usa. Solo completa el shape `Block`.
    needs_review: false,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function suggestWeekFromBlocks(params: {
  coach_id: number | bigint;
  body: unknown;
  client?: Sql;
}): Promise<SuggestWeekFromBlocksResponse> {
  const parsed = suggestWeekFromBlocksRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new SuggestWeekFromBlocksError('invalid_request', parsed.error.message, 400);
  }
  const client = params.client ?? defaultSql;
  const req = parsed.data;

  const allBlocks = await loadComposableBlocks(params.coach_id, client);
  if (allBlocks.length === 0) {
    throw new SuggestWeekFromBlocksError(
      'no_blocks',
      'No hay bloques en la biblioteca. Importa los bloques de Pablo primero.',
      409,
    );
  }

  const trainingDays = computeTrainingDayDistribution(req.days_per_week);

  // ---- Fast mode (or LLM unconfigured) → heurístico determinista -----------
  if (req.mode === 'fast' || !isCoachIaLlmConfigured()) {
    const built = composeWeekHeuristic({
      blocks: allBlocks,
      training_days: trainingDays,
      level: req.level,
    });
    const source = req.mode === 'slow' && !isCoachIaLlmConfigured() ? 'library_fallback' : 'library';
    return {
      mode: req.mode,
      source,
      name: req.name ?? defaultWeekName(req.focus),
      focus: req.focus,
      days: built.days,
      matched_blocks: built.matched,
      rest_days: built.rest_days,
      notes:
        source === 'library_fallback'
          ? 'LLM no configurado: semana compuesta desde la biblioteca de bloques (heurístico).'
          : built.notes,
    };
  }

  // ---- Slow mode → LLM elige/ordena bloques --------------------------------
  try {
    const built = await composeWeekLlm({
      blocks: allBlocks,
      training_days: trainingDays,
      focus: req.focus,
      level: req.level ?? 'pro',
      coach_id: params.coach_id,
    });
    return {
      mode: 'slow',
      source: 'llm',
      name: req.name ?? defaultWeekName(req.focus),
      focus: req.focus,
      days: built.days,
      matched_blocks: built.matched,
      rest_days: built.rest_days,
      notes: built.notes,
    };
  } catch (err) {
    const fallback = composeWeekHeuristic({
      blocks: allBlocks,
      training_days: trainingDays,
      level: req.level,
    });
    const failNote =
      err instanceof CoachIaLlmError
        ? `Coach IA LLM falló (${err.code}); semana compuesta desde la biblioteca (heurístico).`
        : 'Coach IA LLM falló; semana compuesta desde la biblioteca (heurístico).';
    return {
      mode: 'slow',
      source: 'library_fallback',
      name: req.name ?? defaultWeekName(req.focus),
      focus: req.focus,
      days: fallback.days,
      matched_blocks: fallback.matched,
      rest_days: fallback.rest_days,
      notes: [fallback.notes, failNote].filter(Boolean).join(' '),
    };
  }
}

// ---------------------------------------------------------------------------
// Materialization — block → WeekDayPart
// ---------------------------------------------------------------------------

function buildDay(
  dow: number,
  picked: Array<{ block: ComposableBlock; modifiers: BlockUseModifiers | null }>,
  focus: string | undefined,
): { day: SuggestedWeekDay; matched: MatchedBlock[] } {
  // Saneamos en el punto único de materialización: cubre el heurístico, el
  // parseo del LLM y los tests puros — `block_modifiers` nunca lleva null.
  const cleaned = picked.map((p) => ({ block: p.block, modifiers: sanitizeModifiers(p.modifiers) }));
  const matched: MatchedBlock[] = cleaned.map((p) => ({
    day_of_week: dow,
    block_id: p.block.id,
    block_title: p.block.title,
    methodology_group_id: p.block.methodology_group_id,
    modifiers: p.modifiers,
  }));
  // Materialización canónica (misma que la inserción manual desde el Studio):
  // verbatim en coach_note, items vacío, source_block_id + block_modifiers.
  const blocks = cleaned.map((p) =>
    createPartFromLibraryBlock(toBlock(p.block), p.modifiers ?? undefined, p.block.exercises),
  );
  const day = weekDaySchema.parse({
    day_of_week: dow,
    sessions: [{ kind: 'workout', template_id: null, ...(blocks.length > 0 ? { blocks } : {}) }],
    focus,
  });
  const previewLabel = picked.map((p) => p.block.title).join(' + ');
  return { day: { ...day, preview_label: previewLabel }, matched };
}

function restDay(dow: number): SuggestedWeekDay {
  const day = weekDaySchema.parse({ day_of_week: dow, sessions: [] });
  return { ...day, preview_label: 'Descanso' };
}

// ---------------------------------------------------------------------------
// Helpers shared with template-based composer
// ---------------------------------------------------------------------------

function computeTrainingDayDistribution(days_per_week: number): number[] {
  switch (days_per_week) {
    case 3:
      return [1, 3, 5];
    case 4:
      return [1, 3, 5, 6];
    case 5:
      return [1, 2, 4, 5, 6];
    case 6:
      return [1, 2, 3, 5, 6, 7];
    case 7:
    default:
      return [1, 2, 3, 4, 5, 6];
  }
}

function defaultWeekName(focus: string): string {
  const head = focus.split(/[.,;]/)[0]!.trim().slice(0, 60);
  return `Semana · ${head || 'Coach IA'}`;
}

interface ComposeResult {
  days: SuggestedWeekDay[];
  matched: MatchedBlock[];
  rest_days: number[];
  notes?: string | undefined;
}

// ---------------------------------------------------------------------------
// Heuristic composer (deterministic, NO LLM)
// ---------------------------------------------------------------------------

interface HeuristicArgs {
  blocks: ComposableBlock[];
  training_days: number[];
  level?: z.infer<typeof programLevel> | undefined;
}

/**
 * ¿Puede el coach CONFIRMAR una semana que use este bloque?
 *
 * De los 99 bloques de Pablo, 29 tienen ejercicios sin dosis ninguna: su
 * taquigrafía ("Strict shoulder press 4r" dice 4 series y nunca las reps, que se
 * las dice al atleta en el gym). El gate del importador BLOQUEA un item sin
 * dosis — con razón: nadie ejecuta una cantidad de trabajo sin especificar. Pero
 * si el reparto cae en ellos, la semana sale roja y no la puede confirmar.
 *
 * Así que entre SUS bloques preferimos los que sí puede shipear. No se impone
 * nada ni se inventa nada: mismo método, mismos grupos, mismo equilibrio — solo
 * se ordena. Los 29 siguen disponibles si su grupo no tiene alternativa (mejor su
 * bloque marcado que un hueco).
 *
 * Un bloque de solo prosa (sus 14 simulaciones y 9 WODs, sin `block_exercises`)
 * SÍ es confirmable: sale con `items: []` y su texto en `coach_note`, y sin items
 * no hay nada que marcar.
 *
 * Usa el gate real (`checkPrescriptionCompleteness`), no una heurística paralela:
 * si el listón cambia, esto lo sigue solo.
 */
function blockIsConfirmable(b: ComposableBlock): boolean {
  return b.exercises.every((ex) => {
    const parsed = safeParsePrescription(ex.prescription_json);
    if (!parsed.success) return false;
    const check = checkPrescriptionCompleteness(parsed.data, {
      modality: parsed.data.modality ?? null,
    });
    return isExecutable(check);
  });
}

/**
 * Compose determinista sin LLM. Reparte 1 bloque por día de entreno recorriendo
 * los grupos metodológicos, evitando repetir el mismo bloque y alternando carga
 * (strength/cardio/metcon) con recovery cuando es posible.
 *
 * Es la red de seguridad CLAVE: en prod el LLM puede no estar configurado, y la
 * composición debe seguir funcionando 100% determinista desde la biblioteca.
 */
export function composeWeekHeuristic(args: HeuristicArgs): ComposeResult {
  const trainingSet = new Set(args.training_days);

  // Agrupa bloques por methodology_group. Dentro de cada grupo, PRIMERO los que
  // el coach puede confirmar (ver `blockIsConfirmable`); a igualdad, por id.
  const byGroup = new Map<number, ComposableBlock[]>();
  for (const b of args.blocks) {
    const arr = byGroup.get(b.methodology_group_id);
    if (arr) arr.push(b);
    else byGroup.set(b.methodology_group_id, [b]);
  }
  for (const arr of byGroup.values()) {
    arr.sort((a, b) => {
      const ca = blockIsConfirmable(a) ? 0 : 1;
      const cb = blockIsConfirmable(b) ? 0 : 1;
      return ca !== cb ? ca - cb : a.id - b.id;
    });
  }

  // Orden de grupos a recorrer: por id de grupo metodológico.
  const groupOrder = [...byGroup.keys()].sort((a, b) => a - b);

  // Cursor por grupo para ir consumiendo bloques distintos sin repetir.
  const cursorByGroup = new Map<number, number>();
  const usedBlockIds = new Set<number>();

  const pickFromGroup = (gid: number): ComposableBlock | null => {
    const arr = byGroup.get(gid);
    if (!arr || arr.length === 0) return null;
    const cursor = cursorByGroup.get(gid) ?? 0;
    for (let i = 0; i < arr.length; i += 1) {
      const candidate = arr[(cursor + i) % arr.length]!;
      if (!usedBlockIds.has(candidate.id)) {
        cursorByGroup.set(gid, (cursor + i + 1) % arr.length);
        usedBlockIds.add(candidate.id);
        return candidate;
      }
    }
    // Todos usados — permite repetir (biblioteca pequeña) avanzando el cursor.
    const fallback = arr[cursor % arr.length]!;
    cursorByGroup.set(gid, (cursor + 1) % arr.length);
    return fallback;
  };

  const days: SuggestedWeekDay[] = [];
  const matched: MatchedBlock[] = [];
  const rest_days: number[] = [];
  const missingGroups = new Set<number>();

  // Recorremos los 7 días; los de entreno reciben el siguiente grupo de la
  // rotación (con balance recovery: si los 2 días previos fueron carga alta,
  // se intenta meter recovery/core).
  let groupCursor = 0;
  let consecutiveLoad = 0;

  for (let dow = 1; dow <= 7; dow += 1) {
    if (!trainingSet.has(dow)) {
      rest_days.push(dow);
      days.push(restDay(dow));
      continue;
    }

    if (groupOrder.length === 0) {
      // No hay bloques en ningún grupo aplicable → día vacío anotado.
      const day = weekDaySchema.parse({
        day_of_week: dow,
        sessions: [{ kind: 'workout', template_id: null, blocks: [] }],
      });
      days.push({ ...day, preview_label: 'Sin bloques disponibles' });
      continue;
    }

    // Balance: tras 2 días de carga seguidos, forzar recovery si existe.
    let gid: number;
    const recoveryGid = groupOrder.find((g) => GROUP_KIND[g] === 'recovery');
    if (consecutiveLoad >= 2 && recoveryGid != null) {
      gid = recoveryGid;
    } else {
      gid = groupOrder[groupCursor % groupOrder.length]!;
      groupCursor += 1;
    }

    const block = pickFromGroup(gid);
    if (!block) {
      missingGroups.add(gid);
      const day = weekDaySchema.parse({
        day_of_week: dow,
        sessions: [{ kind: 'workout', template_id: null, blocks: [] }],
      });
      days.push({ ...day, preview_label: 'Sin bloques disponibles' });
      continue;
    }

    consecutiveLoad = GROUP_KIND[block.methodology_group_id] === 'recovery' ? 0 : consecutiveLoad + 1;

    const modifiers = withLevelModifier(block.default_modifiers, args.level);
    const focus = focusHintForDay(block.methodology_group_id);
    const built = buildDay(dow, [{ block, modifiers }], focus);
    days.push(built.day);
    matched.push(...built.matched);
  }

  const notes =
    missingGroups.size > 0
      ? 'Sin bloques para algún grupo metodológico.'
      : undefined;

  return { days, matched, rest_days, notes };
}

/** Etiqueta de foco corta por grupo — Pablo edita después. */
function focusHintForDay(groupId: number): string | undefined {
  switch (GROUP_KIND[groupId]) {
    case 'strength':
      return 'Fuerza';
    case 'cardio':
      return 'Aeróbico / series';
    case 'metcon':
      return 'Metcon / específico';
    case 'recovery':
      return 'Recuperación / Z2';
    default:
      return undefined;
  }
}

/** Inyecta el nivel del atleta en los modificadores si el bloque no lo trae. */
function withLevelModifier(
  base: BlockUseModifiers | null,
  level: z.infer<typeof programLevel> | undefined,
): BlockUseModifiers | null {
  if (!level) return base;
  return { ...(base ?? {}), level: base?.level ?? level };
}

// ---------------------------------------------------------------------------
// LLM composer — el LLM elige block_ids reales + modificadores por día
// ---------------------------------------------------------------------------

const llmBlockRefSchema = z.object({
  block_id: z.number().int().positive(),
  // Mismos modificadores que la inserción manual (intensidad/nivel/duración/
  // rondas). Reutilizamos el schema compartido para no divergir validaciones.
  modifiers: blockUseModifiersSchema.optional(),
});

const llmDaySchema = z.object({
  day_of_week: z.number().int().min(1).max(7),
  kind: z.enum(['rest', 'workout']),
  block_ids: z.array(z.number().int().positive()).max(4).optional(),
  blocks: z.array(llmBlockRefSchema).max(4).optional(),
  focus: z.string().max(120).optional(),
});

const llmWeekSchema = z.object({
  days: z.array(llmDaySchema).min(1).max(7),
});

interface LlmComposeArgs {
  blocks: ComposableBlock[];
  training_days: number[];
  focus: string;
  level: z.infer<typeof programLevel>;
  coach_id: number | bigint;
}

const GROUP_NAMES_ES: Record<number, string> = {
  1: 'Fuerza Base',
  2: 'Fuerza Explosiva / Pliométrica',
  3: 'Series de Ergómetros',
  4: 'Series de Running',
  5: 'Zona 2 / Recuperación',
  6: 'WODs / Metcons',
  7: 'Simulaciones de Carrera',
  8: 'Core, Movilidad y Preventivos',
  9: 'Circuitos Funcionales',
  10: 'Tapering / Activación',
};

export async function composeWeekLlm(args: LlmComposeArgs): Promise<ComposeResult> {
  const system = [
    'Eres un coach de HYROX y entrenamiento híbrido de élite.',
    'Compones una SEMANA SELECCIONANDO bloques EXACTOS de la biblioteca del coach.',
    'NUNCA inventas contenido de entreno: solo eliges block_id que existan en el catálogo dado.',
    'JSON exacto: { "days": [{ "day_of_week", "kind": "rest"|"workout", "blocks"?: [{ "block_id", "modifiers"?: { "intensity_pct"?, "duration_min"?, "rounds"?, "level"? } }], "focus"? }] }',
    'Reglas:',
    '- 7 días (1=lunes…7=domingo). Marca descanso como kind:"rest" (sin blocks).',
    '- Cada día con kind:"workout" lleva 1-3 bloques (máx 4). Usa SOLO block_id del catálogo.',
    '- Varía los grupos: no apiles fuerza-fuerza-fuerza ni repitas el mismo bloque la misma semana.',
    '- Sesión dura → recuperación / Z2 al día siguiente.',
    '- Ajusta modifiers (intensidad/duración/rondas) al nivel del atleta. No es obligatorio.',
  ].join('\n');

  const catalog = args.blocks
    .map(
      (b) =>
        `- id=${b.id} | "${b.title}" | grupo=${b.methodology_group_id} (${GROUP_NAMES_ES[b.methodology_group_id] ?? '?'}) | fmt=${b.format ?? '—'}`,
    )
    .join('\n');

  const user = [
    `Foco semana: ${args.focus}`,
    `Nivel: ${args.level}`,
    `Días entreno preferidos: ${args.training_days.join(', ')}`,
    '',
    'Catálogo de bloques (usa SOLO estos block_id):',
    catalog,
  ].join('\n');

  const raw = await callCoachIaLlmJson({
    system,
    user,
    meta: { surface: 'suggest_week_blocks', coach_id: args.coach_id, athlete_id: null },
    temperature: 0.3,
    max_tokens: Number(process.env.LLM_CHAT_MAX_TOKENS_WEEK ?? 2048),
  });

  const parsed = llmWeekSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CoachIaLlmError('invalid_json', `LLM blocks-week schema inválido: ${parsed.error.message}`);
  }

  return materializeLlmWeek(parsed.data, args);
}

/**
 * Resuelve los block_id del LLM contra el catálogo real. block_ids inexistentes
 * se descartan (anotados); días sin ningún match válido → descanso. Exportada
 * para tests del parseo de la respuesta LLM.
 */
export function materializeLlmWeek(
  data: z.infer<typeof llmWeekSchema>,
  args: Pick<LlmComposeArgs, 'blocks' | 'training_days'>,
): ComposeResult {
  const byId = new Map(args.blocks.map((b) => [b.id, b]));
  const llmByDow = new Map(data.days.map((d) => [d.day_of_week, d]));

  const days: SuggestedWeekDay[] = [];
  const matched: MatchedBlock[] = [];
  const rest_days: number[] = [];
  const missingIds = new Set<number>();
  const usedBlockIds = new Set<number>();

  for (let dow = 1; dow <= 7; dow += 1) {
    const item = llmByDow.get(dow);

    // Normaliza: acepta `blocks:[{block_id,modifiers}]` (preferido) o
    // `block_ids:[...]` (sin modifiers). Si vienen ambos prevalece `blocks`.
    const refs: Array<{ block_id: number; modifiers: BlockUseModifiers | null }> =
      item?.blocks && item.blocks.length > 0
        ? item.blocks.map((r) => ({ block_id: r.block_id, modifiers: r.modifiers ?? null }))
        : (item?.block_ids ?? []).map((id) => ({ block_id: id, modifiers: null }));

    if (!item || item.kind === 'rest' || refs.length === 0) {
      rest_days.push(dow);
      days.push(restDay(dow));
      continue;
    }

    const picked: Array<{ block: ComposableBlock; modifiers: BlockUseModifiers | null }> = [];
    for (const ref of refs) {
      const block = byId.get(ref.block_id);
      if (!block) {
        missingIds.add(ref.block_id);
        continue;
      }
      if (usedBlockIds.has(block.id)) continue; // no repetir el mismo bloque
      usedBlockIds.add(block.id);
      picked.push({ block, modifiers: ref.modifiers });
    }

    if (picked.length === 0) {
      // Todos los ids inventados/duplicados → día vacío anotado, no descanso
      // (el LLM SÍ quería entreno aquí; dejamos slot para que Pablo lo llene).
      const day = weekDaySchema.parse({
        day_of_week: dow,
        sessions: [{ kind: 'workout', template_id: null, blocks: [] }],
        focus: item.focus,
      });
      days.push({ ...day, preview_label: 'Sesión pendiente (sin bloque válido)' });
      continue;
    }

    const built = buildDay(dow, picked, item.focus);
    days.push(built.day);
    matched.push(...built.matched);
  }

  const notes =
    missingIds.size > 0
      ? `El LLM referenció block_id inexistentes (${[...missingIds].join(', ')}); descartados.`
      : undefined;

  return { days, matched, rest_days, notes };
}
