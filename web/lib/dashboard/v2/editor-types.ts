// editor-types — view models for the v2 editing cluster (SCREEN 5 session editor,
// SCREEN 8 day editor, SCREEN 9 add-block modal). These are CLIENT-safe shapes
// (no server-only imports) derived from the real loaders in editor-data.ts. They
// carry the structured Prescription forward so PrescriptionFields edits the rich
// domain model, not a scalar fallback.

import type { Modality, Prescription } from '@fahybrid/shared/domain/prescription';
import {
  recoveryActivitySchema,
  type CircuitConfig,
  type RecoveryActivity,
  type RecoverySuggestion,
  type StructureGroup,
  type WeekDayKind,
} from '@fahybrid/shared/schema/program-templates';
import type { DayModalityInfo } from '@/lib/dashboard/v2/planes-model';

/**
 * Coach-facing structural group of a block inside a session (the rail headings).
 * Single source of truth = the shared schema (persisted in slots_json); re-exported
 * here so the existing editor importers keep resolving it from editor-types.
 */
export type { StructureGroup };

export const STRUCTURE_GROUP_LABEL: Record<StructureGroup, string> = {
  calentamiento: 'Calentamiento',
  principal: 'Principal',
  vuelta: 'Vuelta a la calma',
};

export const STRUCTURE_GROUP_ORDER: StructureGroup[] = [
  'calentamiento',
  'principal',
  'vuelta',
];

/**
 * Recovery-activity vocabulary for the rest-day editor (#47). ORDER is the shared
 * schema's enum order (single source); LABEL is the coach/athlete-facing Spanish
 * name per activity. Recovery is a SOFT offer — not a session, no intensity.
 */
export const RECOVERY_ACTIVITY_ORDER: readonly RecoveryActivity[] = recoveryActivitySchema.options;

export const RECOVERY_ACTIVITY_LABEL: Record<RecoveryActivity, string> = {
  mobility: 'Movilidad',
  stretching: 'Estiramientos',
  yoga: 'Yoga',
  walk: 'Caminar',
  easy_run: 'Trote suave',
  easy_ride: 'Bici suave',
  easy_swim: 'Nado suave',
  foam_roll: 'Foam roller',
  massage: 'Masaje',
  breathing: 'Respiración',
  sauna: 'Sauna',
  cold_therapy: 'Frío / contraste',
  other: 'Otra',
};

/** One editable exercise/movement line inside a block. */
export interface EditorItem {
  uid: string;
  exercise_id: number | null;
  exercise_name: string;
  /**
   * Modalidad INTRÍNSECA del ejercicio (`exercises.modality`, 0053). La pide el
   * gate de prescripción, que avisa explícitamente de NO usar
   * `prescription.modality`: esa es una pista que quien escribió la prescripción
   * pudo omitir. Sin esto, el editor y la Biblioteca juzgarían la misma línea con
   * datos distintos y podrían contradecirse.
   *
   * Opcional: la rellenan los loaders que la tienen (bloque y sesión). Ausente →
   * el gate cae a la modalidad de la prescripción, como antes.
   */
  exercise_modality?: Modality | null;
  prescription: Prescription;
  notes?: string;
}

