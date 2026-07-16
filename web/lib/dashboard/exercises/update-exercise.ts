import { z } from 'zod';
import { exerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { modalitySchema } from '@fahybrid/shared/domain/prescription';
import { youtubeUrlSchema } from '@fahybrid/shared/youtube';
import { sql, type Sql } from '@/lib/db';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';

/**
 * DIRECT edit of an exercise the coach OWNS (`exercises.coach_id = <coach>`).
 *
 * This is one of the two write paths, and the narrow one. Since migration 0132 a
 * coach may only mutate the `exercises` row of an exercise THEY created — there
 * the whole row is theirs, identity included. Editing a BASE exercise never comes
 * through here: its forkable fields go to the coach's override
 * (`upsertCoachExerciseOverride`) and its shared identity is refused. The router
 * that picks between the two lives in the PATCH route, keyed on
 * `loadExerciseScope`.
 *
 * The ownership guard is in the WHERE clause, not a prior check: a base row or
 * another coach's row simply matches nothing → 404. No TOCTOU window.
 */

const trimmedText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .transform((v) => (v === '' ? null : v));

/**
 * Partial update body. Every field is optional; only the keys present in the
 * request are written. `description` / `cues` accept multi-line text and
 * normalize empty → null. `video_url` is validated and canonicalized to a watch
 * URL (or null) by the shared YouTube schema.
 *
 * `name` normalizes empty → null like the other three FORKABLE fields, and that
 * symmetry is the point: on a BASE exercise, clearing a field clears the coach's
 * override so the base value is inherited again. A fork you can't undo is a trap,
 * so "" on `name` is how a coach takes back their rename.
 *
 * The two paths then read that null differently, which is why the meaning can't
 * live in the schema alone:
 *   • BASE → null clears the name override (inherit the base name).
 *   • OWN  → null is REFUSED by `updateExercise`: `exercises.name` is NOT NULL and
 *     an own exercise has no base name to fall back to. It would be nameless.
 */
export const updateExerciseSchema = z
  .object({
    // NOTE: `name` is nullable-by-transform, NOT `.nullable()`. `''` → null is the
    // supported way to clear the override; a LITERAL `null` in the body is rejected
    // by the schema. The UI sends `''`. Stated here because the difference is
    // invisible at the call site and has already confused one caller.
    name: trimmedText(120),
    description: trimmedText(2000).nullable(),
    cues: trimmedText(2000).nullable(),
    video_url: youtubeUrlSchema,
    category: exerciseCategory,
    // Declared, never derived — see `createExercise`. On a BASE exercise this is
    // shared identity and the route refuses it (409); on the coach's OWN exercise
    // it's theirs to set.
    modality: modalitySchema,
    primary_muscle_groups: z.array(z.string().trim().min(1).max(60)).max(20),
    equipment: z.array(z.string().trim().min(1).max(60)).max(20),
  })
  .partial()
  .strict();

export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

export class ExerciseUpdateError extends Error {
  constructor(
    public code: 'not_found' | 'no_fields' | 'invalid_name',
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ExerciseUpdateError';
  }
}

export const EXERCISE_SELECT_COLUMNS = [
  'id::text as id',
  'slug',
  'name',
  'category::text as category',
  'modality',
  'primary_muscle_groups',
  'equipment',
  'default_metrics_json',
  'hyrox_station_position',
  'description',
  'cues',
  'video_url',
] as const;

/**
 * Apply a partial update to an exercise the coach OWNS, and return the fresh row.
 * Builds the SET clause only from the fields actually supplied so untouched
 * columns are never overwritten. Throws ExerciseUpdateError on no-op / 404 —
 * where 404 also covers "exists but isn't yours" (the guard is in the WHERE).
 *
 * `client` defaults to the app's pool. It's injectable so the real-DB suite can
 * point the writer at its throwaway Neon branch — the ownership guard below is
 * an IDOR fix and has to be provable against a real database, not a mock (project
 * rule: never mock the DB).
 */
export async function updateExercise(
  id: bigint,
  patch: UpdateExerciseInput,
  coachId: bigint,
  client: Sql = sql,
): Promise<CatalogExercise> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    throw new ExerciseUpdateError('no_fields', 'No hay campos para actualizar', 400);
  }

  // `exercises.name` is NOT NULL, and an OWN exercise has no base name to fall
  // back to — clearing it would leave it nameless. (On a BASE exercise null is
  // legitimate and never reaches here: it clears the coach's name override.)
  // Enforced by the writer, not the caller, so no future path can slip a
  // nameless row past the schema.
  if (patch.name === null) {
    throw new ExerciseUpdateError('invalid_name', 'Tu ejercicio necesita un nombre.', 400);
  }

  // Build one parameterized assignment fragment per supplied field, then join
  // with commas. `category` needs an explicit enum cast; the rest bind directly.
  const assignments = entries.map(([key, value]) =>
    key === 'category'
      ? client`category = ${value as string}::exercise_category`
      : client`${client(key)} = ${value as never}`,
  );

  const setClause = assignments.reduce((acc, frag) => client`${acc}, ${frag}`);

  // ONE statement. This used to chain a second UPDATE that re-derived `modality`
  // from the new name/category — which meant a coach renaming their own "Row Erg"
  // to "Remo" silently flipped it to `other` and broke their analytics. The coach
  // declares the modality now, so there is nothing to recompute and no transaction
  // to hold.
  const rows = await client<CatalogExercise[]>`
    update exercises
    set ${setClause}, updated_at = now()
    where id = ${id} and coach_id = ${coachId}
    returning ${client.unsafe(EXERCISE_SELECT_COLUMNS.join(', '))}
  `;

  const row = rows[0];
  if (!row) {
    throw new ExerciseUpdateError('not_found', 'Ejercicio no encontrado', 404);
  }
  return row;
}
