import { z } from 'zod';

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { executionMetricsSchema } from '@/lib/sync/record-workout-execution';
import { reportDroppedTramos } from '@/lib/sync/report-dropped-tramos';
import { recordFreeWorkout } from '@/lib/athlete/record-free-workout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/workouts/free — the athlete saves their OWN ("entreno libre /
// no prescrito") workout, ALREADY DONE. A free workout and a coach's session are the
// same object and save the same way (DECISIONS 2026-09-28, `record-free-workout.ts`):
//   • `assignment_id` of an existing plan → recorded over it, exactly like the
//     coach's sync path; nothing new is created;
//   • no plan yet (e.g. started offline) → title/modality/prescription/items build
//     the template + self assignment and the execution in ONE transaction, each
//     tramo linked to its template segment (`item_index`, see docs/pr/un-solo-entreno.md);
//   • a plan that does not fit is never a reason to lose the work: it is kept
//     OFF-PLAN (0270). Errors left: 401, 400 (not a JSON object), 404 (a bare
//     «hecha» on a session that is gone) and 422 only when there is neither a valid
//     plan nor any work to keep.
// The response is the coach path's: records (`prs`) and saved/dropped tramos.

/** Execution metrics + the plan fields, read as evidence (the plan is checked apart). */
const freeWorkoutBodySchema = executionMetricsSchema.extend({
  assignment_id: z.unknown(),
  title: z.unknown(),
  modality: z.unknown(),
  prescription: z.unknown(),
  items: z.unknown(),
});

export async function POST(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);
  const athleteId = Number(auth.athlete_id);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('bad_request', 'Invalid JSON body', 400);
  }

  const parsed = freeWorkoutBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }
  const segmentsDropped = reportDroppedTramos({
    route: 'api/athlete/workouts/free.POST',
    athleteId,
    rawBody: raw,
    kept: parsed.data.segments,
  });

  // The libre surfaces to the athlete's coach when they HAVE one (the
  // workout_libre attention signal). A FREE athlete (coach_id null) saves the
  // same workout with no one to notify: exercise resolution falls back to the
  // BASE catalog (visibleToCoach) and the attention recompute no-ops.
  const coachRows = await sql<Array<{ coach_id: string | null }>>`
    select coach_id::text as coach_id from athletes where id = ${athleteId} limit 1
  `;
  const coachIdStr = coachRows[0]?.coach_id ?? null;

  const result = await recordFreeWorkout({
    athleteId,
    coachId: coachIdStr === null ? null : Number(coachIdStr),
    body: raw as Record<string, unknown>,
    // Execution metrics only, single-sourced from executionMetricsSchema.
    metrics: executionMetricsSchema.parse(parsed.data),
  });

  if (!result.ok) {
    return result.reason === 'not_found'
      ? jsonError('not_found', 'Assignment not found', 404)
      : jsonError(result.code, result.message, 422, result.details);
  }

  return jsonOk({
    saved: true,
    assignment_id: result.off_plan ? null : result.assignment_id,
    execution_id: result.execution_id,
    segments_saved: result.segments_saved,
    segments_dropped: segmentsDropped,
    prs: result.prs,
    off_plan: result.off_plan,
    origin: 'self',
  });
}
