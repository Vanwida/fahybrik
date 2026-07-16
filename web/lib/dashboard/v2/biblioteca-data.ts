import 'server-only';

// v2 · BIBLIOTECA — server data shaper. Loads the library surfaces in parallel via
// the EXISTING loaders, then maps each row into the v2 view model: a training
// MODALITY (the categorical color axis) + an OBJECTIVE bucket (the secondary
// rail). No new schema — pure read + classify.
//
// LA ESCALERA (de lo más pequeño a lo más grande) — Ejercicio › Bloque › Sesión ›
// Microciclo. Cada peldaño es una tabla distinta y aquí NO se mezclan:
//   · Bloque    = `blocks` (+ block_exercises) — la pieza REUTILIZABLE del coach.
//                 Los 97 entrenos del Excel de Pablo son esto.
//   · Sesión    = `templates` madre (instance_athlete_id IS NULL) + template_segments
//                 — UN entreno, el que ejecuta el atleta.
//   · Microciclo = `program_month_templates` — varias semanas.
// Hasta ahora la pestaña "Sesiones" leía `blocks`: llamaba sesión a un bloque y
// las sesiones reales (templates) no se veían en ninguna parte. Eso se corrige aquí.
//
// Modality + objective are DERIVED from real fields (methodology_group_id) using
// the same closed enums the rest of the app uses; there is no persisted "modality"
// column, so the mapping lives here as the single source of truth for this screen.

import { sql as defaultSql, type Sql } from '@/lib/db';
import {
  blockReadiness,
  listBlocksWithStructure,
  type BlockReadiness,
  type BlockWithStructure,
} from '@/lib/dashboard/coach/blocks';
import { listTemplatesForCoach, type TemplateListRow } from '@/lib/dashboard/coach/templates';
import { listMonthTemplates } from '@/lib/dashboard/coach/program-months';
import { listMethodologyGroups } from '@/lib/dashboard/coach/methodology-groups';
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

/** Un BLOQUE: la pieza reutilizable del coach (`blocks` + `block_exercises`). */
export interface V2BloqueItem {
  id: string;
  title: string;
  description: string;
  /** Procedencia del Excel del coach ("S9 – Martes"). Desambigua títulos repetidos. */
  source_ref: string | null;
  format_label: string | null;
  modality: V2Modality;
  modality_filter: V2LibModalityFilter;
  objective: V2LibObjective | null;
  group_id: number;
  group_label: string;
  /**
   * `true` = tiene ejercicios estructurados → el atleta puede ejecutarlo y se
   * puede insertar en un día. `false` = solo prosa verbatim en `description`.
   * NO es `needs_review`: en los datos reales discrepan (hay bloques tipados
   * marcados para revisar). La señal honesta es la existencia de block_exercises.
   */
  typed: boolean;
  exercise_count: number;
  /** Cuántas piezas inserta en el día (block_position distintos). Puede ser >1. */
  part_count: number;
  /** Líneas que dicen el ejercicio pero no cuánto trabajo. 0 = listo. */
  undosed_count: number;
  /** Qué falta exactamente, en las palabras del gate. */
  undosed_reasons: string[];
  /** Estado derivado: sin_tipar › sin_dosis › listo. */
  readiness: BlockReadiness;
  needs_review: boolean;
}

/** Una SESIÓN: un entreno completo (`templates` madre + template_segments). */
export interface V2SesionItem {
  id: string;
  title: string;
  format_label: string | null;
  modality: V2Modality;
  modality_filter: V2LibModalityFilter;
  objective: V2LibObjective | null;
  group_id: number | null;
  group_label: string | null;
  /** Bloques (block_position) y ejercicios (segments) que contiene. */
  block_count: number;
  segment_count: number;
  is_draft: boolean;
  updated_at: string;
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
  bloques: V2BloqueItem[];
  sesiones: V2SesionItem[];
  microciclos: V2MicrocicloItem[];
  counts: { bloques: number; sesiones: number; microciclos: number };
}

// ── Public loader ─────────────────────────────────────────────────────────────

export async function loadBibliotecaData(params: {
  coach_id: number | bigint;
  client?: Sql;
}): Promise<V2BibliotecaData> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);

  // Cada peldaño de la escalera sale de SU tabla. `listTemplatesForCoach` ya
  // excluye los forks por atleta y los tests de calibración.
  const [blocks, templates, groups, months] = await Promise.all([
    listBlocksWithStructure(coachId, null, client),
    listTemplatesForCoach(coachId, client),
    listMethodologyGroups(client),
    listMonthTemplates({ coach_id: coachId, client }),
  ]);

  const groupLabel = new Map<number, string>(groups.map((g) => [g.id, g.name_es]));

  const bloques = blocks.map((b) => mapBloque(b, groupLabel));
  const sesiones = templates.map((t) => mapSesion(t, groupLabel));
  const microciclos = months.map(mapMicrociclo);

  return {
    bloques,
    sesiones,
    microciclos,
    counts: {
      bloques: bloques.length,
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

function mapBloque(b: BlockWithStructure, groupLabel: Map<number, string>): V2BloqueItem {
  const modality_filter = GROUP_MODALITY[b.methodology_group_id] ?? 'mixta';
  return {
    id: String(b.id),
    title: b.title,
    description: b.description,
    source_ref: b.source_ref,
    format_label: b.format ? b.format.replace(/_/g, ' ') : null,
    modality: cardModality(modality_filter, b.methodology_group_id),
    modality_filter,
    objective: GROUP_OBJECTIVE[b.methodology_group_id] ?? null,
    group_id: b.methodology_group_id,
    group_label: groupLabel.get(b.methodology_group_id) ?? `Grupo ${b.methodology_group_id}`,
    typed: b.typed,
    exercise_count: b.exercise_count,
    part_count: b.part_count,
    undosed_count: b.undosed_count,
    undosed_reasons: b.undosed_reasons,
    readiness: blockReadiness(b),
    needs_review: b.needs_review,
  };
}

/**
 * `templates.methodology_group_id` es NULLABLE (a diferencia del de `blocks`):
 * una sesión puede no estar clasificada. En ese caso no inventamos modalidad —
 * cae en el color neutro y queda fuera de los filtros de modalidad/objetivo.
 */
function mapSesion(t: TemplateListRow, groupLabel: Map<number, string>): V2SesionItem {
  const groupId = t.methodology_group_id;
  const modality_filter: V2LibModalityFilter =
    groupId == null ? 'mixta' : (GROUP_MODALITY[groupId] ?? 'mixta');
  return {
    id: t.id,
    title: t.name,
    format_label: t.format ? t.format.replace(/_/g, ' ') : null,
    modality: groupId == null ? 'calentamiento' : cardModality(modality_filter, groupId),
    modality_filter,
    objective: groupId == null ? null : (GROUP_OBJECTIVE[groupId] ?? null),
    group_id: groupId,
    group_label: groupId == null ? null : (groupLabel.get(groupId) ?? `Grupo ${groupId}`),
    block_count: t.block_count,
    segment_count: t.segment_count,
    is_draft: t.is_draft,
    updated_at: t.updated_at,
  };
}
