// editor-types — view models for the v2 editing cluster (SCREEN 5 session editor,
// SCREEN 8 day editor, SCREEN 9 add-block modal). These are CLIENT-safe shapes
// (no server-only imports) derived from the real loaders in editor-data.ts. They
// carry the structured Prescription forward so PrescriptionFields edits the rich
// domain model, not a scalar fallback.

import type { Prescription } from '@fahybrid/shared/domain/prescription';

/** Coach-facing structural group of a block inside a session (the rail headings). */
export type StructureGroup = 'calentamiento' | 'principal' | 'vuelta';

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

/** One editable exercise/movement line inside a block. */
export interface EditorItem {
  uid: string;
  exercise_id: number | null;
  exercise_name: string;
  prescription: Prescription;
  notes?: string;
}

/** One block (container) inside a session — header + type-specific item table. */
export interface EditorBlock {
  uid: string;
  title: string;
  /** template_format-style label, e.g. 'strength_block' | 'amrap' | 'emom'. */
  format: string | null;
  /** Methodology group (1..10) when the block came from the library. */
  methodology_group_id?: number | null;
  /** Structure group the block belongs to (rail heading). */
  group: StructureGroup;
  /** Library origin, when inserted from the Biblioteca de Bloques. */
  source_block_id?: number | null;
  /** Level range + days/week tags (migration 0057). null = "any". */
  min_level_id?: number | null;
  max_level_id?: number | null;
  days_per_week?: number | null;
  items: EditorItem[];
}

/** One session in a day — AM / PM (the day editor hierarchy día › sesión). */
export interface EditorSession {
  uid: string;
  /** Coach-facing slot label: AM / PM / extra. */
  slot: 'am' | 'pm' | 'extra';
  time_hint?: string;
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

// ── SCREEN 8 · day editor view model ─────────────────────────────────────────
export interface DayEditorModel {
  month_id: string;
  month_name: string;
  /** Week within the month this day belongs to (0-based position). */
  week_index: number;
  week_name: string;
  /** Day index 1..7 (Lunes..Domingo) — the [idx] route param. */
  day_of_week: number;
  day_label: string; // "Lunes 12 · ene"
  sessions: EditorSession[];
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
}

/** Minimal exercise catalog row for the "añadir ejercicio" picker. */
export interface CatalogExerciseLite {
  id: string;
  name: string;
  category: string;
}
