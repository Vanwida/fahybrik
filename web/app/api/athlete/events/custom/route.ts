import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  createAthleteCustomEvent,
  CustomObjectiveError,
} from '@/lib/races/custom-objective';
import { athleteCustomEventInput } from '@fahybrid/shared/schema/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/events/custom — private catalog row for an objective the
// athlete can't find in the shared calendar. Returns { event_id, slug }.
export async function POST(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = athleteCustomEventInput.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  try {
    const result = await createAthleteCustomEvent({
      athlete_id: Number(auth.athlete_id),
      input: parsed.data,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof CustomObjectiveError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
