import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildGoalGap } from '@/lib/athlete/goal-gap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/goal-gap
// The authenticated athlete's "camino al objetivo" board: their target race goal
// decomposed into a per-segment BUDGET (from a near-goal singles cohort, else
// their own last race), the PREDICTED cost of each segment (from training + race
// history, tier-tagged), and the GAP (predicted total − goal). Honest gates when
// there's no target race, no goal, or nothing to build a budget from yet. On a
// real read the day's prediction is snapshotted (best-effort) so predicted-vs-real
// stays honest. Mirrors the iOS GoalGap contract (snake_case). See Fase 3 / #5.
//
// Input: the athlete bearer only — validated by getAthleteSessionFromBearer; an
// invalid/absent bearer yields 401.
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const board = await buildGoalGap({ athlete_id: auth.athlete_id });
  return jsonOk(board);
}
