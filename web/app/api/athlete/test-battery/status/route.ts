import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadBatteryStatus } from '@/lib/coach/battery-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/test-battery/status — the calibration battery progress for the
// calling athlete ("3/4 · falta remo 2K"): per-test session status + whether the
// result was actually captured (a run test with no number is "resultado
// pendiente", not done). Athlete bearer (Sign in with Apple). snake_case.
export async function GET(req: Request) {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) {
    return jsonError('unauthorized', 'Athlete bearer token required', 401);
  }

  const battery = await loadBatteryStatus(Number(auth.athlete_id));
  return jsonOk(battery);
}
