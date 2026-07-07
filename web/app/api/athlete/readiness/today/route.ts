import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteReadinessToday } from '@/lib/coach/athlete-daily-readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  // getAthleteReadinessToday resolves "today" as the calendar day in the ATHLETE's
  // own timezone (athletes.timezone, fallback Europe/Madrid) — so last night's
  // sleep and the early-morning resting-HR sample land on the right day. It returns
  // the SAME most-recent snapshot ≤ today the Inicio card shows, plus a 7-day score
  // trend and enriched raw breakdown values for the detail sheet; when there is no
  // real signal at all it returns null, forwarded as `readiness: null` so the app
  // shows the honest "Sin datos" empty state.
  const snapshot = await getAthleteReadinessToday({
    athlete_id: auth.athlete_id,
    on_date: new Date(),
  });

  return jsonOk({ readiness: snapshot });
}
