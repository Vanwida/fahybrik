// GET /api/athlete/marks — the athlete's benchmark library (#Marcas).
//
// One read returns every mark in the closed catalog with its history, PR (per
// context for running), latest result and the race twin for the station marks.
// The app renders "Tus marcas" straight from this. snake_case.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import { loadMarksOverview } from '@/lib/athlete/marks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete session required', 401);

  try {
    return jsonOk(await loadMarksOverview(auth.athlete_id));
  } catch (err) {
    captureRouteError(err, { route: 'api/athlete/marks.GET' });
    return jsonError('marks_read_failed', 'No pudimos cargar tus marcas', 500);
  }
}
