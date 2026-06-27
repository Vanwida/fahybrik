import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listRaceCalendar } from '@/lib/races/race-calendar';
import type { RaceCalendarEvent } from '@fahybrid/shared/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/races/calendar — the race catalog for the coach's target-race
// picker. Same lib as the athlete calendar, but includes events not yet visible
// to athletes (Pablo may target any future event). Filters: series/country/q/from/to.
export async function GET(request: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const q = new URL(request.url).searchParams;
  const events: RaceCalendarEvent[] = await listRaceCalendar({
    series: q.get('series') ?? undefined,
    country: q.get('country') ?? undefined,
    q: q.get('q') ?? undefined,
    from: q.get('from') ?? undefined,
    to: q.get('to') ?? undefined,
    include_hidden: true,
  });
  return jsonOk({ events });
}
