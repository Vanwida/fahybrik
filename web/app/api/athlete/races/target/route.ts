import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { athleteTargetRaceInput } from '@fahybrid/shared/schema';
import {
  setAthleteTargetRace,
  TargetRaceError,
} from '@/lib/races/target-race-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/races/target — the athlete fixes a catalog event as their
// target race. Creates (or updates, when re-picking the same event) the target
// `races` row and demotes any previous target to 'secondary'. Athlete bearer.
export async function POST(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = athleteTargetRaceInput.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  try {
    const result = await setAthleteTargetRace({
      athlete_id: Number(auth.athlete_id),
      event_id: parsed.data.event_id,
      format: parsed.data.format,
      division: parsed.data.division,
      gender_category: parsed.data.gender_category,
      goal_time_seconds: parsed.data.goal_time_seconds ?? null,
      require_visible: true,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof TargetRaceError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
