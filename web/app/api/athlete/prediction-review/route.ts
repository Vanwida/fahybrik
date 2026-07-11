import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildPredictionReview } from '@/lib/athlete/prediction-review';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/prediction-review?race_id=X | execution_id=Y
// Compares the LAST goal-gap snapshot frozen before an event against the event's
// REAL splits — an imported race (race_id) or a hyrox_sim execution (execution_id)
// — segment by segment, with an honest accuracy and a deterministic one-line
// insight off the worst delta. Honest gates: no snapshot before the event
// ('no_snapshot'), the event has no usable splits ('no_actual'), or the id isn't
// the athlete's ('not_found'). Mirrors the iOS PredictionReview contract. See #5.
//
// Input: the athlete bearer + exactly one of race_id / execution_id (positive int).
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const url = new URL(request.url);
  const raceId = parsePositiveInt(url.searchParams.get('race_id'));
  const executionId = parsePositiveInt(url.searchParams.get('execution_id'));

  if (raceId == null && executionId == null) {
    return jsonError('bad_request', 'race_id o execution_id requerido', 400);
  }
  if (raceId != null && executionId != null) {
    return jsonError('bad_request', 'Indica solo uno: race_id o execution_id', 400);
  }

  const review = await buildPredictionReview({
    athlete_id: auth.athlete_id,
    race_id: raceId ?? undefined,
    execution_id: executionId ?? undefined,
  });
  return jsonOk(review);
}

/** A strictly-positive integer query param, else null. */
function parsePositiveInt(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
