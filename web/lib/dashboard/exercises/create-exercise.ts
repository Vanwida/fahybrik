import { z } from 'zod';
import { exerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { youtubeUrlSchema } from '@fahybrid/shared/youtube';
import { sql } from '@/lib/db';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import { EXERCISE_SELECT_COLUMNS, modalityExpr } from '@/lib/dashboard/exercises/update-exercise';

/**
 * Create a catalog exercise the coach is missing while authoring a session.
 *
 * Scope mirrors update-exercise: the `exercises` catalog is GLOBAL (no per-coach
 * ownership column on the table), single-coach today — so any authenticated coach
 * may add to it. The new row is tagged `source = 'coach'` for honest provenance
 * (vs the seeded catalog), since the table has no `needs_review`/`coach_id`
 * columns and we add NO migration here (clean, no invented schema).
 *
 * The coach supplies NAME + CATEGORY (+ optional YouTube). `modality` is NOT a
 * free input: it is INTRINSIC and DERIVED from category(+name) by the SAME rule
 * the migration 0053 backfill and update-exercise use (modalityExpr). This keeps
 * the invariant "a line's modality follows its exercise" unbreakable — the coach
 * picks the kind of movement (category), the system owns the modality.
 */

// Category is required (drives the derived modality + the catalog ordering). The
// coach-facing chips map onto these enum values. `video_url` reuses the shared
// YouTube schema (validate + canonicalize to a watch URL, or null).
export const createExerciseSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    category: exerciseCategory,
    video_url: youtubeUrlSchema.optional(),
  })
  .strict();

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

export class ExerciseCreateError extends Error {
  constructor(
    public code: 'duplicate',
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ExerciseCreateError';
  }
}

// slug = lowercase, accents stripped, non-alphanumerics → single dash. The table
// enforces a unique slug; we suffix a short disambiguator on collision so a coach
// can add "Sentadilla búlgara" even if a near-name exists.
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base || 'ejercicio';
  // One query for all existing slugs sharing the root, then pick the first free.
  const taken = await sql<{ slug: string }[]>`
    select slug from exercises where slug = ${root} or slug like ${`${root}-%`}
  `;
  const set = new Set(taken.map((r) => r.slug));
  if (!set.has(root)) return root;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${root}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
  // Extremely unlikely fallback — guarantee uniqueness with a timestamp suffix.
  return `${root}-${Date.now()}`;
}

export async function createExercise(input: CreateExerciseInput): Promise<CatalogExercise> {
  const slug = await uniqueSlug(slugify(input.name));
  const videoUrl = input.video_url ?? null;

  // Insert with a placeholder modality, then set it from the persisted
  // category/name via the shared derivation (Postgres can't read the just-set
  // category in the same INSERT's expressions). One transaction so the row is
  // never observed with the placeholder.
  const rows = await sql.begin(async (tx) => {
    const inserted = await tx<{ id: string }[]>`
      insert into exercises (slug, name, category, video_url, source, modality)
      values (
        ${slug},
        ${input.name},
        ${input.category}::exercise_category,
        ${videoUrl},
        'coach',
        'other'
      )
      returning id::text as id
    `;
    const id = inserted[0]?.id;
    return tx<CatalogExercise[]>`
      update exercises
      set modality = ${modalityExpr()}
      where id = ${id}
      returning ${tx.unsafe(EXERCISE_SELECT_COLUMNS.join(', '))}
    `;
  });

  const row = rows[0];
  if (!row) {
    // Unique-slug was pre-resolved, so a failure here is a genuine race/duplicate.
    throw new ExerciseCreateError('duplicate', 'No se pudo crear el ejercicio', 409);
  }
  return row;
}
