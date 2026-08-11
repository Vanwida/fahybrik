import type { Sql, TransactionClient } from '@/lib/db';
import {
  coachExerciseColumns,
  exerciseCatalogOrder,
  exerciseOriginFilter,
  exerciseSearchFilter,
  joinCoachOverride,
  visibleToCoach,
  type CoachExerciseRow,
  type ExerciseOrigin,
} from '@/lib/exercises/coach-override';

/**
 * THE coach's catalog read — what a coach may see, as they see it.
 *
 * One loader, so the API route, the Biblioteca catalog screen and the tests all
 * exercise the SAME query: the BASE exercises (each with THIS coach's override
 * applied) plus the exercises they created, never another coach's. Scoping that
 * lived inline in a route would be scoping no test could pin without restating
 * it — and a restated rule is a rule that drifts.
 */

export interface CoachCatalogQuery {
  category?: string | null;
  /** base | customized | own. Null/omitted = "Todos". */
  origin?: ExerciseOrigin | null;
  search?: string | null;
  limit?: number;
}

const DEFAULT_LIMIT = 500;

export async function loadCoachCatalog(
  client: Sql | TransactionClient,
  coachId: bigint,
  q: CoachCatalogQuery = {},
): Promise<CoachExerciseRow[]> {
  const category = q.category ?? null;

  // Search matches the MERGED name — a coach who renamed an exercise must find it
  // under the name THEY use, not the base one they never see. Slug stays
  // searchable as the machine handle.
  return client<CoachExerciseRow[]>`
    select ${coachExerciseColumns(client, coachId)}
    from exercises e
    ${joinCoachOverride(client, coachId)}
    where ${visibleToCoach(client, coachId)}
      and (${category}::exercise_category is null or e.category = ${category}::exercise_category)
      and ${exerciseOriginFilter(client, q.origin ?? null)}
      and ${exerciseSearchFilter(client, q.search ?? null, coachId)}
    order by ${exerciseCatalogOrder(client)}
    limit ${q.limit ?? DEFAULT_LIMIT}
  `;
}
