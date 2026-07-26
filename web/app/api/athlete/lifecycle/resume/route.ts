// POST /api/athlete/lifecycle/resume — "Volver ya", before the planned date.
//
// The days not spent go straight back to the budget, because the budget counts days
// actually paused (shared/domain/coach/pause-budget.ts). Coming back early is never
// penalised — otherwise the athlete would sit out the full pause just to not lose it.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import { resumeSelf } from '@/lib/athlete/lifecycle-self-service';
import { LifecycleError } from '@/lib/coach/athlete-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete session required', 401);

  try {
    return jsonOk(await resumeSelf({ athlete_id: auth.athlete_id }));
  } catch (err) {
    if (err instanceof LifecycleError) return jsonError(err.code, err.message, err.status);
    captureRouteError(err, { route: 'api/athlete/lifecycle/resume.POST' });
    return jsonError('resume_failed', 'No pudimos reanudar tu plan', 500);
  }
}
