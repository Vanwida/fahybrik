import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildAthleteHistoryMonth } from '@/lib/athlete/history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/history?month=YYYY-MM
//
// Feeds the iOS monthly calendar: the days of the month that have content — days
// with completed sessions (each carrying its assignment_id so the calendar opens
// the existing session detail) and scheduled rest days. See lib/athlete/history.ts
// for the honesty rules (done-status gate, box-local day, rest = planned-but-empty).
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const raw = new URL(request.url).searchParams.get('month');
  const month = monthSchema.safeParse(raw);
  if (!month.success) {
    return jsonError('bad_request', 'month debe ser YYYY-MM', 400);
  }

  const history = await buildAthleteHistoryMonth(auth.athlete_id, month.data);
  return jsonOk(history);
}
