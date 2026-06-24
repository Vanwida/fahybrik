// editor-serialize — the INVERSE of the loaders in editor-data.ts. Turns the
// client-side editor view models (EditorSession/EditorBlock/EditorItem) back into
// the persisted `slots_json` shapes (WeekSession/WeekDayPart/WeekDayPartItem) so
// the day editor can PERSIST for real.
//
// SINGLE SOURCE OF TRUTH: reuses the same domain types the loader consumes
// (WeekSession/WeekDayPart/WeekDayPartItem from program-templates) and the same
// prescription helpers (prescriptionToParams) the storage layer expects. No new
// shapes invented here.
//
// ROUND-TRIP FIDELITY (the whole point): the editor view model is a SUBSET of the
// persisted shape — the loader (mapPart/mapItem) only reads a handful of fields.
// The persisted part also carries config_json, coach_note, block_modifiers,
// athlete_note (block level) and day/session-level focus/notes/template_id that
// the editor never surfaces. Serializing naively from the editor model alone
// would WIPE those on every save. So every serializer takes the ORIGINAL loaded
// shape and PRESERVES the fields the editor cannot edit, matching by `uid`.
//
// Items with no exercise selected (exercise_id == null) are INCOMPLETE authoring
// lines — they are dropped, never persisted (idSchema is non-nullable, and a line
// with no exercise is not valid data).

import { prescriptionToParams } from '@fahybrid/shared/domain/prescription';
import type {
  EditorBlockInput,
  EditorItemInput,
  EditorSessionInput,
  WeekDay,
  WeekDayPart,
  WeekDayPartItem,
  WeekSession,
} from '@fahybrid/shared/schema/program-templates';

// ── Item ─────────────────────────────────────────────────────────────────────
// EditorItem → WeekDayPartItem. Keeps prescription_json as the structured source
// of truth and re-derives params_json (scalar back-compat summary) from it, the
// way the storage layer expects both to stay in sync. Preserves any non-editor
// fields (none today, but future-proof) from the original item matched by uid.
function serializeItem(
  item: EditorItemInput,
  original: WeekDayPartItem | undefined,
): WeekDayPartItem | null {
  if (item.exercise_id == null) return null; // incomplete line — drop, don't persist

  const next: WeekDayPartItem = {
    ...(original ?? ({} as WeekDayPartItem)),
    uid: item.uid,
    exercise_id: item.exercise_id,
    exercise_name: item.exercise_name,
    prescription_json: item.prescription,
    params_json: prescriptionToParams(item.prescription),
  };

  // `notes` is authoritative from input: set when present, else drop the original's
  // note so clearing a note actually persists the clear.
  if (item.notes != null && item.notes !== '') next.notes = item.notes;
  else delete next.notes;

  return next;
}

// ── Block (part) ───────────────────────────────────────────────────────────--
// EditorBlock → WeekDayPart. The editor edits title/format/methodology_group_id/
// source_block_id/items; everything else on the stored part (config_json,
// coach_note, block_modifiers, athlete_note) is preserved from the original part
// matched by uid so a day-level save never clobbers block-level config.
function serializePart(
  block: EditorBlockInput,
  original: WeekDayPart | undefined,
): WeekDayPart {
  const originalItemsByUid = new Map(
    (original?.items ?? []).map((it) => [it.uid, it]),
  );

  const items = block.items
    .map((it) => serializeItem(it, originalItemsByUid.get(it.uid)))
    .filter((it): it is WeekDayPartItem => it !== null);

  return {
    // Preserve coach_note / config_json / block_modifiers / athlete_note etc.
    ...(original ?? {}),
    uid: block.uid,
    // format must be a templateFormat enum; default to a safe value when the
    // editor block has none (a from-scratch block before a format is chosen).
    format: (block.format ?? original?.format ?? 'strength_block') as WeekDayPart['format'],
    title: block.title,
    ...(block.methodology_group_id != null
      ? { methodology_group_id: block.methodology_group_id }
      : original?.methodology_group_id != null
        ? { methodology_group_id: original.methodology_group_id }
        : {}),
    ...(block.source_block_id != null
      ? { source_block_id: block.source_block_id }
      : original?.source_block_id != null
        ? { source_block_id: original.source_block_id }
        : {}),
    items,
  };
}

