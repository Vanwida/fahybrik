import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildRunningAnalysis } from '@/lib/athlete/running-analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/running-analysis
// The authenticated athlete's running deep-dive: best 1 km, current-week volume,
// per-km splits of the latest run + drift note, weekly threshold-pace
// progression, and (when a run_5k benchmark exists) a VDOT-derived threshold
// pace, VO₂ estimate and Z2–Z5 pace zones. Race-derived fields the system does
// not yet capture are returned null / empty so the iOS view renders honest
// empty states. Mirrors the iOS RunningAnalysis Codable contract (snake_case).
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const analysis = await buildRunningAnalysis({ athlete_id: auth.athlete_id });
  return jsonOk(analysis);
}