/** One block (container) inside a session — header + type-specific item table. */
export interface EditorBlock {
  uid: string;
  title: string;
  /** template_format-style label, e.g. 'strength_block' | 'amrap' | 'emom'. */
  format: string | null;
  /**
   * Archetype the block was created from (UX pase — archetype-first editor).
   * CLIENT-ONLY: drives which tailored form renders; it is NOT persisted (the
   * serializer reads only the known WeekDayPart fields). On reload a block's
   * pattern is re-derived from its `format` + items, so nothing is lost.
   */
  archetype_id?: import('@/lib/dashboard/v2/archetypes').ArchetypeId;
  /** Methodology group (1..10) when the block came from the library. */
  methodology_group_id?: number | null;
  /**
   * DEPRECATED for the microciclo day editor. The agnostic model is a FLAT list of
   * blocks the coach names and orders — NOT the imposed Calentamiento/Principal/
   * Vuelta sections. `group` no longer drives the day editor's render and is not
   * persisted from it. It stays OPTIONAL because the session LIBRARY editor
   * (`SessionStructureRail`) and the Excel importer still section by it, and the
   * server loaders infer it for those surfaces. Absent = agnostic (the default).
   */
  group?: StructureGroup;
  /** Library origin, when inserted from the Biblioteca de Bloques. */
  source_block_id?: number | null;
  /**
   * Título del bloque de origen, para poder DECIRLE al coach de dónde salió esto
   * ("Desde tu bloque «X»"). Es PROCEDENCIA, no un vínculo vivo: insertar COPIA
   * la estructura y editar el bloque en la Biblioteca no cambia esta semana.
   *
   * DERIVADO, nunca se persiste: el serializador solo escribe los campos conocidos
   * de WeekDayPart, y al recargar lo resuelve el loader desde `source_block_id`.
   * `null` = el bloque de origen ya no existe (o no es de este coach) → no se
   * pinta nada, que es lo honesto: la referencia es del pasado, no una promesa.
   */
  source_block_title?: string | null;
  /**
   * Texto verbatim que no encaja en la estructura del bloque — la prescripción
   * en prosa de un bloque de biblioteca, o (import por foto) el texto de una
   * tarjeta que la gramática no pudo tipar como ejercicio ni como dosis huérfana
   * (ver web/lib/import/build-proposal.ts). Misma semántica que
   * WeekDayPart.coach_note (shared/schema/program-templates.ts); el day editor
   * hoy no tiene UI para editarlo, así que se preserva pero no se muestra.
   */
  coach_note?: string;
  /**
   * El bloque es un extra que el atleta puede saltarse (fase 2, ago-2026).
   * Ausente/false = obligatorio, el comportamiento de siempre. Solo el day
   * editor lo persiste; el resto de constructores de EditorBlock (biblioteca,
   * IA, hyrox-template, quickline…) no lo tocan y queda implícitamente false.
   */
  optional?: boolean;
  /**
   * Circuito (docs/DECISIONS.md, 2026-08-07): rondas + pacing (por_tarea sin
   * reloj | por_reloj con work_seconds) + descansos entre estaciones/rondas, a
   * nivel de BLOQUE — no duplicado en cada estación (el bug real de `applyHead`
   * que este campo reemplaza en ComponentsForm). Solo lo rellena el bloque
   * Circuito/Core (`format === 'circuit'`); ausente = comportamiento legacy
   * (estaciones sueltas sin rounds/pacing de bloque), incluido en cualquier
   * otro archetype/formato del patrón `components`.
   */
  circuit?: CircuitConfig;
  items: EditorItem[];
}

/** One session in a day — AM / PM (the day editor hierarchy día › sesión). */
export interface EditorSession {
  uid: string;
  /** Coach-facing slot label: AM / PM / extra. */
  slot: 'am' | 'pm' | 'extra';
  time_hint?: string;
  /**
   * Workout TITLE (`WeekSession.focus`): a short name for this session the coach
   * types and the athlete reads at a glance ("Entreno de pierna", "Series").
   * Editable in the day editor; empty/undefined = untitled.
   */
  focus?: string;
  /**
   * NOTA del entreno (`WeekSession.notes`): lo que el coach le dice al atleta
   * sobre ESTA sesión ("hoy vamos a por el ritmo, no te pases en la primera
   * serie"). Editable en el editor de día; al materializar viaja a
   * `templates.coach_notes` y el atleta la lee en el brief previo del móvil.
   * Vacía/undefined = sin nota.
   */
  notes?: string;
  blocks: EditorBlock[];
}

// ── SCREEN 5 · session editor view model ─────────────────────────────────────
export interface SessionEditorModel {
  template_id: string | null; // null = /nueva (unsaved)
  name: string;
  format: string;
  is_draft: boolean;
  blocks: EditorBlock[];
  used_in_plans: number;
}

// ── Library BLOCK editor view model ───────────────────────────────────────────
// A library block is a mini-session: metadata + EditorBlock[] (one per
// block_position). Reuses the same EditorBlock/EditorItem the session editor edits.
export interface BlockEditorModel {
  block_id: number | null; // null = nuevo (unsaved)
  title: string;
  description: string;
  methodology_group_id: number;
  format: string | null;
  blocks: EditorBlock[];
}

