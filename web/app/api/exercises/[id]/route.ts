import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import {
  ExerciseUpdateError,
  updateExercise,
  updateExerciseSchema,
} from '@/lib/dashboard/exercises/update-exercise';
import {
  loadCoachExerciseRow,
  pickIdentityFields,
  pickOverrideFields,
  upsertCoachExerciseOverride,
} from '@/lib/exercises/coach-override';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/exercises/[id] — edit a catalog exercise.
 *
 * The catalog is GLOBAL (one shared row per movement), but a coach's PEDAGOGICAL
 * content is their own. So this route SPLITS the edit (migration 0085):
 *   • cues / description / video_url  → the calling coach's OVERRIDE row
 *     (coach_exercise_overrides upsert). NEVER touches the global exercise, so
 *     other coaches keep their own (or the global default).
 *   • name / category / muscles / equipment → GLOBAL identity (shared catalog),
 *     updated on the exercises row as before. Modality stays intrinsic/derived.
 *
 * The response is the exercise as THIS coach sees it (global identity + their
 * merged override), so the editor reflects exactly what they and their athletes
 * will see. Coach-auth'd; CSRF-safe via Clerk session in getCoachSession.
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

  // cues/description/video_url → this coach's override; the rest → global identity.
  const overridePatch = pickOverrideFields(parsed.data);
  const identityPatch = pickIdentityFields(parsed.data);
  const hasOverride = Object.keys(overridePatch).length > 0;
  const hasIdentity = Object.keys(identityPatch).length > 0;
  if (!hasOverride && !hasIdentity) {
    return jsonError('bad_request', 'No hay campos para actualizar', 400);
  }

  const exerciseBigId = BigInt(exerciseId);

  // Existence check first so an override-only edit on a missing exercise returns a
  // clean 404 (instead of a raw FK violation from the override insert).
  const exists = await sql<{ one: number }[]>`
    select 1 as one from exercises where id = ${exerciseBigId} limit 1
  `;
  if (exists.length === 0) {
    return jsonError('not_found', 'Ejercicio no encontrado', 404);
  }

  try {
    // Global identity edit (rare via this UI) — affects every coach, as intended.
    if (hasIdentity) {
      await updateExercise(exerciseBigId, identityPatch);
    }
    // Pedagogical edit → THIS coach's override only. The global row is untouched.
    if (hasOverride) {
      await upsertCoachExerciseOverride(sql, {
        coach_id: session.coach_id,
        exercise_id: exerciseBigId,
        patch: overridePatch,
      });
    }

    // Return the exercise as this coach authors it (global identity + raw override).
    const exercise = await loadCoachExerciseRow(sql, session.coach_id, exerciseBigId);
    if (!exercise) return jsonError('not_found', 'Ejercicio no encontrado', 404);
    return jsonOk({ exercise });
  } catch (err) {
    if (err instanceof ExerciseUpdateError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo actualizar';
    return jsonError('internal_error', message, 500);
  }
}
