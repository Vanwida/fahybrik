import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getUpcomingRaces } from '@/lib/races/next-race';
import { listAthletePastRaces } from '@/lib/races/athlete-races';
import type { AthleteRacesResponse } from '@fahybrid/shared/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/races — the athlete's FULL race list, split by time:
//   upcoming — future objectives (race_date >= today, no result yet), each with
//              a live days_until countdown, ASC by date.
//   past     — results + expired objectives, rich raceHistoryItemSchema, DESC by
//              date.
// Athlete bearer. The two reads share the same "today-in-box" calc so a race
// never falls between the two buckets.
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const athlete_id = Number(auth.athlete_id);

  const [upcoming, past] = await Promise.all([
    getUpcomingRaces(athlete_id),
    listAthletePastRaces(athlete_id),
  ]);

  const body: AthleteRacesResponse = { upcoming, past };
  return jsonOk(body);
}
