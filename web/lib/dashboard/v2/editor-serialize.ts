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
// The persisted part also carries config_json, block_modifiers, athlete_note
// (block level) and day-level focus/notes/template_id that the editor never
// surfaces. Serializing naively from the editor model alone would WIPE
// those on every save. So every serializer takes the ORIGINAL loaded shape and
// PRESERVES the fields the editor cannot edit, matching by `uid`. `coach_note`
// is a middle case: the editor now CARRIES it (a source can set one — the
// photo importer does, web/lib/import/build-proposal.ts) but has no UI to edit
// it, so it round-trips through the block like the others rather than being
// authored here.
//
// A3 FIX — incomplete lines are NEVER silently dropped. A line with no
// exercise (exercise_id == null) is invalid data (the DB exercise_id is non-null),
// but dropping it on save is exactly what produced the "Guardado" that lied. The
// client Save GATE (lib/dashboard/v2/item-validity) blocks the coach BEFORE this
// runs, so a valid client never reaches here with a null-id line. As a
// defense-in-depth, the serializers THROW `InvalidAuthoringLineError` if one
// slips through (a stale client, a direct API call), and the routes turn it into
// an explicit 400 — surfacing the bad line instead of fabricating a fake success.

import { prescriptionToParams, withFlatFromStructure } from '@fahybrid/shared/domain/prescription';
import { DAY_SUBSTITUTE_MAX, type DayPriority } from '@fahybrid/shared/domain/day-intent';
import type {
  EditorBlockInput,
  EditorItemInput,
  EditorSessionInput,
  RecoverySuggestion,
  WeekDay,
  WeekDayKind,
  WeekDayPart,
  WeekDayPartItem,
  WeekSession,
} from '@fahybrid/shared/schema/program-templates';
import { itemHasExercise } from '@/lib/dashboard/v2/item-validity';

/** Thrown when a save would persist a line that has no real exercise selected. */
export class InvalidAuthoringLineError extends Error {
  constructor(public count: number) {
    super(
      count === 1
        ? '1 línea sin ejercicio. Elígelo del catálogo o bórrala para guardar.'
        : `${count} líneas sin ejercicio. Elígelas del catálogo o bórralas para guardar.`,
    );
    this.name = 'InvalidAuthoringLineError';
  }
}

