import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildCarrerasOverview } from '@/lib/athlete/race-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/race-context
// The authenticated athlete's Carreras hub overview, built from their IMPORTED
// HYROX results (rows on `races` with source = 'hyrox_import'): the last race
// summary (splits + standing + delta vs the previous import), per-station
// benchmarks (time + rank-derived fraction/severity), the 8×1 km running splits,
// an optional final-pace-drop note, and the full race history (most recent
// first). Honest-empty when the athlete has no imported race yet. Mirrors the iOS
// CarrerasOverview Codable contract (snake_case). See #31.
//
// Input: the athlete bearer only (no body/params) — validated by
// getAthleteSessionFromBearer; an invalid/absent bearer yields 401.
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const overview = await buildCarrerasOverview({ athlete_id: auth.athlete_id });
  return jsonOk(overview);
}
