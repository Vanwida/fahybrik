import 'server-only';

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { atrBlockType } from '@fahybrid/shared/schema/_primitives';
import type { AtrBlockType } from '@fahybrid/shared/schema/_primitives';
import {
  weekDaySchema,
  blockUseModifiersSchema,
  type WeekDay,
  type BlockUseModifiers,
} from '@fahybrid/shared/schema/program-templates';
import type { AtrBlockHint, Block } from '@fahybrid/shared/schema/blocks';
import { isPabloIaLlmConfigured, callPabloIaLlmJson, PabloIaLlmError } from './llm';
import { createPartFromLibraryBlock } from '@/lib/dashboard/programming/block-to-part';

/**
 * Pablo IA — composición de SEMANA a partir de la BIBLIOTECA DE BLOQUES (0037).
 *
 * Principio de producto (Documento Maestro): la IA NO genera entrenos de cero —
 * SELECCIONA y ADAPTA bloques existentes de Pablo. Esta es la diferencia con
 * `suggest-week.ts`, que reparte TEMPLATES del catálogo (sesiones completas con
 * `template_segments` hidratables a ejercicios). Los bloques (Model A) guardan
 * la prescripción VERBATIM en `description` y NO tienen estructura de ejercicios,
 * así que cada bloque se materializa como un `WeekDayPart` con:
 *   - `title`       = block.title
 *   - `coach_note`  = block.description verbatim (+ modificadores sugeridos)
 *   - `items: []`   (Pablo detalla ejercicios después si quiere)
 *   - `format`      = mapeo coarse → templateFormat (para que el Studio renderice)
 *
 * El shape de salida es compatible con el modal "Generar semana" del dashboard:
 * `days: WeekDay[]` consumible por `onAcceptWeek`. Además expone `matched_blocks`
 * con los `block_id` reales referenciados (trazabilidad — nunca inventamos).
 *
 * La materialización bloque → `WeekDayPart` (format mapping, coach_note verbatim,
 * source_block_id, modificadores) la hace `createPartFromLibraryBlock` — la misma
 * que usa la inserción manual desde el Studio. NO duplicamos esa lógica aquí.
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

/**
 * Prioridad de grupos por fase ATR. Bloques de grupos al frente de la lista se
 * eligen primero. No es exclusión dura — si no hay bloques de un grupo, se
 * baja al siguiente (mejor algo coherente que un día vacío).
 *
 *   ACC   acumulación: volumen aeróbico + fuerza máxima + ergómetros
 *   TRANS transformación: específico HYROX + threshold + metcons
 *   REAL  realización: race-pace, simulaciones y tapering
 */
const PHASE_GROUP_PRIORITY: Record<AtrBlockType, number[]> = {
  ACC: [1, 5, 3, 2, 4, 8, 9, 6, 7, 10],
  TRANS: [4, 3, 6, 9, 7, 1, 2, 5, 8, 10],
  REAL: [7, 10, 6, 4, 3, 9, 5, 1, 2, 8],
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
    atr_block: atrBlockType.optional(),
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
  atr_block_hint: AtrBlockHint | null;
  source_ref: string | null;
  default_modifiers: BlockUseModifiers | null;
}

