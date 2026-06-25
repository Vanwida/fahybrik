import 'server-only';

// v2 · BIBLIOTECA — server data shaper. Loads the three library surfaces (sesiones
// = templates, bloques = library blocks, microciclos = month templates) in parallel
// via the EXISTING loaders, then maps each row into the v2 view model:
// a training MODALITY (the categorical color axis) + an OBJECTIVE bucket (the
// secondary rail) + a usage count. No new schema — pure read + classify.
//
// Modality + objective are DERIVED from real fields (template.format,
// block.methodology_group_id / block.format) using the same closed enums the rest
// of the app uses; there is no persisted "modality" column yet, so the mapping
// lives here as the single source of truth for this screen.

import { sql as defaultSql, type Sql } from '@/lib/db';
import { listTemplatesForCoach, type TemplateListRow } from '@/lib/dashboard/coach/templates';
import { listBlocks } from '@/lib/dashboard/coach/blocks';
import { listMonthTemplates } from '@/lib/dashboard/coach/program-months';
import { listMethodologyGroups } from '@/lib/dashboard/coach/methodology-groups';
import { formatLabel } from '@/lib/dashboard/constants/week-day-part-presets';
import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import type { Block } from '@fahybrid/shared/schema/blocks';
import type { V2Modality } from '@/components/v2/constants';

// ── Category axes ─────────────────────────────────────────────────────────────
// The filter axes + their type aliases live in the CLIENT-SAFE `biblioteca-axes`
// module (no server-only dep) so client components can import the runtime constants
// without pulling the postgres driver into the browser bundle. Re-exported here so
// this module stays the single import surface for callers that also need the loader.
export {
  LIB_MODALITY_FILTERS,
  LIB_OBJECTIVES,
  type V2LibModalityFilter,
  type V2LibObjective,
} from './biblioteca-axes';
import type { V2LibModalityFilter, V2LibObjective } from './biblioteca-axes';

// ── Derivation maps (real enums → view axes) ─────────────────────────────────

/** template.format → modality filter. A sesión can combine work; we pick the
 *  modality the format's PRIMARY stimulus reads as, falling back to "mixta" when
 *  the format spans modalities (HYROX sim, generic AMRAP/EMOM conditioning). */
const TEMPLATE_FORMAT_MODALITY: Record<TemplateFormat, V2LibModalityFilter> = {
  strength_block: 'fuerza',
  tempo: 'carrera', // tempo runs
  intervals: 'carrera', // run/erg intervals — default run; block-level refines
  hyrox_sim: 'mixta',
  amrap: 'circuito',
  emom: 'circuito',
  for_time: 'circuito',
  circuit: 'circuito',
  test: 'ergo', // default test type is ergo; spans modalities by picked type
};

/** template.format → objective bucket (best-effort; null = unclassified). */
const TEMPLATE_FORMAT_OBJECTIVE: Record<TemplateFormat, V2LibObjective | null> = {
  strength_block: 'fuerza_max',
  tempo: 'umbral',
  intervals: 'vo2',
  hyrox_sim: 'umbral',
  amrap: 'vo2',
  emom: 'vo2',
  for_time: 'vo2',
  circuit: 'umbral',
  test: null, // a test is a calibration effort, not an objective bucket
};

/** block.methodology_group_id (1..10) → modality. Groups are the canonical
 *  classification of Pablo's blocks, so this is the most reliable signal. */
const GROUP_MODALITY: Record<number, V2LibModalityFilter> = {
  1: 'fuerza', // Fuerza Base
  2: 'fuerza', // Fuerza Explosiva / Pliométrica
  3: 'ergo', // Series de Ergómetros
  4: 'carrera', // Series de Running
  5: 'carrera', // Zona 2 / Recuperación (run-led)
  6: 'circuito', // WODs / Metcons
  7: 'mixta', // Simulaciones de Carrera (HYROX/DEKA)
  8: 'fuerza', // Core, Movilidad y Preventivos → accessory; surfaced under Fuerza (see note)
  9: 'circuito', // Circuitos Funcionales
  10: 'mixta', // (tapering / mixed) — defensive default
};
// NOTE: group 8 (Core, Movilidad y Preventivos) has no dedicated modality chip;
// it reads as accessory work. We surface it under "fuerza" so it is never lost
// from the modality rail, but it carries the neutral calentamiento color on the
// card border (see blockBorderModality below). This is a presentation choice, not
// a data change.

/** block.methodology_group_id → objective bucket. */
const GROUP_OBJECTIVE: Record<number, V2LibObjective | null> = {
  1: 'fuerza_max',
  2: 'fuerza_max',
  3: 'umbral',
  4: 'vo2',
  5: 'base_z2',
  6: 'vo2',
  7: 'umbral',
  8: null, // core/mobility — no aerobic/strength objective bucket
  9: 'umbral',
  10: null,
};

