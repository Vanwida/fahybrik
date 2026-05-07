import { z } from 'zod';
import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { exerciseCategorySchema as exerciseCategory } from '@/lib/templates/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  category: exerciseCategory.optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(120),
});

interface ExerciseRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  primary_muscle_groups: string[];
  equipment: string[];
  default_metrics_json: Record<string, boolean>;
  hyrox_station_position: number | null;
  description: string | null;
  cues: string | null;
}

export async function GET(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    category: url.searchParams.get('category') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid query', 400, parsed.error.flatten());
  }

  const { category, search, limit } = parsed.data;
  const term = search ? `%${search.toLowerCase()}%` : null;

  const rows = await sql<ExerciseRow[]>`
    select
      id::text                  as id,
      slug,
      name,
      category::text            as category,
      primary_muscle_groups,
      equipment,
      default_metrics_json,
      hyrox_station_position,
      description,
      cues
    from exercises
    where (${category ?? null}::exercise_category is null or category = ${category ?? null}::exercise_category)
      and (${term}::text is null
           or lower(name) like ${term}::text
           or lower(slug) like ${term}::text)
    order by
      case category
        when 'hyrox_station' then 0
        when 'strength'      then 1
        when 'cardio'        then 2
        when 'skill'         then 3
        when 'plyometric'    then 4
        when 'core'          then 5
        when 'mobility'      then 6
        else 7
      end,
      name asc
    limit ${limit}
  `;

  return jsonOk({ exercises: rows });
}
