import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  ExerciseUpdateError,
  updateExercise,
  updateExerciseSchema,
} from '@/lib/dashboard/exercises/update-exercise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/exercises/[id] — edit a catalog exercise.
 *
 * Scope: the catalog is GLOBAL (no per-coach ownership). FAHYBRIK is
 * single-coach, so any authenticated coach may edit. CSRF/origin is enforced
 * inside getCoachSession (it drops the session on a foreign Origin).
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const exerciseId = Number(id);
  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return jsonError('bad_request', 'ID inválido', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = updateExerciseSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Datos inválidos', 400, parsed.error.flatten());
  }

  try {
    const exercise = await updateExercise(BigInt(exerciseId), parsed.data);
    return jsonOk({ exercise });
  } catch (err) {
    if (err instanceof ExerciseUpdateError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo actualizar';
    return jsonError('internal_error', message, 500);
  }
}
