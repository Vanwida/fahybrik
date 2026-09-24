import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { workoutExecutionSchema } from '@/lib/sync/record-workout-execution';
import { recordAthleteWorkout } from '@/lib/sync/record-athlete-workout';
import { droppedCount } from '@/lib/sync/lenient';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/sync/workout-execution — the SOLO logging path: an athlete syncs a
// finished workout (RPE, score, per-segment actuals). The phone's own finish, the
// Watch relay (through the phone), the photo-capture confirm and «Marcar como
// hecha» all land here.
//
// A finished workout is never answered with a 4xx the app would throw away (audit
// E1 / D-04): a field that does not fit costs that field, a tramo without identity
// costs that tramo, and a session the coach removed or replaced while the athlete
// trained — or an id that is not theirs — is kept as the athlete's own OFF-PLAN
// execution and flagged for the coach (`record-athlete-workout.ts`). 2xx is what
// clears the phone's REINTENTAR, the offline queue and the Watch's retry state.
// Left as errors: 401 (no session), 400 (the body is not a JSON object), and 404
// only for a bare «Marcar como hecha» (no work in it) on a session that is gone.
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

  const athleteId = Number(auth.athlete_id);
  // A tramo without its own identity is a bug of OUR client: it costs that tramo,
  // never the session — and it is said out loud here, not swallowed.
  const droppedSegments = droppedCount(
    (body as { segments?: unknown }).segments,
    parsed.data.segments,
  );
  if (droppedSegments > 0) {
    captureRouteError(new Error('workout-execution: tramos sin identidad descartados'), {
      route: 'api/sync/workout-execution.POST',
      meta: { athlete_id: athleteId, dropped_segments: droppedSegments },
    });
  }

  const result = await recordAthleteWorkout({
    athleteId,
    rawAssignmentId: parsed.data.assignment_id,
    input: parsed.data,
  });

  if (!result.ok) return jsonError('not_found', 'Assignment not found', 404);

  return jsonOk({
    saved: true,
    assignment_id: result.off_plan ? null : result.assignment_id,
    execution_id: result.execution_id,
    segments_saved: result.segments_saved,
    prs: result.prs,
    off_plan: result.off_plan,
  });
}
