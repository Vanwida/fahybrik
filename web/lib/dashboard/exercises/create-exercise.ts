import { z } from 'zod';
import { exerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { modalitySchema } from '@fahybrid/shared/domain/prescription';
import { youtubeUrlSchema } from '@fahybrid/shared/youtube';
import { sql, type Sql, type TransactionClient } from '@/lib/db';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import { EXERCISE_SELECT_COLUMNS } from '@/lib/dashboard/exercises/update-exercise';

/**
 * Create an exercise the coach is missing — from the picker while authoring, or
 * from the Biblioteca catalog screen.
 *
 * The new row is the coach's OWN (`coach_id = <coach>`, migration 0132): it is
 * theirs to edit whole, and NO other coach ever sees it. It is NOT an addition to
 * the BASE catalog — that's our product, and one coach's movement is not part of
 * it. `source = 'coach'` stays for honest provenance alongside the seeded rows.
 *
 * MODALITY IS DECLARED, NOT ADIVINADA. It used to be derived from category+name by
 * the migration-0053 rule — regexes over the ENGLISH name (`like '%row%'`). A coach
 * writing Spanish creates "Remo 500m" and gets `other` instead of `row`: the
 * analytics that route on modality then break, silently, and the coach never sees
 * why. Guessing is only defensible when nobody knows the answer — and here the
 * person who just created the movement knows exactly what it is. So they declare
 * it, and the UI may only PRE-SELECT a suggestion.
 *
 * The 0053 rule stays where it belongs: in migration 0053, as the historical
 * backfill of the BASE catalog. It is no longer app behaviour.
 */

// Category drives the catalog ordering; modality is the intrinsic discipline the
// analytics group by. Both are required — a movement whose kind we don't know is a
// movement we can't reason about. `video_url` reuses the shared YouTube schema
// (validate + canonicalize to a watch URL, or null).
export const createExerciseSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    category: exerciseCategory,
    modality: modalitySchema,
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

async function uniqueSlug(base: string, client: Sql | TransactionClient): Promise<string> {
  const root = base || 'ejercicio';
  // One query for all existing slugs sharing the root, then pick the first free.
  const taken = await client<{ slug: string }[]>`
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
  // Acepta también una TRANSACCIÓN, para que el alta EN BLOQUE del importador
  // pueda crear treinta ejercicios todos-o-ninguno sin duplicar este insert. Es
  // el mismo ensanche que ya hacen `coach/blocks.ts` y `coach/templates.ts`.
  client: Sql | TransactionClient = sql,
): Promise<CatalogExercise> {
  const slug = await uniqueSlug(slugify(input.name), client);
  const videoUrl = input.video_url ?? null;

  // ONE statement. This used to be a two-step transaction (insert a placeholder
  // modality, then UPDATE it from the persisted category/name, because Postgres
  // can't read the just-set category in the same INSERT). Now that the coach
  // declares the modality there is nothing to derive, so the placeholder — and
  // the window where the row existed with a wrong modality — is simply gone.
  const rows = await client<CatalogExercise[]>`
    insert into exercises (slug, name, category, modality, video_url, source, coach_id)
    values (
      ${slug},
      ${input.name},
      ${input.category}::exercise_category,
      ${input.modality},
      ${videoUrl},
      'coach',
      ${coachId}
    )
    returning ${client.unsafe(EXERCISE_SELECT_COLUMNS.join(', '))}
  `;

  const row = rows[0];
  if (!row) {
    // Unique-slug was pre-resolved, so a failure here is a genuine race/duplicate.
    throw new ExerciseCreateError('duplicate', 'No se pudo crear el ejercicio', 409);
  }
  return row;
}
