import 'server-only';

import type { Sql } from '@/lib/db';
import { joinCoachOverride, visibleToCoach } from '@/lib/exercises/coach-override';

/**
 * The coach-side AI exercise catalog — SINGLE SOURCE for what every Coach IA
 * surface (week composer, single-workout composer, AI-workout persister) may
 * offer the model or resolve a name against. Replaces three near-identical,
 * UNSCOPED `select ... from exercises` loaders that fed LLM prompts and
 * name→id resolution with every OTHER coach's exercises too (mig 0132).
 *
 * `name` is the coach's MERGED name (their override wins, else base — see
 * coach-override.ts): a coach writes prompts and plans in the names THEY use,
 * so that is what the model and the name-resolver must see.
 */
export interface CoachCatalogExercise {
  id: string;
  name: string;
  modality: string;
  category: string;
}

/**
 * Sort order, explicit rather than inferred: the three callers disagree.
 * `modality_name` groups the full catalog by modality (compose-week's prompt
 * renders it that way); `name` is a flat alphabetical list (the other two,
 * which also cap the row count — see `limit`).
 */
export type ExerciseCatalogOrder = 'modality_name' | 'name';

/**
 * Load the catalog visible to `coachId`: BASE exercises plus this coach's OWN.
 * `coachId` is a REQUIRED param — an optional one is exactly how the leak this
 * module closes got in in the first place. `limit: null` (compose-week) sends
 * the whole catalog; the other callers cap it, so `limit` stays an explicit
 * param rather than a baked-in default.
 */
export async function loadCoachExerciseCatalog(
  client: Sql,
  coachId: bigint | number,
  opts: { order: ExerciseCatalogOrder; limit: number | null },
): Promise<CoachCatalogExercise[]> {
  const orderBy =
    opts.order === 'modality_name'
      ? client`e.modality, coalesce(ceo.name, e.name)`
      : client`coalesce(ceo.name, e.name)`;
  const limitClause = opts.limit != null ? client`limit ${opts.limit}` : client``;

  return await client<CoachCatalogExercise[]>`
    select
      e.id::text            as id,
      coalesce(ceo.name, e.name) as name,
      e.modality::text      as modality,
      e.category::text      as category
    from exercises e
    ${joinCoachOverride(client, coachId)}
    where ${visibleToCoach(client, coachId)}
    order by ${orderBy}
    ${limitClause}
  `;
}