// ── Item ─────────────────────────────────────────────────────────────────────
// EditorItem → WeekDayPartItem. Keeps prescription_json as the structured source
// of truth and re-derives params_json (scalar back-compat summary) from it, the
// way the storage layer expects both to stay in sync. Preserves any non-editor
// fields (none today, but future-proof) from the original item matched by uid.
function serializeItem(
  item: EditorItemInput,
  original: WeekDayPartItem | undefined,
): WeekDayPartItem {
  // Caller has already filtered/validated; this is the last guard.
  const next: WeekDayPartItem = {
    ...(original ?? ({} as WeekDayPartItem)),
    uid: item.uid,
    exercise_id: item.exercise_id as number,
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
// source_block_id/coach_note/items; config_json/block_modifiers/athlete_note
// are preserved from the original part matched by uid so a day-level save
// never clobbers block-level config.
function serializePart(
  block: EditorBlockInput,
  original: WeekDayPart | undefined,
): WeekDayPart {
  const originalItemsByUid = new Map(
    (original?.items ?? []).map((it) => [it.uid, it]),
  );

  // Surface invalid lines instead of dropping them (A3). The client gate prevents
  // reaching here with one; if it does, throw so the route returns a clear error.
  const invalid = block.items.filter((it) => !itemHasExercise(it)).length;
  if (invalid > 0) throw new InvalidAuthoringLineError(invalid);

  const items = block.items.map((it) =>
    serializeItem(it, originalItemsByUid.get(it.uid)),
  );

  return {
    // Preserve coach_note / config_json / block_modifiers / athlete_note etc.
    ...(original ?? {}),
    uid: block.uid,
    // format must be a templateFormat enum; default to a safe value when the
    // editor block has none (a from-scratch block before a format is chosen).
    format: (block.format ?? original?.format ?? 'strength_block') as WeekDayPart['format'],
    title: block.title,
    // Persist the coach's structure group (calentamiento/principal/vuelta) so it
    // survives reload without depending on the title/format heuristic. Falls back
    // to the original part's group when the input omits it (non-day-editor callers).
    ...(block.group != null
      ? { group: block.group }
      : original?.group != null
        ? { group: original.group }
        : {}),
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
    // Same "input wins when sent, else keep the original" shape as the fields
    // above. No caller clears it by omission today (the day editor has no UI
    // for it yet) — that is a later decision, not this one.
    ...(block.coach_note != null
      ? { coach_note: block.coach_note }
      : original?.coach_note != null
        ? { coach_note: original.coach_note }
        : {}),
    // Circuito — misma regla que `group`/`source_block_id`/`coach_note`: input
    // manda cuando se envía, si no se preserva el original. ComponentsForm
    // siempre manda su `circuit` completo (rounds + pacing son obligatorios en
    // el schema) mientras el bloque sea Circuito, así que en la práctica esto
    // es autoritativo para ese archetype; un caller que no lo conoce (copiar
    // día, tests viejos) simplemente lo omite y el original sobrevive.
    ...(block.circuit != null
      ? { circuit: block.circuit }
      : original?.circuit != null
        ? { circuit: original.circuit }
        : {}),
    // Autoritativo desde el input, como `format`/`title` arriba: el day editor
    // SÍ tiene UI para esto (a diferencia de coach_note), así que el cliente
    // siempre manda su valor actual — incluida la vuelta a false. `?? false`
    // porque EditorBlock.optional es TS-opcional (otros constructores del tipo
    // — biblioteca, IA, quickline — no lo tocan nunca).
    optional: block.optional ?? false,
    items,
  };
}

// ── Session ────────────────────────────────────────────────────────────────--
// EditorSession → WeekSession. The editor's `slot` (am/pm/extra) is positional
// only — the loader derives it from array index, so it is NOT persisted (lossless
// because array order is preserved). kind/template_id are preserved from the
// original session matched by position. `focus` (the workout TITLE) and `notes`
// (the coach's brief for this workout) are now BOTH editable in the day editor,
// so both are taken AUTHORITATIVELY from the input: set when the coach typed one,
// cleared when they emptied it (so clearing actually persists) — the same rule
// `serializeItem` applies to a line's note. A caller that omits them therefore
// clears them; that is deliberate and identical for the two fields, and the day
// editor always sends its current value.
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

  const next: WeekSession = {
    ...(original ?? {}),
    // A session that EXISTS is a workout — deliberate REST is a DAY-level kind
    // (WeekDay.kind), not a phantom rest session. We no longer hardcode 'workout';
    // we preserve the original session's kind (faithful round-trip) and default to
    // 'workout' for a brand-new session. The day's rest is set in `serializeDay`.
    kind: original?.kind ?? 'workout',
    template_id: original?.template_id ?? null,
    blocks,
  };

  const focus = session.focus?.trim();
  if (focus) next.focus = focus;
  else delete next.focus;

  const notes = session.notes?.trim();
  if (notes) next.notes = notes;
  else delete next.notes;

  return next;
}

// ── Day ──────────────────────────────────────────────────────────────────────
// The public entrypoint: rebuild one WeekDay from the edited sessions, preserving
// the day's day_of_week/focus/notes and per-session/per-block non-editor fields
// from the original loaded day. Sessions are matched to originals by index (the
// same positional convention the loader uses to assign am/pm/extra).
export function serializeDay(params: {
  day_of_week: number;
  sessions: EditorSessionInput[];
  /**
   * Tipo del día elegido por el coach (workout | rest). Cuando es 'rest' se
   * persiste en el WeekDay (con sesiones vacías) → DESCANSO deliberado, distinto
   * de un día vacío. Opcional: los callers que no lo envían (importador, copia de
   * día) derivan el kind de la presencia de sesiones.
   */
  kind?: WeekDayKind;
  /**
   * Sugerencias de recuperación (oferta blanda) — SOLO se persisten en un día de
   * descanso. Entrada del coach: enviar una lista la fija, `[]` la limpia, omitir
   * (undefined) conserva las del día original. Se descartan si el día es de entreno.
   */
  recovery_suggestions?: RecoverySuggestion[];
  /**
   * Prioridad / sustituto del día. undefined = conserva el original;
   * null / '' = limpia; valor = fija. Solo se persisten en un día de
   * entreno (el corpus pone `-` en los descansos).
   */
  priority?: DayPriority | null;
  substitute?: string | null;
  original: WeekDay;
}): WeekDay {
  const { day_of_week, sessions, kind, recovery_suggestions, priority, substitute, original } =
    params;

  const nextSessions = sessions.map((s, i) => serializeSession(s, original.sessions[i]));

  // Day kind: la elección explícita del coach manda; si no, se DERIVA — cualquier
  // sesión ⇒ 'workout'; ninguna ⇒ se conserva el kind original (un día que sigue
  // en descanso), con fallback 'workout'.
  const resolvedKind: WeekDayKind =
    kind ?? (nextSessions.length > 0 ? 'workout' : (original.kind ?? 'workout'));

  const next: WeekDay = { ...original, day_of_week, sessions: nextSessions };
  if (resolvedKind === 'rest') {
    // Sólo persistimos 'rest' (la señal que carga la semántica); un día 'workout'
    // se deriva de sus sesiones.
    next.kind = 'rest';
    // Recuperación: oferta blanda SOLO en días de descanso. Input del coach manda
    // (lista = fija, `[]` = limpia); omitido = conserva la del día original.
    const recovery = recovery_suggestions ?? original.recovery_suggestions;
    if (recovery && recovery.length > 0) next.recovery_suggestions = recovery;
    else delete next.recovery_suggestions;
    delete next.priority;
    delete next.substitute;
  } else {
    // Día de entreno: BORRAMOS cualquier kind/recuperación obsoletos (p. ej. un día
    // que pasa de descanso a entreno) — la recuperación es un concepto solo-descanso.
    delete next.kind;
    delete next.recovery_suggestions;
    applyDayIntent(next, original, { priority, substitute });
  }
  return next;
}

function applyDayIntent(
  next: WeekDay,
  original: WeekDay,
  overrides: { priority?: DayPriority | null; substitute?: string | null },
): void {
  if (overrides.priority !== undefined) {
    if (overrides.priority == null) delete next.priority;
    else next.priority = overrides.priority;
  } else if (!original.priority) {
    delete next.priority;
  }
  if (overrides.substitute !== undefined) {
    const trimmed = overrides.substitute?.trim() ?? '';
    if (!trimmed) delete next.substitute;
    else next.substitute = trimmed.slice(0, DAY_SUBSTITUTE_MAX);
  } else if (!original.substitute) {
    delete next.substitute;
  }
}

// ── Day clone (copiar día → día) ─────────────────────────────────────────────
// DEEP-clone a fully-serialized day onto another day_of_week of the SAME week.
// PURE clone — copies every field verbatim (prescriptions, config_json,
// coach_note, exercise_id, …); it does NOT touch loads/%RM/pace (progression is
// the coach's methodology, not our tech — decision D2). Block AND item uids are
// regenerated so the cloned day never collides with the source inside the one
// week's slots_json (uids are a per-week key space). No dates are added —
// templates carry none (dates only exist on athlete assignment).
function freshUid(): string {
  // Available in both Node (≥19) and the browser; well under the 64-char cap.
  return globalThis.crypto.randomUUID();
}

export function cloneDayTo(source: WeekDay, targetDayOfWeek: number): WeekDay {
  const copy = structuredClone(source) as WeekDay;
  return {
    ...copy,
    day_of_week: targetDayOfWeek,
    sessions: (copy.sessions ?? []).map((session) => ({
      ...session,
      blocks: (session.blocks ?? []).map((block) => ({
        ...block,
        uid: freshUid(),
        items: (block.items ?? []).map((item) => ({ ...item, uid: freshUid() })),
      })),
    })),
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
// editor: lines with no exercise are NOT dropped — the client gate blocks save,
// and this throws InvalidAuthoringLineError as defense-in-depth. prescription_json
// stays the source of truth; params_json is re-derived.
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

// ── Library BLOCK serializer (block_exercises) ────────────────────────────────
// A library block is structurally a mini-session: each EditorBlock → one
// block_position; each of its items → one block_exercises row. Inverse of
// loadBlockEditorModel. Reuses SessionBlockSerInput + the A3 invalid-line guard.
// The global `position` is assigned by the DB layer (createBlock) as the array
// index, so it is not part of this shape.
export interface BlockExerciseWriteInput {
  exercise_id: number;
  block_position: number;
  block_format: string | null;
  block_title: string | null;
  prescription_json: EditorItemInput['prescription'];
  notes: string | null;
}

export function serializeBlockExercises(
  blocks: SessionBlockSerInput[],
): BlockExerciseWriteInput[] {
  const invalid = blocks.reduce(
    (n, b) => n + b.items.filter((it) => !itemHasExercise(it)).length,
    0,
  );
  if (invalid > 0) throw new InvalidAuthoringLineError(invalid);

  const out: BlockExerciseWriteInput[] = [];
  blocks.forEach((block, blockPosition) => {
    for (const item of block.items) {
      out.push({
        exercise_id: Number(item.exercise_id),
        block_position: blockPosition,
        block_format: block.format ?? null,
        block_title: block.title || null,
        // structure is ADDITIVE on the wire: derive the flat dose when missing
        prescription_json: withFlatFromStructure(item.prescription),
        notes: item.notes != null && item.notes !== '' ? item.notes : null,
      });
    }
  });
  return out;
}

export function serializeSessionSegments(
  blocks: SessionBlockSerInput[],
): SessionSegmentInput[] {
  // Surface invalid lines instead of dropping them (A3).
  const invalid = blocks.reduce(
    (n, b) => n + b.items.filter((it) => !itemHasExercise(it)).length,
    0,
  );
  if (invalid > 0) throw new InvalidAuthoringLineError(invalid);

  const segments: SessionSegmentInput[] = [];
  blocks.forEach((block, blockPosition) => {
    for (const item of block.items) {
      // structure is ADDITIVE on the wire: derive the flat dose when missing,
      // so params_json and every summary surface keep speaking
      const prescription = withFlatFromStructure(item.prescription);
      segments.push({
        exercise_id: Number(item.exercise_id),
        exercise_name: item.exercise_name,
        block_position: blockPosition,
        block_format: (block.format ?? null) as WeekDayPart['format'] | null,
        block_title: block.title || null,
        params_json: prescriptionToParams(prescription),
        notes: item.notes != null && item.notes !== '' ? item.notes : null,
        prescription_json: prescription,
      });
    }
  });
  return segments;
}
