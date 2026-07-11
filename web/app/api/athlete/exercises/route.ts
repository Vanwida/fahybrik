import { z } from 'zod';

import { exerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { loadAthleteExerciseCatalog } from '@/lib/athlete/exercise-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/exercises — the athlete's exercise CATALOG for building an
// entreno libre (the strength/functional picker). Scoped to the athlete's coach so
// the coach's name/content overrides apply (a coachless athlete gets the base
// catalog). Reuses the coach picker's column list + join + order (single source in
// coach-override.ts, via loadAthleteExerciseCatalog). Response is the minimal
// picker shape: { exercises: [{ id, name, slug, category, modality }] }.

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1000;

const querySchema = z.object({
  category: exerciseCategory.optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);
  const athleteId = Number(auth.athlete_id);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    category: url.searchParams.get('category') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError('bad_request', 'Invalid query', 400, parsed.error.flatten());
  }
  const { category, search, limit } = parsed.data;

  // The athlete's coach scopes the overrides; null → base catalog (join matches nothing).
  const coachRows = await sql<Array<{ coach_id: string | null }>>`
    select coach_id::text as coach_id from athletes where id = ${athleteId} limit 1
  `;
  const coachId = coachRows[0]?.coach_id ? Number(coachRows[0].coach_id) : null;

  const exercises = await loadAthleteExerciseCatalog(sql, {
    coachId,
    category: category ?? null,
    search: search ?? null,
    limit,
  });

  return jsonOk({ exercises });
}
