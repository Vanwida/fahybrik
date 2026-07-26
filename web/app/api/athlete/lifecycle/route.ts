// GET /api/athlete/lifecycle
//
// Athlete-authenticated. Everything Perfil › Mi suscripción needs to render in one
// read: the lifecycle state, the pause budget (spent / left / when it renews), the
// scheduled baja if there is one, and what billing is about to do.
//
// Kept separate from /api/athlete/subscription, which is the billing mirror consumed
// by other surfaces: this one is the LIFECYCLE view and it is the only place the
// pause budget is computed.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import { getSelfServiceState } from '@/lib/athlete/lifecycle-self-service';
import { LifecycleError } from '@/lib/coach/athlete-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete session required', 401);

  try {
    const state = await getSelfServiceState({
      athlete_id: auth.athlete_id,
      user_id: auth.user_id,
    });
    return jsonOk(state);
  } catch (err) {
    if (err instanceof LifecycleError) return jsonError(err.code, err.message, err.status);
    captureRouteError(err, { route: 'api/athlete/lifecycle.GET' });
    return jsonError('lifecycle_read_failed', 'No pudimos cargar tu estado', 500);
  }
}
