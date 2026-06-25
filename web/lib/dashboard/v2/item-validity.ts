// item-validity — the SINGLE SOURCE OF TRUTH for "is an authoring line valid?".
//
// This is the rule that kills A3 (the silent data loss). The original sin: the
// editor seeded each line with `exercise_id: null` (free-text name), and the
// serializer DROPPED any null-id line on save — so a coach built a strength /
// series / Z2 / WOD session, hit Guardar, saw green "Guardado", and the session
// persisted with ZERO exercises. The fix is not "drop more gracefully": it is to
// STOP the coach BEFORE save with an honest, in-place flag, and never fabricate
// a "Guardado".
//
// An authoring line is valid ⇔ it points at a REAL catalog exercise (a non-null,
// positive `exercise_id`). The Prescription is already a typed, Zod-validated
// domain object the form keeps valid by construction — the only thing the editor
// could leave incomplete is the exercise link itself. Both the client Save gate
// and the server mutation use THIS rule (no two definitions of "valid").
//
// AGNOSTIC: this knows nothing of methodology / level / phase. It is pure data
// integrity on the line's exercise link.

/** True when a line points at a real catalog exercise (the persistable spine). */
export function itemHasExercise(item: { exercise_id: number | bigint | null }): boolean {
  const id = item.exercise_id;
  if (id == null) return false;
  return Number(id) > 0;
}

/** Count the invalid (exercise-less) lines across a set of blocks. */
export function countInvalidItems(
  blocks: Array<{ items: Array<{ exercise_id: number | bigint | null }> }>,
): number {
  let n = 0;
  for (const block of blocks) {
    for (const item of block.items) {
      if (!itemHasExercise(item)) n += 1;
    }
  }
  return n;
}

/** Total authoring lines across blocks (for an honest "N ejercicios" readout). */
export function countItems(
  blocks: Array<{ items: Array<unknown> }>,
): number {
  return blocks.reduce((acc, b) => acc + b.items.length, 0);
}

/**
 * The honest save-gate verdict for a piece of content (a session = its blocks,
 * a day = all sessions' blocks). `ok` is false when any line lacks an exercise;
 * `reason` is the exact coach-facing message (never a fake success).
 */
export interface SaveGate {
  ok: boolean;
  invalidCount: number;
  /** Coach-facing reason when blocked, else null. */
  reason: string | null;
}

export function saveGateFor(
  blocks: Array<{ items: Array<{ exercise_id: number | bigint | null }> }>,
): SaveGate {
  const invalidCount = countInvalidItems(blocks);
  if (invalidCount === 0) return { ok: true, invalidCount: 0, reason: null };
  const line = invalidCount === 1 ? 'línea sin ejercicio' : 'líneas sin ejercicio';
  return {
    ok: false,
    invalidCount,
    reason: `${invalidCount} ${line}. Elígelo del catálogo o bórrala para guardar.`,
  };
}
