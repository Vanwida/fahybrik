import { z } from 'zod';
import { exerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { youtubeUrlSchema } from '@fahybrid/shared/youtube';
import { sql } from '@/lib/db';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';

/**
 * Catalog editing scope — GLOBAL, not per-coach.
 *
 * The `exercises` table is a shared catalog (no `coach_id` column). FAHYBRIK is
 * single-coach (Pablo), so any authenticated coach is allowed to edit the
 * catalog. If the product ever goes multi-coach, this becomes per-coach copies
 * or an `owner_coach_id` + visibility model — but that's out of scope today.
 */

const trimmedText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .transform((v) => (v === '' ? null : v));

/**
 * Partial update body. Every field is optional; only the keys present in the
 * request are written. `name` cannot be cleared (1..120). `description` / `cues`
 * accept multi-line text and normalize empty → null. `video_url` is validated
 * and canonicalized to a watch URL (or null) by the shared YouTube schema.
 */
export const updateExerciseSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: trimmedText(2000).nullable(),
    cues: trimmedText(2000).nullable(),
    video_url: youtubeUrlSchema,
    category: exerciseCategory,
    primary_muscle_groups: z.array(z.string().trim().min(1).max(60)).max(20),
    equipment: z.array(z.string().trim().min(1).max(60)).max(20),
  })
  .partial()
  .strict();

export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

export class ExerciseUpdateError extends Error {
  constructor(
    public code: 'not_found' | 'no_fields',
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ExerciseUpdateError';
  }
}

const SELECT_COLUMNS = [
  'id::text as id',
  'slug',
  'name',
  'category::text as category',
  'primary_muscle_groups',
  'equipment',
  'default_metrics_json',
  'hyrox_station_position',
  'description',
  'cues',
  'video_url',
] as const;

/**
 * Apply a partial update to a catalog exercise and return the fresh row.
 * Builds the SET clause only from the fields actually supplied so untouched
 * columns are never overwritten. Throws ExerciseUpdateError on no-op / 404.
 */
export async function updateExercise(
  id: bigint,
  patch: UpdateExerciseInput,
): Promise<CatalogExercise> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    throw new ExerciseUpdateError('no_fields', 'No hay campos para actualizar', 400);
  }

  // Build one parameterized assignment fragment per supplied field, then join
  // with commas. `category` needs an explicit enum cast; the rest bind directly.
  const assignments = entries.map(([key, value]) =>
    key === 'category'
      ? sql`category = ${value as string}::exercise_category`
      : sql`${sql(key)} = ${value as never}`,
  );

  const setClause = assignments.reduce((acc, frag) => sql`${acc}, ${frag}`);

  const rows = await sql<CatalogExercise[]>`
    update exercises
    set ${setClause}, updated_at = now()
    where id = ${id}
    returning ${sql.unsafe(SELECT_COLUMNS.join(', '))}
  `;

  const row = rows[0];
  if (!row) {
    throw new ExerciseUpdateError('not_found', 'Ejercicio no encontrado', 404);
  }
  return row;
}
