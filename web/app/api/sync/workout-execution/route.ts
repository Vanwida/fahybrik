import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  recordWorkoutExecution,
  workoutExecutionSchema,
} from '@/lib/sync/record-workout-execution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/sync/workout-execution — the SOLO logging path: an athlete syncs a
// finished workout (RPE, score, per-segment actuals) for ONE of their own
// assignments. The recording is single-sourced in recordWorkoutExecution (also
// used by the joint Dobles route); this handler is the auth + validation shell.
export async function POST(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }

  const parsed = workoutExecutionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  const result = await recordWorkoutExecution({
    athleteId: Number(auth.athlete_id),
    assignmentId: Number(parsed.data.assignment_id),
    input: parsed.data,
  });

  if (!result.ok) {
    if (result.reason === 'invalid_assignment') {
      return jsonError('bad_request', 'invalid assignment_id', 400);
    }
    return jsonError('not_found', 'Assignment not found', 404);
  }

  return jsonOk({
    saved: true,
    assignment_id: result.assignment_id,
    execution_id: result.execution_id,
    segments_saved: result.segments_saved,
    prs: result.prs,
  });
}
