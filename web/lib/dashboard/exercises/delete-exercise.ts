import { sql, type Sql } from '@/lib/db';

/**
 * Delete an exercise the coach OWNS — the undo for "lo creé sin querer".
 *
 * WHY THIS NEEDS A GUARD AT ALL. Three things reference `exercises`, and they fail
 * in three different ways (verified against prod, not assumed):
 *   • `template_segments`  → ON DELETE RESTRICT   — Postgres blocks it, raw 23503.
 *   • `block_exercises`    → ON DELETE RESTRICT   — same.
 *   • `segment_executions` → ON DELETE SET NULL   — **no error at all**. The delete
 *     succeeds and silently strips the exercise off work an athlete already did.
 *     That's the dangerous one: the RESTRICTs at least shout.
 *
 * So the rule is not "delete unless Postgres complains" — Postgres doesn't complain
 * about the case that loses data. The rule is: **an exercise that has been USED is
 * not deleted, it's part of the record.** Only one that never made it into a
 * session, a block or a workout can be removed, and then it's not history, it's a
 * typo.
 *
 * The counts drive an honest message. The RESTRICT FKs stay as the backstop for the
 * race (a segment added between the count and the delete): we translate 23503 into
 * the same honest refusal instead of a 500.
 *
 * A BASE exercise is never deletable by anyone — it's our product, not the coach's
 * to remove. Another coach's exercise is a 404, same as not existing. Both decided
 * by the caller via `loadExerciseScope`.
 *
 * `coach_exercise_synonyms` cascade: the coach's own aliases for the exercise die
 * with it, which is right — they only ever meant this row.
 */

export class ExerciseDeleteError extends Error {
  constructor(
    public code: 'in_use' | 'not_found',
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ExerciseDeleteError';
  }
}

/** Where an exercise is used. Zero everywhere = safe to delete. */
export interface ExerciseUsage {
  templates: number;
  blocks: number;
  executions: number;
}

export async function loadExerciseUsage(
  client: Sql,
  exerciseId: bigint,
): Promise<ExerciseUsage> {
  const rows = await client<{ templates: string; blocks: string; executions: string }[]>`
    select
      (select count(*) from template_segments  where exercise_id = ${exerciseId}) as templates,
      (select count(*) from block_exercises    where exercise_id = ${exerciseId}) as blocks,
      (select count(*) from segment_executions where exercise_id = ${exerciseId}) as executions
  `;
  const r = rows[0];
  return {
    templates: Number(r?.templates ?? 0),
    blocks: Number(r?.blocks ?? 0),
    executions: Number(r?.executions ?? 0),
  };
}

/** Pluralize the Spanish count so the refusal reads like a person wrote it. */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The refusal, in the coach's words: name WHERE it's used, so they know what to do
 * next instead of being told "no".
 */
export function usageRefusal(usage: ExerciseUsage): string {
  const places: string[] = [];
  if (usage.templates > 0) places.push(count(usage.templates, 'sesión', 'sesiones'));
  if (usage.blocks > 0) places.push(count(usage.blocks, 'bloque', 'bloques'));

  if (places.length > 0) {
    const list = places.length === 1 ? places[0] : places.join(' y ');
    const tail = usage.executions > 0 ? ' Además, tus atletas ya lo han entrenado.' : '';
    return `Lo estás usando en ${list}, así que no se puede borrar. Quítalo de ahí primero y vuelve.${tail}`;
  }
  // Only executions: nothing to "remove it from" — the work already happened.
  return 'Tus atletas ya lo han entrenado, así que no se borra: perderías ese historial.';
}

/**
 * Delete the coach's OWN exercise. Throws `in_use` (409) when it's referenced
 * anywhere, `not_found` (404) when it doesn't exist or isn't theirs — the guard is
 * the WHERE clause, so there's no TOCTOU window on ownership.
 */
export async function deleteExercise(
  id: bigint,
  coachId: bigint,
  client: Sql = sql,
): Promise<void> {
  const usage = await loadExerciseUsage(client, id);
  if (usage.templates > 0 || usage.blocks > 0 || usage.executions > 0) {
    throw new ExerciseDeleteError('in_use', usageRefusal(usage), 409);
  }

  try {
    const deleted = await client<{ id: string }[]>`
      delete from exercises
      where id = ${id} and coach_id = ${coachId}
      returning id::text as id
    `;
    if (deleted.length === 0) {
      throw new ExerciseDeleteError('not_found', 'Ejercicio no encontrado', 404);
    }
  } catch (err) {
    if (err instanceof ExerciseDeleteError) throw err;
    // 23503 = foreign_key_violation. The RESTRICT FKs firing here means something
    // referenced it between the count and the delete. Same honest answer as above,
    // never a 500 — re-read the usage so the message names the real place.
    if ((err as { code?: string }).code === '23503') {
      throw new ExerciseDeleteError('in_use', usageRefusal(await loadExerciseUsage(client, id)), 409);
    }
    throw err;
  }
}
