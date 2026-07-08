import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { requestPause, LifecycleError } from '@/lib/coach/athlete-lifecycle';
import { PAUSE_REASONS } from '@fahybrid/shared/domain/coach/athlete-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The athlete asks the coach for a pause from the app. This is a REQUEST, not a pause:
// it inserts a pending row that the coach confirms/declines. Never auto-pauses.
const requestPauseSchema = z.object({
  reason: z.enum(PAUSE_REASONS),
  note: z.string().trim().max(1000).optional(),
});

// POST /api/athlete/pause-request — athlete Bearer auth
export async function POST(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Sesión de atleta requerida', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = requestPauseSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos de solicitud inválidos', 422, parsed.error.flatten());
  }

  try {
    const result = await requestPause({
      athlete_id: session.athlete_id,
      reason: parsed.data.reason,
      note: parsed.data.note,
    });
    return jsonOk(result, 201);
  } catch (err) {
    if (err instanceof LifecycleError) return jsonError(err.code, err.message, err.status);
    console.error('[POST /api/athlete/pause-request]', err);
    return jsonError('request_failed', 'No se pudo enviar la solicitud de pausa', 500);
  }
}
