import type { Block } from '@fahybrid/shared/schema/blocks';

// Modelo normalizado de la biblioteca única de /programar (spec §3a): los ~97
// bloques de Pablo (read-only) y los entrenos propios del coach se funden en
// UN solo grid de "Sesiones" con UN solo sistema de tags (grupo metodológico ·
// formato · fase ATR · nivel). Aquí vive la normalización + el filtrado; la UI
// (cards, chips) consume este shape sin saber de dónde viene cada sesión.

/** Fila del catálogo de entrenos propios (GET /api/coach/templates). */
export interface TemplateRow {
  id: string;
  name: string;
  format: string;
  target_block: string;
  target_level: number | null;
  is_draft: boolean;
  segment_count: number;
  block_count: number;
  updated_at: string;
  methodology_group_id: number | null;
}

export type SessionOrigin = 'pablo' | 'propia';
export type AtrTag = 'ACC' | 'TRANS' | 'REAL';

/** Pestañas de /programar (?tab=). Módulo plano: importable desde el server. */
export const PROGRAMAR_TABS = ['sesiones', 'microciclos'] as const;
export type ProgramarTab = (typeof PROGRAMAR_TABS)[number];

export interface LibrarySessionItem {
  /** Clave única del grid: `pablo-<blocks.id>` | `own-<templates.id>`. */
  key: string;
  origin: SessionOrigin;
  /** blocks.id (Pablo) o templates.id (propia), como string. */
  source_id: string;
  title: string;
  /** Prescripción verbatim (Pablo) — null para propias. */
  summary: string | null;
  methodology_group_id: number | null;
  atr: AtrTag | null;
  format_facet: FormatFacetId | null;
  /** target_level 1–3 (solo propias). */
  level: number | null;
  is_draft: boolean;
  needs_review: boolean;
  block_count: number | null;
  exercise_count: number | null;
  updated_at: string | null;
}

// ── Facetas de formato ───────────────────────────────────────────────────────
// Una sola taxonomía visible que reconcilia los dos enums internos: el format
// "coarse" de los bloques de Pablo (10 valores, schema/blocks) y el
// template_format técnico de los entrenos (8 valores, _primitives).

export const FORMAT_FACETS = [
  { id: 'fuerza', label: 'Fuerza' },
  { id: 'series', label: 'Series' },
  { id: 'continuo', label: 'Continuo' },
  { id: 'metcon', label: 'Metcon' },
  { id: 'circuito', label: 'Circuito' },
  { id: 'simulacion', label: 'Simulación' },
  { id: 'pliometria', label: 'Pliometría' },
  { id: 'accesorio', label: 'Accesorio' },
  { id: 'tapering', label: 'Tapering' },
] as const;

export type FormatFacetId = (typeof FORMAT_FACETS)[number]['id'];

const BLOCK_FORMAT_TO_FACET: Record<string, FormatFacetId> = {
  strength_block: 'fuerza',
  plyometric: 'pliometria',
  erg_intervals: 'series',
  run_intervals: 'series',
  zone2: 'continuo',
  metcon: 'metcon',
  race_sim: 'simulacion',
  core_mobility: 'accesorio',
  functional_circuit: 'circuito',
  tapering: 'tapering',
};

const TEMPLATE_FORMAT_TO_FACET: Record<string, FormatFacetId> = {
  strength_block: 'fuerza',
  hyrox_sim: 'simulacion',
  intervals: 'series',
  circuit: 'circuito',
  amrap: 'metcon',
  emom: 'metcon',
  for_time: 'metcon',
  tempo: 'continuo',
};

export function formatFacetLabel(id: FormatFacetId | null): string | null {
  if (id == null) return null;
  return FORMAT_FACETS.find((f) => f.id === id)?.label ?? null;
}

/** Etiquetas de nivel del catálogo (templates.target_level 1–3). */
export const SESSION_LEVEL_LABELS: Record<number, string> = {
  1: 'Iniciación',
  2: 'Intermedio',
  3: 'Pro/Elite',
};

// ── Normalización ────────────────────────────────────────────────────────────

export function blockToLibraryItem(block: Block): LibrarySessionItem {
  return {
    key: `pablo-${block.id}`,
    origin: 'pablo',
    source_id: String(block.id),
    title: block.title,
    summary: block.description,
    methodology_group_id: block.methodology_group_id,
    atr: block.atr_block_hint,
    format_facet: block.format ? (BLOCK_FORMAT_TO_FACET[block.format] ?? null) : null,
    level: null,
    is_draft: false,
    needs_review: block.needs_review,
    block_count: null,
    exercise_count: null,
    updated_at: null,
  };
}

export function templateToLibraryItem(row: TemplateRow): LibrarySessionItem {
  return {
    key: `own-${row.id}`,
    origin: 'propia',
    source_id: row.id,
    title: row.name,
    summary: null,
    methodology_group_id: row.methodology_group_id,
    atr: row.target_block === 'any' ? null : (row.target_block as AtrTag),
    format_facet: TEMPLATE_FORMAT_TO_FACET[row.format] ?? null,
    level: row.target_level,
    is_draft: row.is_draft,
    needs_review: false,
    block_count: row.block_count,
    exercise_count: row.segment_count,
    updated_at: row.updated_at,
  };
}

// ── Filtrado (un solo sistema de tags + búsqueda) ────────────────────────────

export interface LibraryFilters {
  search: string;
  /** 'all' | id de grupo (1–10) | 'none' (sin grupo). */
  group: 'all' | 'none' | number;
  format: 'all' | FormatFacetId;
  atr: 'all' | AtrTag;
  level: 'all' | number;
  origin: 'all' | SessionOrigin;
}

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  search: '',
  group: 'all',
  format: 'all',
  atr: 'all',
  level: 'all',
  origin: 'all',
};

export function countActiveFilters(f: LibraryFilters): number {
  let n = 0;
  if (f.group !== 'all') n += 1;
  if (f.format !== 'all') n += 1;
  if (f.atr !== 'all') n += 1;
  if (f.level !== 'all') n += 1;
  if (f.origin !== 'all') n += 1;
  return n;
}

export function filterLibraryItems(
  items: LibrarySessionItem[],
  filters: LibraryFilters,
): LibrarySessionItem[] {
  const q = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.origin !== 'all' && item.origin !== filters.origin) return false;
    if (filters.group === 'none' && item.methodology_group_id != null) return false;
    if (
      typeof filters.group === 'number' &&
      item.methodology_group_id !== filters.group
    ) {
      return false;
    }
    if (filters.format !== 'all' && item.format_facet !== filters.format) return false;
    if (filters.atr !== 'all' && item.atr !== filters.atr) return false;
    if (filters.level !== 'all' && item.level !== filters.level) return false;
    if (q) {
      const haystack = `${item.title} ${item.summary ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
