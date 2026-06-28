import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { coachProfilePatchSchema } from '@/lib/coach/profile-schema';
import { getCoachProfile, updateCoachProfile } from '@/lib/coach/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/profile — the logged-in coach's editable profile.
export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const profile = await getCoachProfile(session.coach_id);
  if (!profile) return jsonError('not_found', 'Coach no encontrado', 404);

  return jsonOk({ profile });
}

// PATCH /api/coach/profile — update any subset of the editable fields. Always
// scoped to the session coach; the body never carries an id.
export async function PATCH(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = coachProfilePatchSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  const provided = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (provided.length === 0) {
    return jsonError('bad_request', 'No hay campos para actualizar', 400);
  }

  const profile = await updateCoachProfile(session.coach_id, parsed.data);
  if (!profile) return jsonError('not_found', 'Coach no encontrado', 404);

  return jsonOk({ profile });
}