// ── Session ────────────────────────────────────────────────────────────────--
// EditorSession → WeekSession. The editor's `slot` (am/pm/extra) is positional
// only — the loader derives it from array index, so it is NOT persisted (lossless
// because array order is preserved). kind/template_id/focus/notes are preserved
// from the original session matched by position.
function serializeSession(
  session: EditorSessionInput,
  original: WeekSession | undefined,
): WeekSession {
  const originalBlocksByUid = new Map(
    (original?.blocks ?? []).map((b) => [b.uid, b]),
  );

  const blocks = session.blocks.map((b) =>
    serializePart(b, originalBlocksByUid.get(b.uid)),
  );

  return {
    ...(original ?? {}),
    kind: 'workout',
    template_id: original?.template_id ?? null,
    blocks,
  };
}

// ── Day ──────────────────────────────────────────────────────────────────────
// The public entrypoint: rebuild one WeekDay from the edited sessions, preserving
// the day's day_of_week/focus/notes and per-session/per-block non-editor fields
// from the original loaded day. Sessions are matched to originals by index (the
// same positional convention the loader uses to assign am/pm/extra).
export function serializeDay(params: {
  day_of_week: number;
  sessions: EditorSessionInput[];
  original: WeekDay;
}): WeekDay {
  const { day_of_week, sessions, original } = params;

  return {
    ...original,
    day_of_week,
    sessions: sessions.map((s, i) => serializeSession(s, original.sessions[i])),
  };
}

// Replace (or insert) the given day inside a week's days[], keyed by day_of_week,
// preserving every other day untouched. Returns a new days[] (no mutation).
export function mergeDayIntoDays(
  days: WeekDay[],
  day: WeekDay,
): WeekDay[] {
  const idx = days.findIndex((d) => d.day_of_week === day.day_of_week);
  if (idx === -1) {
    return [...days, day].sort((a, b) => a.day_of_week - b.day_of_week);
  }
  const next = days.slice();
  next[idx] = day;
  return next;
}

// ── SCREEN 5 · session template (template_segments) serializer ────────────────
// SessionEditor edits a STANDALONE session template, which persists as a FLAT
// template_segments[] grouped by block_position (NOT slots_json). This is the
// inverse of getTemplateDetail's load: each EditorBlock becomes one block_position
// and each of its items becomes one segment row. Same field rules as the day
// editor: drop items with no exercise; keep prescription_json as the source of
// truth and re-derive params_json.
export interface SessionSegmentInput {
  exercise_id: number;
  exercise_name: string;
  block_position: number;
  block_format: WeekDayPart['format'] | null;
  block_title: string | null;
  params_json: Record<string, unknown>;
  notes: string | null;
  prescription_json: WeekDayPartItem['prescription_json'];
}

// Minimal structural input — the view-model fields this serializer reads. The
// strict templateFormat enum is re-validated server-side by templateUpdateSchema,
// so block_format passes through as a plain string here (no lossy client cast).
export interface SessionBlockSerInput {
  title: string;
  format: string | null;
  items: Array<{
    exercise_id: number | bigint | null;
    exercise_name: string;
    prescription: EditorItemInput['prescription'];
    notes?: string;
  }>;
}

export function serializeSessionSegments(
  blocks: SessionBlockSerInput[],
): SessionSegmentInput[] {
  const segments: SessionSegmentInput[] = [];
  blocks.forEach((block, blockPosition) => {
    for (const item of block.items) {
      if (item.exercise_id == null) continue; // incomplete line — drop
      segments.push({
        exercise_id: Number(item.exercise_id),
        exercise_name: item.exercise_name,
        block_position: blockPosition,
        block_format: (block.format ?? null) as WeekDayPart['format'] | null,
        block_title: block.title || null,
        params_json: prescriptionToParams(item.prescription),
        notes: item.notes != null && item.notes !== '' ? item.notes : null,
        prescription_json: item.prescription,
      });
    }
  });
  return segments;
}