// ── SCREEN 8 · day editor view model ─────────────────────────────────────────
export interface DayEditorModel {
  month_id: string;
  month_name: string;
  /** program_week_templates.id this day lives in — the PUT/save target. */
  week_id: string;
  /** Week within the month this day belongs to (0-based position). */
  week_index: number;
  week_name: string;
  /** Day index 1..7 (Lunes..Domingo) — the [idx] route param. */
  day_of_week: number;
  day_label: string; // "Lunes 12 · ene"
  /**
   * Tipo del día enfocado (workout | rest). 'rest' cuando el coach lo marcó como
   * DESCANSO deliberado; un día vacío sin marcar carga como 'workout' (modo
   * autoría). El toggle de descanso del editor lee/escribe este campo. Extensible
   * a 'test'|'competition' (no implementado).
   */
  kind: WeekDayKind;
  /**
   * Sugerencias de RECUPERACIÓN (oferta blanda) cuando el día es de descanso.
   * Vacío en días de entreno. El editor las muestra/edita en un día kind='rest'
   * y las reenvía en el save (dayEditorSaveSchema.recovery_suggestions).
   */
  recovery_suggestions: RecoverySuggestion[];
  sessions: EditorSession[];
  /**
   * The WHOLE focused week's 7 days (Mon→Sun) summarised for the WEEK CONTEXT
   * strip above the editor — the coach edits one day while seeing the other six.
   * Reuses the same derivation as the microcycle screen (deriveWeekModalities):
   * per-day modalities + dominant + honest block/item counts + rest/empty flags.
   * No invented metrics; an empty day is empty, a rest day is rest.
   */
  week_days: DayModalityInfo[];
  /**
   * Flat 0-based day index of THIS week's Monday across the month, so the strip
   * can build the in-place canvas href for each cell: `/microciclos/{month}?dia={base + i}`.
   */
  week_day_base: number;
  /**
   * ALL the weeks of the microciclo (incl. the current one), summarised, so
   * "Copiar día a…" can target ANOTHER week (cross-week) and show each candidate
   * day's honest content state. Same DayModalityInfo derivation as week_days.
   */
  weeks: DayEditorWeekRef[];
}

export interface DayEditorWeekRef {
  /** program_week_templates.id — the cross-week copy target. */
  id: string;
  /** 0-based position within the microciclo. */
  week_index: number;
  name: string;
  /** Always 7 entries, Mon→Sun, for content-state display. */
  days: DayModalityInfo[];
}

// ── Library rail / add-block result rows (SCREEN 8 rail + SCREEN 9 modal) ─────
export interface LibrarySessionRow {
  id: string;
  name: string;
  format: string;
  block_count: number;
  segment_count: number;
}

export interface LibraryBlockRow {
  id: number;
  title: string;
  format: string | null;
  methodology_group_id: number | null;
  /** Modality color slug for the left-border (carrera/ergo/fuerza/circuito/…). */
  modality_slug: string;
  usage_count: number;
  /**
   * De dónde salió el bloque en el plan del coach ("S9 – Martes"). Es lo que
   * DISTINGUE los títulos repetidos: el título importado es solo el primer
   * fragmento del entreno ("10' row z2" cuando en realidad es row + ski + bike +
   * run), así que 4 títulos se repiten entre 9 bloques. null si no vino de un import.
   */
  source_ref: string | null;
  /**
   * Tiene `block_exercises` → el atleta puede ejecutarlo → se puede insertar en un
   * día. Un bloque sin tipar solo tiene la prosa verbatim del coach en
   * `description`: se muestra, pero insertarlo la perdería (ver
   * `isInsertableBlockModel`). NO es `needs_review`: en los datos reales discrepan.
   */
  typed: boolean;
  /** Cuántas piezas (EditorBlock) añade al día: `block_position` distintos. 0 sin tipar. */
  part_count: number;
}

/** Minimal exercise catalog row for the "añadir ejercicio" picker. */
export interface CatalogExerciseLite {
  id: string;
  name: string;
  category: string;
}
