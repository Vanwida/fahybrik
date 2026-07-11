import { z } from 'zod';
import { exerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import {
  coachExerciseColumns,
  exerciseCatalogOrder,
  joinCoachOverride,
  type CoachExerciseRow,
} from '@/lib/exercises/coach-override';
import {
  createExercise,
  createExerciseSchema,
  ExerciseCreateError,
} from '@/lib/dashboard/exercises/create-exercise';

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

  const rows = await sql<CoachExerciseRow[]>`
    select ${coachExerciseColumns(sql)}
    from exercises e
    ${joinCoachOverride(sql, session.coach_id)}
    where (${category ?? null}::exercise_category is null or e.category = ${category ?? null}::exercise_category)
      and (${term}::text is null
           or lower(e.name) like ${term}::text
           or lower(e.slug) like ${term}::text)
    order by ${exerciseCatalogOrder(sql)}
    limit ${limit}
  `;

  return jsonOk({ exercises: rows });
}

/**
 * POST /api/exercises — create a catalog exercise the coach is missing while
 * authoring (the picker's "crear ejercicio nuevo" row). Body: name + category
 * (+ optional YouTube). Modality is derived server-side (intrinsic, mig 0053) and
 * the row is tagged source='coach'. Scope is GLOBAL single-coach (see
 * create-exercise.ts). Returns the fresh exercise so the picker selects it in.
 */
export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = createExerciseSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Datos inválidos', 400, parsed.error.flatten());
  }

  try {
    const exercise = await createExercise(parsed.data);
    return jsonOk({ exercise }, 201);
  } catch (err) {
    if (err instanceof ExerciseCreateError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo crear';
    return jsonError('internal_error', message, 500);
  }
}
