import { z } from 'zod';
import { exerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  category: exerciseCategory.optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export async function GET(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    category: url.searchParams.get('category') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError('bad_request', 'Query inválida', 400, parsed.error.flatten());
  }

  const { category, search, limit } = parsed.data;
  const term = search ? `%${search.toLowerCase()}%` : null;

  const rows = await sql<CatalogExercise[]>`
    select
      id::text as id,
      slug,
      name,
      category::text as category,
      primary_muscle_groups,
      equipment,
      default_metrics_json,
      hyrox_station_position,
      description,
      cues,
      video_url
    from exercises
    where (${category ?? null}::exercise_category is null or category = ${category ?? null}::exercise_category)
      and (${term}::text is null
           or lower(name) like ${term}::text
           or lower(slug) like ${term}::text)
    order by
      case category
        when 'hyrox_station' then 0
        when 'strength' then 1
        when 'cardio' then 2
        when 'skill' then 3
        when 'plyometric' then 4
        when 'core' then 5
        when 'mobility' then 6
        else 7
      end,
      name asc
    limit ${limit}
  `;

  return jsonOk({ exercises: rows });
}
