import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { clubSkinPatchSchema } from '@fahybrid/shared/schema/coach-club-skin';
import { getClubSkin, updateClubSkin } from '@/lib/coach/club-skin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/club — piel del club de la sesión. Vacío = marca de este binario.
export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const club = await getClubSkin(session.coach_id);
  if (!club) return jsonError('not_found', 'Coach no encontrado', 404);

  return jsonOk({ club });
}

// PATCH /api/coach/club — nombre, color y/o correo de avisos. El id sale de la sesión, nunca del cuerpo.
export async function PATCH(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = clubSkinPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  const provided = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (provided.length === 0) {
    return jsonError('bad_request', 'No hay campos para actualizar', 400);
  }

  const club = await updateClubSkin(session.coach_id, parsed.data);
  if (!club) return jsonError('not_found', 'Coach no encontrado', 404);

  return jsonOk({ club });
}
