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

// Modality is INTRINSIC and DERIVED from category(+name) — migration 0053. When a
// coach edits category or name (or CREATES an exercise), modality must be computed
// with the SAME deterministic rule the migration used, so it never drifts out of
// sync. Kept as one SQL expression here (single source of truth alongside the
// migration + the create handler). It references the row's category/name columns,
// so on UPDATE it must be applied AFTER the user-supplied SET fragments.
export function modalityExpr(): ReturnType<typeof sql> {
  return sql`
    case
      when category = 'strength'   then 'strength'
      when category = 'core'       then 'core'
      when category = 'mobility'   then 'mobility'
      when category = 'plyometric' then 'functional'
      when category = 'skill'      then 'functional'
      when category = 'cardio' then
        case
          when lower(name) like '%ski%' then 'ski'
          when lower(name) like '%row%' then 'row'
          when lower(name) like '%bike%' or lower(name) like '%assault%'
            or lower(name) like '%echo%' or lower(name) like '%cycl%' then 'bike'
          when lower(name) like '%run%' or lower(name) like '%treadmill%'
            or lower(name) like '%jog%' then 'run'
          else 'other'
        end
      when category = 'hyrox_station' then
        case
          when lower(name) like '%ski%' then 'ski'
          when lower(name) like '%row%' then 'row'
          when lower(name) like '%run%' then 'run'
          else 'functional'
        end
      else 'other'
    end`;
}

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

  // If category or name changed, modality must be recomputed from the NEW row.
  // Postgres evaluates every SET RHS against the OLD row, so the recompute can't
  // read the just-set values in the same statement. We chain a second UPDATE that
  // reads the now-persisted category/name. Done inside one transaction so the row
  // is never observed mid-update.
  const recomputesModality = patch.category !== undefined || patch.name !== undefined;

  const rows = await sql.begin(async (tx) => {
    const updated = await tx<CatalogExercise[]>`
      update exercises
      set ${setClause}, updated_at = now()
      where id = ${id}
      returning ${tx.unsafe(EXERCISE_SELECT_COLUMNS.join(', '))}
    `;
    if (updated.length === 0 || !recomputesModality) return updated;
    return tx<CatalogExercise[]>`
      update exercises
      set modality = ${modalityExpr()}
      where id = ${id}
      returning ${tx.unsafe(EXERCISE_SELECT_COLUMNS.join(', '))}
    `;
  });

  const row = rows[0];
  if (!row) {
    throw new ExerciseUpdateError('not_found', 'Ejercicio no encontrado', 404);
  }
  return row;
}
