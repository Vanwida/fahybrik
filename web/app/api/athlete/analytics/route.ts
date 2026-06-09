import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildModalityAnalytics } from '@/lib/coach/modality-analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/analytics
// The athlete's own run-vs-row(-vs-ski/bike/strength) modality breakdown.
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const analytics = await buildModalityAnalytics({ athlete_id: auth.athlete_id });
  return jsonOk(analytics);
}
