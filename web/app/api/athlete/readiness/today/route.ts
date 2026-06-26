import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getLatestReadiness } from '@/lib/coach/athlete-daily-readiness';
import { startOfDayInBox } from '@fahybrid/shared/domain/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  // "Today" in the box timezone (Europe/Madrid), never UTC. getLatestReadiness
  // returns the most recent persisted snapshot ≤ today and only computes a fresh
  // one when none exists. When there is no real signal at all it returns null —
  // we forward that as `readiness: null` so the app shows the honest "Sin datos"
  // empty state instead of an invented score.
  const snapshot = await getLatestReadiness({
    athlete_id: auth.athlete_id,
    on_date: startOfDayInBox(new Date()),
  });

  return jsonOk({ readiness: snapshot });
}
