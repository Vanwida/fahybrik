import 'server-only';

// v2 · BIBLIOTECA — server data shaper. Loads the two library surfaces (sesiones
// = library blocks, microciclos = month templates) in parallel via the EXISTING
// loaders, then maps each row into the v2 view model: a training MODALITY (the
// categorical color axis) + an OBJECTIVE bucket (the secondary rail). No new
// schema — pure read + classify.
//
// A "sesión" is the reusable training: the live `blocks` table (Pablo's 97 Excel
// trainings + the typed editor). Modality + objective are DERIVED from real fields
// (block.methodology_group_id) using the same closed enums the rest of the app
// uses; there is no persisted "modality" column, so the mapping lives here as the
// single source of truth for this screen.

import { sql as defaultSql, type Sql } from '@/lib/db';
import { listBlocks } from '@/lib/dashboard/coach/blocks';
import { listMonthTemplates } from '@/lib/dashboard/coach/program-months';
import { listMethodologyGroups } from '@/lib/dashboard/coach/methodology-groups';
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
// card border (see cardModality below). This is a presentation choice, not a data
// change.

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
 *  "mixta" cards fall back to calentamiento (neutral grey) so "mixed" never
 *  masquerades as a single modality. Group 8 (core/mobility) → calentamiento too. */
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
  title: string;
  description: string;
  format_label: string | null;
  modality: V2Modality;
  modality_filter: V2LibModalityFilter;
  objective: V2LibObjective | null;
  group_id: number;
  group_label: string;
  needs_review: boolean;
}

/** A microcycle template (program_month_templates) — the multi-week unit the
 *  athlete lives. Links to the existing editor at /v2/microciclos/[id]. */
export interface V2MicrocicloItem {
  id: string;
  name: string;
  /** Agnostic level name (athlete_levels.name); '' when no level set. */
  level: string;
  /** Number of weeks defined (via program_month_weeks). */
  week_count: number;
}

export interface V2BibliotecaData {
  sesiones: V2SesionItem[];
  microciclos: V2MicrocicloItem[];
  counts: { sesiones: number; microciclos: number };
}

// ── Public loader ─────────────────────────────────────────────────────────────

export async function loadBibliotecaData(params: {
  coach_id: number | bigint;
  client?: Sql;
}): Promise<V2BibliotecaData> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);

  const [blocks, groups, months] = await Promise.all([
    listBlocks(coachId, null, client),
    listMethodologyGroups(client),
    listMonthTemplates({ coach_id: coachId, client }),
  ]);

  const groupLabel = new Map<number, string>(groups.map((g) => [g.id, g.name_es]));

  const sesiones = blocks.map((b) => mapSesion(b, groupLabel));
  const microciclos = months.map(mapMicrociclo);

  return {
    sesiones,
    microciclos,
    counts: {
      sesiones: sesiones.length,
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

function mapSesion(b: Block, groupLabel: Map<number, string>): V2SesionItem {
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
    needs_review: b.needs_review,
  };
}