async function loadComposableBlocks(client: Sql): Promise<ComposableBlock[]> {
  const rows = await client<
    Array<{
      id: number;
      slug: string;
      title: string;
      description: string;
      methodology_group_id: number;
      format: string | null;
      atr_block_hint: AtrBlockHint | null;
      source_ref: string | null;
      default_modifiers: BlockUseModifiers | null;
    }>
  >`
    select id, slug, title, description, methodology_group_id,
           format, atr_block_hint, source_ref, default_modifiers
    from blocks
    where coach_id is null
    order by methodology_group_id asc, id asc
  `;
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    methodology_group_id: Number(r.methodology_group_id),
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
    format: b.format,
    atr_block_hint: b.atr_block_hint,
    source_ref: b.source_ref,
    // El composer solo trabaja con bloques desglosables (con block_exercises);
    // el materializador no usa este flag. Completa el shape `Block`.
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

  const allBlocks = await loadComposableBlocks(client);
  if (allBlocks.length === 0) {
    throw new SuggestWeekFromBlocksError(
      'no_blocks',
      'No hay bloques en la biblioteca. Importa los bloques de Pablo primero.',
      409,
    );
  }

  const trainingDays = computeTrainingDayDistribution(req.days_per_week);

  // ---- Fast mode (or LLM unconfigured) → heurístico determinista -----------
  if (req.mode === 'fast' || !isPabloIaLlmConfigured()) {
    const built = composeWeekHeuristic({
      blocks: allBlocks,
      training_days: trainingDays,
      atr_block: req.atr_block,
      level: req.level,
    });
    const source = req.mode === 'slow' && !isPabloIaLlmConfigured() ? 'library_fallback' : 'library';
    return {
      mode: req.mode,
      source,
      name: req.name ?? defaultWeekName(req.focus, req.atr_block),
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
      atr_block: req.atr_block,
      coach_id: params.coach_id,
    });
    return {
      mode: 'slow',
      source: 'llm',
      name: req.name ?? defaultWeekName(req.focus, req.atr_block),
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
      atr_block: req.atr_block,
      level: req.level,
    });
    const failNote =
      err instanceof PabloIaLlmError
        ? `Pablo IA LLM falló (${err.code}); semana compuesta desde la biblioteca (heurístico).`
        : 'Pablo IA LLM falló; semana compuesta desde la biblioteca (heurístico).';
    return {
      mode: 'slow',
      source: 'library_fallback',
      name: req.name ?? defaultWeekName(req.focus, req.atr_block),
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
    createPartFromLibraryBlock(toBlock(p.block), p.modifiers ?? undefined),
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

function defaultWeekName(focus: string, atr?: AtrBlockType): string {
  const block = atr ?? 'Semana';
  const head = focus.split(/[.,;]/)[0]!.trim().slice(0, 60);
  return `${block} · ${head || 'Pablo IA'}`;
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
  atr_block?: AtrBlockType | undefined;
  level?: z.infer<typeof programLevel> | undefined;
}

/**
 * Compose determinista sin LLM. Reparte 1 bloque por día de entreno alternando
 * grupos según la prioridad de la fase ATR, evitando repetir el mismo bloque y
 * alternando carga (strength/cardio/metcon) con recovery cuando es posible.
 *
 * Es la red de seguridad CLAVE: en prod el LLM puede no estar configurado, y la
 * composición debe seguir funcionando 100% determinista desde la biblioteca.
 */
export function composeWeekHeuristic(args: HeuristicArgs): ComposeResult {
  const trainingSet = new Set(args.training_days);
  const phase = args.atr_block;

  // Agrupa bloques por methodology_group, priorizando los que tengan el
  // atr_block_hint de la fase (si hay fase). Dentro de cada grupo: hint-match
  // primero, luego el resto.
  const byGroup = new Map<number, ComposableBlock[]>();
  for (const b of args.blocks) {
    const arr = byGroup.get(b.methodology_group_id);
    if (arr) arr.push(b);
    else byGroup.set(b.methodology_group_id, [b]);
  }
  if (phase) {
    for (const arr of byGroup.values()) {
      arr.sort((a, b) => {
        const am = a.atr_block_hint === phase ? 0 : 1;
        const bm = b.atr_block_hint === phase ? 0 : 1;
        return am - bm;
      });
    }
  }

  // Orden de grupos a recorrer según la fase (o fallback: por id).
  const groupOrder = phase
    ? PHASE_GROUP_PRIORITY[phase].filter((g) => byGroup.has(g))
    : [...byGroup.keys()].sort((a, b) => a - b);

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
      ? `Sin bloques para algún grupo de la fase ${phase ?? ''}.`.trim()
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
  atr_block?: AtrBlockType | undefined;
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
    'Eres Pablo IA, coach HYROX/hybrid élite — Fabrik Training Club Barcelona.',
    'Compones una SEMANA SELECCIONANDO bloques EXACTOS de la biblioteca de Pablo.',
    'NUNCA inventas contenido de entreno: solo eliges block_id que existan en el catálogo dado.',
    'JSON exacto: { "days": [{ "day_of_week", "kind": "rest"|"workout", "blocks"?: [{ "block_id", "modifiers"?: { "intensity_pct"?, "duration_min"?, "rounds"?, "level"? } }], "focus"? }] }',
    'Reglas:',
    '- 7 días (1=lunes…7=domingo). Marca descanso como kind:"rest" (sin blocks).',
    '- Cada día con kind:"workout" lleva 1-3 bloques (máx 4). Usa SOLO block_id del catálogo.',
    '- Respeta la fase ATR: ACC=volumen aeróbico + fuerza máxima + ergómetros; TRANS=específico HYROX + threshold + metcons; REAL=race-pace, simulaciones y tapering.',
    '- Varía los grupos: no apiles fuerza-fuerza-fuerza ni repitas el mismo bloque la misma semana.',
    '- Sesión dura → recuperación / Z2 al día siguiente.',
    '- Ajusta modifiers (intensidad/duración/rondas) al nivel del atleta. No es obligatorio.',
    '- Lenguaje técnico ATR.',
  ].join('\n');

  const catalog = args.blocks
    .map(
      (b) =>
        `- id=${b.id} | "${b.title}" | grupo=${b.methodology_group_id} (${GROUP_NAMES_ES[b.methodology_group_id] ?? '?'}) | atr=${b.atr_block_hint ?? '—'} | fmt=${b.format ?? '—'}`,
    )
    .join('\n');

  const user = [
    `Foco semana: ${args.focus}`,
    `Nivel: ${args.level}`,
    `Bloque ATR: ${args.atr_block ?? 'no especificado'}`,
    `Días entreno preferidos: ${args.training_days.join(', ')}`,
    '',
    'Catálogo de bloques (usa SOLO estos block_id):',
    catalog,
  ].join('\n');

  const raw = await callPabloIaLlmJson({
    system,
    user,
    meta: { surface: 'suggest_week_blocks', coach_id: args.coach_id, athlete_id: null },
    temperature: 0.3,
    max_tokens: Number(process.env.LLM_CHAT_MAX_TOKENS_WEEK ?? 2048),
  });

  const parsed = llmWeekSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PabloIaLlmError('invalid_json', `LLM blocks-week schema inválido: ${parsed.error.message}`);
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
