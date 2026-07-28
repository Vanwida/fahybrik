import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildAthleteVo2Max } from '@/lib/athlete/vo2max';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/vo2max — the athlete's own aerobic number and its history.
//
// ONE call returns the whole picture because the coherence rule (which of the
// two same-family numbers leads, and which travels labelled beside it) is decided
// in `buildAthleteVo2Max`, not in the view. `headline: null` with an empty series
// is the honest empty state: nothing has measured it yet.
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const vo2max = await buildAthleteVo2Max({ athlete_id: auth.athlete_id });
  return jsonOk({ vo2max });
}
