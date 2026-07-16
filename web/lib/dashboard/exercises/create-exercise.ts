import { z } from 'zod';
import { exerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { youtubeUrlSchema } from '@fahybrid/shared/youtube';
import { sql } from '@/lib/db';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import { EXERCISE_SELECT_COLUMNS, modalityExpr } from '@/lib/dashboard/exercises/update-exercise';

/**
 * Create an exercise the coach is missing — from the picker while authoring, or
 * from the Biblioteca catalog screen.
 *
 * The new row is the coach's OWN (`coach_id = <coach>`, migration 0132): it is
 * theirs to edit whole, and NO other coach ever sees it. It is NOT an addition to
 * the BASE catalog — that's our product, and one coach's movement is not part of
 * it. `source = 'coach'` stays for honest provenance alongside the seeded rows.
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
// The slug namespace stays GLOBAL (see migration 0132): it is the machine
// contract of the BASE catalog — station-detail, calibration-content,
// create-free-workout and intake all resolve `where slug = X` with `limit 1` and
// no tiebreak. Scanning every coach's slugs here (not just the caller's) keeps a
// collision IMPOSSIBLE rather than merely survivable, so those readers stay
// deterministic. A coach's own exercise silently takes `sled-push-2` — invisible,
// since nothing resolves a coach exercise by slug (the importer matches it by
// NAME in its layer 3).
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

export async function createExercise(
  input: CreateExerciseInput,
  coachId: bigint,
): Promise<CatalogExercise> {
  const slug = await uniqueSlug(slugify(input.name));
  const videoUrl = input.video_url ?? null;

  // Insert with a placeholder modality, then set it from the persisted
  // category/name via the shared derivation (Postgres can't read the just-set
  // category in the same INSERT's expressions). One transaction so the row is
  // never observed with the placeholder.
  const rows = await sql.begin(async (tx) => {
    const inserted = await tx<{ id: string }[]>`
      insert into exercises (slug, name, category, video_url, source, modality, coach_id)
      values (
        ${slug},
        ${input.name},
        ${input.category}::exercise_category,
        ${videoUrl},
        'coach',
        'other',
        ${coachId}
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
