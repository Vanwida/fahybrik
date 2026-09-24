// POST /api/athlete/dobles/session/[id]/log
//
// Log a JOINT HYROX Dobles "train together" session. The [id] is the CALLING
// athlete's own workout_assignment (same id the GET session route resolves). The
// athlete logs THEIR OWN execution (own loads / RPE / actuals) exactly like the
// solo path — the same recorder, so there is one execution model, never a forked
// doubles copy — and we additionally:
//   1. link the partner athlete on the execution (workout_executions
//      .partner_athlete_id, 0074) so "this pair trained together" is queryable.
//
// HONESTY GATE — we do NOT force partner_visibility. If the athlete marked the
// session 'self_only', the workout is recorded as THEIR OWN (solo) and NOT linked:
// a session they chose to keep private is never shared. It used to be a 409, and
// the app treats any 4xx as poison — the athlete lost the workout for a sharing
// choice. Same for a pair the coach dissolved while they trained (it used to 404
// `no_partner`): the athlete's own work is kept, just not linked (`joint: false`).
//
// A session the coach removed or replaced meanwhile, or an id that is not theirs,
// is kept as the athlete's own OFF-PLAN execution (`record-athlete-workout.ts`),
// never linked to a partner. Audit E1 / D-04: a finished workout never gets a 4xx
// the phone or the Watch would throw away.
//
// HONEST BOUNDARY — what this does NOT do: it never writes the PARTNER's
// execution. A doubles pair coordinates plan STRUCTURE only (0065); each athlete
// has their OWN dated assignment and lifts their OWN loads, which this device
// doesn't have. The partner logs their own from their device (also linked). We
// record the link, not fabricated partner actuals.
//
// Auth: athlete bearer.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { loadDoublesTrainingPartner } from '@/lib/athlete/doubles-training-partner';
import { executionMetricsSchema } from '@/lib/sync/record-workout-execution';
import { recordAthleteWorkout, wireAssignmentId } from '@/lib/sync/record-athlete-workout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete bearer token required', 401);

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }

  const parsed = executionMetricsSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  const athleteId = Number(auth.athlete_id);
  const assignmentId = wireAssignmentId(id);

  // A joint session needs an active Dobles TRAINING pair (doubles_pairs), not the
  // billing partner link. Without one there is nobody to link — the athlete's own
  // work is still recorded.
  const partner = await loadDoublesTrainingPartner(auth.athlete_id);

  // HONESTY GATE — respect the athlete's privacy choice on their own session.
  let sharePrivate = false;
  if (partner && assignmentId != null) {
    const visRows = await sql<{ partner_visibility: 'shared' | 'self_only' }[]>`
      select partner_visibility
      from workout_assignments
      where id = ${assignmentId} and athlete_id = ${athleteId}
      limit 1
    `;
    sharePrivate = visRows[0]?.partner_visibility === 'self_only';
  }

  // Record THIS athlete's execution exactly like the solo path (same model).
  const result = await recordAthleteWorkout({
    athleteId,
    rawAssignmentId: id,
    input: parsed.data,
  });
  if (!result.ok) return jsonError('not_found', 'Assignment not found', 404);

  const joint = partner != null && !sharePrivate && !result.off_plan;
  if (joint) {
    // Scoped to the caller's own execution so this can never touch the partner's
    // rows. partner_visibility is never flipped — it is 'shared' here.
    await sql`
      update workout_executions
      set partner_athlete_id = ${Number(partner.partner_athlete_id)}, updated_at = now()
      where id = ${Number(result.execution_id)} and athlete_id = ${athleteId}
    `;
  }

  return jsonOk({
    saved: true,
    joint,
    assignment_id: result.off_plan ? null : result.assignment_id,
    execution_id: result.execution_id,
    segments_saved: result.segments_saved,
    prs: result.prs,
    partner_athlete_id: joint && partner ? String(partner.partner_athlete_id) : null,
    off_plan: result.off_plan,
  });
}