/** The color the CARD border/dot uses — the strict V2Modality (no "mixta").
 *  "mixta" cards fall back to the brand-neutral circuito hue is wrong (orange-ish);
 *  use calentamiento (neutral grey) so "mixed" never masquerades as a single
 *  modality. Group 8 (core/mobility) → calentamiento (neutral) too. */
function cardModality(filter: V2LibModalityFilter, groupId?: number): V2Modality {
  if (groupId === 8) return 'calentamiento';
  switch (filter) {
    case 'mixta':
      return 'calentamiento';
    case 'carrera':
    case 'ergo':
    case 'fuerza':
    case 'circuito':
      return filter;
    default:
      return 'calentamiento';
  }
}

// ── View models ───────────────────────────────────────────────────────────────

export interface V2SesionItem {
  id: string;
  name: string;
  format: string;
  format_label: string;
  modality: V2Modality;
  modality_filter: V2LibModalityFilter;
  objective: V2LibObjective | null;
  block_count: number;
  segment_count: number;
  est_minutes: number;
  is_draft: boolean;
  /** How many program-week plantillas reference this sesión. */
  used_in_plans: number;
}

export interface V2BloqueItem {
  id: string;
  title: string;
  description: string;
  format_label: string | null;
  modality: V2Modality;
  modality_filter: V2LibModalityFilter;
  objective: V2LibObjective | null;
  group_id: number;
  group_label: string;
  atr_hint: 'ACC' | 'TRANS' | 'REAL' | null;
  needs_review: boolean;
}

/** A microcycle template (program_month_templates) — the multi-week unit the
 *  athlete lives. Links to the existing editor at /v2/microciclos/[id]. */
export interface V2MicrocicloItem {
  id: string;
  name: string;
  /** program_level value (raw enum; capitalized for display in the card). */
  level: string;
  /** Number of weeks defined (via program_month_weeks). */
  week_count: number;
}

export interface V2BibliotecaData {
  sesiones: V2SesionItem[];
  bloques: V2BloqueItem[];
  microciclos: V2MicrocicloItem[];
  counts: { sesiones: number; bloques: number; microciclos: number };
}

// ── Minutes estimation ────────────────────────────────────────────────────────
// No persisted duration on a template; estimate from block count so the card's
// "~min" reads honestly as an estimate. ~12 min/block is Pablo's working average
// (warm-up + main + transitions). Clamped to a sane floor/ceiling.
const MIN_PER_BLOCK = 12;
const MIN_FLOOR = 20;
const MIN_CEIL = 120;
function estMinutes(blockCount: number): number {
  const raw = Math.max(blockCount, 1) * MIN_PER_BLOCK;
  return Math.min(MIN_CEIL, Math.max(MIN_FLOOR, Math.round(raw / 5) * 5));
}

// ── Usage count (batched) ─────────────────────────────────────────────────────
// One query maps template_id → number of distinct program_week_templates that
// reference it via slots_json.days[*].sessions[*].template_id. Avoids N per-row
// queries (the per-template helper exists but would be 500 round-trips).
async function loadTemplateUsage(coach_id: number, client: Sql): Promise<Map<string, number>> {
  const rows = await client<Array<{ template_id: string; cnt: number }>>`
    select (s->>'template_id') as template_id, count(distinct w.id)::int as cnt
    from program_week_templates w
    cross join lateral jsonb_array_elements(coalesce(w.slots_json->'days', '[]'::jsonb)) as d
    cross join lateral jsonb_array_elements(coalesce(d->'sessions', '[]'::jsonb)) as s
    where w.coach_id = ${coach_id}
      and (s ? 'template_id')
      and (s->>'template_id') is not null
    group by (s->>'template_id')
  `;
  const map = new Map<string, number>();
  for (const r of rows) map.set(String(r.template_id), Number(r.cnt));
  return map;
}

// ── Public loader ─────────────────────────────────────────────────────────────

export async function loadBibliotecaData(params: {
  coach_id: number | bigint;
  client?: Sql;
}): Promise<V2BibliotecaData> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);

  const [templates, blocks, groups, months, usage] = await Promise.all([
    listTemplatesForCoach(coachId, client),
    listBlocks(null, client),
    listMethodologyGroups(client),
    listMonthTemplates({ coach_id: coachId, client }),
    loadTemplateUsage(coachId, client).catch(() => new Map<string, number>()),
  ]);

  const groupLabel = new Map<number, string>(groups.map((g) => [g.id, g.name_es]));

  const sesiones = templates.map((t) => mapSesion(t, usage));
  const bloques = blocks.map((b) => mapBloque(b, groupLabel));
  const microciclos = months.map(mapMicrociclo);

  return {
    sesiones,
    bloques,
    microciclos,
    counts: {
      sesiones: sesiones.length,
      bloques: bloques.length,
      microciclos: microciclos.length,
    },
  };
}

