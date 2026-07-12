import type { Sql } from '@/lib/db';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import {
  coachExerciseColumns,
  exerciseCatalogOrder,
  joinCoachOverride,
  type CoachExerciseRow,
} from '@/lib/exercises/coach-override';

// The athlete-facing exercise CATALOG loader — the data behind GET
// /api/athlete/exercises (the strength/functional picker for building an entreno
// libre). It REUSES the coach picker's override-aware column list + coach-override
// join + display order (single-sourced in coach-override.ts), scoped to the
// athlete's coach so the coach's name/content overrides apply; a coachless athlete
// (coachId null) gets the base global catalog. An injectable `Sql` keeps it
// testable against an ephemeral Neon branch.

/** The minimal picker shape the athlete app needs (a subset of the catalog row).
 *  `id` is NUMERIC on this wire: iOS decodes `id: Int` (and POSTs it back as
 *  `items[].exercise_id`), while the coach catalog keeps its `::text` ids. */
export type AthleteExercise = Pick<CatalogExercise, 'name' | 'slug' | 'category' | 'modality'> & {
  id: number;
};

export interface AthleteExerciseQuery {
  /** The athlete's coach (scopes overrides); null → base global catalog. */
  coachId: number | null;
  /** Optional `exercise_category` filter (already validated by the caller). */
  category?: string | null;
  /** Optional case-insensitive name/slug search term (not yet LIKE-wrapped). */
  search?: string | null;
  limit: number;
}

export async function loadAthleteExerciseCatalog(
  sql: Sql,
  q: AthleteExerciseQuery,
): Promise<AthleteExercise[]> {
  const category = q.category ?? null;
  const term = q.search ? `%${q.search.toLowerCase()}%` : null;

  const rows = await sql<CoachExerciseRow[]>`
    select ${coachExerciseColumns(sql)}
    from exercises e
    ${joinCoachOverride(sql, q.coachId)}
    where (${category}::exercise_category is null or e.category = ${category}::exercise_category)
      and (${term}::text is null
           or lower(e.name) like ${term}::text
           or lower(e.slug) like ${term}::text)
    order by ${exerciseCatalogOrder(sql)}
    limit ${q.limit}
  `;

  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    slug: r.slug,
    category: r.category,
    modality: r.modality,
  }));
}
