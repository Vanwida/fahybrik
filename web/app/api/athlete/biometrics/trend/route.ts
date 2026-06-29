import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildAthleteBiometricTrend } from '@/lib/athlete/biometric-trend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/biometrics/trend — the athlete's most relevant biometric trend
// (HRV / VO₂max / resting HR / sleep) over the last weeks, for Inicio's "Tu
// progreso". `trend.metrics` is empty when there's no recent real data — the app
// hides the element rather than inventing a number.
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const trend = await buildAthleteBiometricTrend({ athlete_id: auth.athlete_id });
  return jsonOk({ trend });
}