function mapMicrociclo(m: {
  id: string;
  name: string;
  level: string;
  week_count: number;
}): V2MicrocicloItem {
  return {
    id: m.id,
    name: m.name,
    level: m.level,
    week_count: m.week_count,
  };
}

function mapSesion(t: TemplateListRow, usage: Map<string, number>): V2SesionItem {
  const fmt = t.format as TemplateFormat;
  const modality_filter = TEMPLATE_FORMAT_MODALITY[fmt] ?? 'mixta';
  return {
    id: t.id,
    name: t.name,
    format: t.format,
    format_label: safeFormatLabel(fmt),
    modality: cardModality(modality_filter),
    modality_filter,
    objective: TEMPLATE_FORMAT_OBJECTIVE[fmt] ?? null,
    block_count: t.block_count,
    segment_count: t.segment_count,
    est_minutes: estMinutes(t.block_count),
    is_draft: t.is_draft,
    used_in_plans: usage.get(t.id) ?? 0,
  };
}

function mapBloque(b: Block, groupLabel: Map<number, string>): V2BloqueItem {
  const modality_filter = GROUP_MODALITY[b.methodology_group_id] ?? 'mixta';
  return {
    id: String(b.id),
    title: b.title,
    description: b.description,
    format_label: b.format ? b.format.replace(/_/g, ' ') : null,
    modality: cardModality(modality_filter, b.methodology_group_id),
    modality_filter,
    objective: GROUP_OBJECTIVE[b.methodology_group_id] ?? null,
    group_id: b.methodology_group_id,
    group_label: groupLabel.get(b.methodology_group_id) ?? `Grupo ${b.methodology_group_id}`,
    atr_hint: b.atr_block_hint,
    needs_review: b.needs_review,
  };
}

function safeFormatLabel(fmt: TemplateFormat): string {
  try {
    return formatLabel(fmt);
  } catch {
    return String(fmt).replace(/_/g, ' ');
  }
}

// ── Matrix loader ─────────────────────────────────────────────────────────────

export interface MatrixLevel {
  id: number;
  name: string;
  label: string;
  sort_order: number;
}

export interface MatrixCellValue {
  block_id: number;
  block_name: string;
  needs_review: boolean;
}

export interface V2BlockMatrixData {
  levels: MatrixLevel[];
  cells: Record<string, MatrixCellValue | null>;
}

const MATRIX_DAYS = [3, 4, 5, 6] as const;

/**
 * Loads the Level × Days matrix for the block library. Blocks with
 * min_level_id IS NULL or days_per_week IS NULL are excluded from the matrix
 * (they remain in the list view). One block per cell — first match wins.
 * The result is intended for client-side use via SWR / fetch; callers that
 * need it SSR can pass a `client` override.
 */
export async function listBlocksMatrix(params: {
  coach_id: number | bigint;
  client?: Sql;
}): Promise<V2BlockMatrixData> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);

  const [levelRows, blockRows] = await Promise.all([
    client<MatrixLevel[]>`
      select id::int, name, label, sort_order
      from athlete_levels
      where coach_id = ${coachId}
      order by sort_order asc, id asc
    `,
    client<Array<{ id: number; name: string; min_level_id: number; days_per_week: number; needs_review: boolean }>>`
      select
        b.id::int,
        b.title as name,
        b.min_level_id::int,
        b.days_per_week::int,
        coalesce(b.needs_review, false) as needs_review
      from blocks b
      where b.coach_id = ${coachId}
        and b.min_level_id is not null
        and b.days_per_week is not null
      order by b.min_level_id, b.days_per_week
    `,
  ]);

  // Index blocks by cell key — first match wins.
  const cellMap = new Map<string, MatrixCellValue>();
  for (const b of blockRows) {
    const key = `${b.min_level_id}_${b.days_per_week}`;
    if (!cellMap.has(key)) {
      cellMap.set(key, {
        block_id: b.id,
        block_name: b.name,
        needs_review: Boolean(b.needs_review),
      });
    }
  }

  // Build full sparse cells record (null for empty slots).
  const cells: Record<string, MatrixCellValue | null> = {};
  for (const level of levelRows) {
    for (const days of MATRIX_DAYS) {
      const key = `${level.id}_${days}`;
      cells[key] = cellMap.get(key) ?? null;
    }
  }

  return { levels: levelRows, cells };
}
