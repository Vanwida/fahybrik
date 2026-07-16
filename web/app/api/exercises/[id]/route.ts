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
  loadExerciseScope,
  pickIdentityFields,
  pickOverrideFields,
  upsertCoachExerciseOverride,
} from '@/lib/exercises/coach-override';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/exercises/[id] — edit an exercise, by the rules of its ORIGIN.
 *
 * This route is the ROUTER between the two write paths (migration 0132):
 *
 *   • the coach's OWN exercise (`exercises.coach_id = <coach>`) → edited DIRECTLY,
 *     identity included. The whole row is theirs.
 *   • a BASE exercise (`coach_id is null`) → the four fields the coach AUTHORS
 *     (name / cues / description / video_url) become THEIR override — the base row
 *     is never mutated, so every other coach keeps what they had. The shared
 *     identity (category / muscles / equipment) is REFUSED: it's what the movement
 *     IS, and the system reasons over it. Need a different movement? Create your own.
 *   • another coach's exercise → 404, identical to "doesn't exist". The API never
 *     reveals that another coach's exercise exists.
 *
 * The response is the exercise as THIS coach sees it (merged content + their raw
 * override + origin), so the editor reflects exactly what they and their athletes
 * will see. Coach-auth'd; CSRF-safe via Clerk session in getCoachSession.
 */

// The shared-identity fields, in the coach's words — for an honest refusal that
// names what it refused instead of a generic "no puedes".
const IDENTITY_LABELS: Record<string, string> = {
  category: 'la categoría',
  primary_muscle_groups: 'los músculos',
  equipment: 'el material',
};

function identityRefusal(keys: string[]): string {
  const labels = keys.map((k) => IDENTITY_LABELS[k] ?? k);
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
  return `Este ejercicio es de la base, así que ${list} no se puede${labels.length > 1 ? 'n' : ''} cambiar: es lo que define el movimiento y es igual para todos. Sí puedes cambiarle el nombre, las claves, la descripción y el vídeo — se guardan solo para ti. Si necesitas otro movimiento, crea un ejercicio propio.`;
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
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

  const exerciseBigId = BigInt(exerciseId);

  // Split the patch by axis BEFORE choosing a path, so "nothing to do" is answered
  // without a DB round-trip and doesn't depend on any writer's internals.
  const overridePatch = pickOverrideFields(parsed.data);
  const identityPatch = pickIdentityFields(parsed.data);
  const identityKeys = Object.keys(identityPatch);
  if (identityKeys.length === 0 && Object.keys(overridePatch).length === 0) {
    return jsonError('bad_request', 'No hay campos para actualizar', 400);
  }

  // Which write path? Also the ownership gate: null = missing OR another coach's,
  // both answered as 404. Resolved BEFORE any write.
  const scope = await loadExerciseScope(sql, session.coach_id, exerciseBigId);
  if (!scope) return jsonError('not_found', 'Ejercicio no encontrado', 404);

  try {
    if (scope === 'own') {
      // The whole row is theirs — every supplied field is written directly, and
      // modality is recomputed from the new name/category as always.
      await updateExercise(exerciseBigId, parsed.data, session.coach_id);
    } else {
      if (identityKeys.length > 0) {
        return jsonError('shared_identity', identityRefusal(identityKeys), 409);
      }
      // The fork: this coach's override only. The base row is untouched, so the
      // other coaches keep theirs — and because the override rides the SAME id,
      // the change reaches the sessions this coach already built.
      await upsertCoachExerciseOverride(sql, {
        coach_id: session.coach_id,
        exercise_id: exerciseBigId,
        patch: overridePatch,
      });
    }

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
