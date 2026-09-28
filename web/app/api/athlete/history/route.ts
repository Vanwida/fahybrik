import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildAthleteHistoryMonth } from '@/lib/athlete/history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/history?month=YYYY-MM[&include_unplanned=1]
//
// Feeds the iOS monthly calendar: the days of the month that have content — days
// with done sessions (each carrying its execution_id and, when it has one, its
// assignment_id so the calendar opens the existing session detail) and scheduled
// rest days. See lib/athlete/history.ts for the honesty rules (done-status gate,
// athlete-local day, rest = coach-planned-but-empty).
//
// `include_unplanned=1` also serves done work with NO assignment (Apple Salud
// imports, workouts kept «fuera del plan»), whose `assignment_id` is null. Opt-in
// because the installed app decodes `assignment_id` as a non-optional string.
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const flagSchema = z.enum(['0', '1', 'true', 'false']).nullable();

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const params = new URL(request.url).searchParams;
  const month = monthSchema.safeParse(params.get('month'));
  if (!month.success) {
    return jsonError('bad_request', 'month debe ser YYYY-MM', 400);
  }
  const flag = flagSchema.safeParse(params.get('include_unplanned'));
  if (!flag.success) {
    return jsonError('bad_request', 'include_unplanned debe ser 1 o 0', 400);
  }

  const history = await buildAthleteHistoryMonth(auth.athlete_id, month.data, undefined, {
    include_unplanned: flag.data === '1' || flag.data === 'true',
  });
  return jsonOk(history);
}
