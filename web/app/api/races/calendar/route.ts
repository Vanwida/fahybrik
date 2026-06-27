import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listRaceCalendar } from '@/lib/races/race-calendar';
import { getTargetRaceRow } from '@fahybrid/shared/domain/coach/target-race';
import { sql } from '@/lib/db';
import type { RaceCalendarResponse } from '@fahybrid/shared/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/races/calendar — the athlete's "Buscar carrera" catalog: VISIBLE,
// FUTURE events, with optional filters series / country / q / from / to. Also
// returns the athlete's current target event id so the picker can badge the
// already-selected event. Athlete bearer only.
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const url = new URL(request.url);
  const q = url.searchParams;

  const [events, target] = await Promise.all([
    listRaceCalendar({
      series: q.get('series') ?? undefined,
      country: q.get('country') ?? undefined,
      q: q.get('q') ?? undefined,
      from: q.get('from') ?? undefined,
      to: q.get('to') ?? undefined,
    }),
    getTargetRaceRow(auth.athlete_id, sql),
  ]);

  const body: RaceCalendarResponse = {
    events,
    current_target_event_id: target?.event_id != null ? String(target.event_id) : null,
  };
  return jsonOk(body);
}
