import { z } from 'zod';
import { exerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadCoachCatalog } from '@/lib/dashboard/exercises/list-exercises';
import {
  createExercise,
  createExerciseSchema,
  ExerciseCreateError,
} from '@/lib/dashboard/exercises/create-exercise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  category: exerciseCategory.optional(),
  // The catalog's origin facet — Todos (omitted) | Base | Personalizados | Míos.
  origin: z.enum(['base', 'customized', 'own']).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

/**
 * GET /api/exercises — the coach's catalog: the BASE exercises (each with THEIR
 * override applied) plus the exercises they created. Never another coach's.
 */
export async function GET(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    category: url.searchParams.get('category') ?? undefined,
    origin: url.searchParams.get('origin') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError('bad_request', 'Query inválida', 400, parsed.error.flatten());
  }

  const { category, origin, search, limit } = parsed.data;
  const rows = await loadCoachCatalog(sql, session.coach_id, { category, origin, search, limit });
  return jsonOk({ exercises: rows });
}

/**
 * POST /api/exercises — create an exercise the coach is missing (the picker's
 * "crear ejercicio nuevo" row, or the Biblioteca catalog). Body: name + category
 * (+ optional YouTube). Modality is derived server-side (intrinsic, mig 0053).
 * The row is the coach's OWN — no other coach sees it (mig 0132). Returns the
 * fresh exercise so the picker selects it in.
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
    const exercise = await createExercise(parsed.data, session.coach_id);
    return jsonOk({ exercise }, 201);
  } catch (err) {
    if (err instanceof ExerciseCreateError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo crear';
    return jsonError('internal_error', message, 500);
  }
}
