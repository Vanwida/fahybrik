// POST /api/athlete/dobles/session/[id]/log
//
// Log a JOINT HYROX Dobles "train together" session. The [id] is the CALLING
// athlete's own workout_assignment (same id the GET session route resolves). The
// athlete logs THEIR OWN execution (own loads / RPE / actuals) exactly like the
// solo path — reusing recordWorkoutExecution, so there is one execution model,
// never a forked doubles copy — and we additionally:
//   1. link the partner athlete on the execution (workout_executions
//      .partner_athlete_id, 0074) so "this pair trained together" is queryable.
//
// HONESTY GATE — we do NOT force partner_visibility. A joint log requires the
// assignment to already be 'shared' (the default); if the athlete marked it
// 'self_only' we REJECT with 409 session_private rather than silently flipping
// it to shared. We never leak a session the athlete chose to keep private.
//
// HONEST BOUNDARY — what this does NOT do: it never writes the PARTNER's
// execution. A doubles pair coordinates plan STRUCTURE only (0065); each athlete
// has their OWN dated assignment and lifts their OWN loads, which this device
// doesn't have. The partner logs their own from their device (also linked). We
// record the link, not fabricated partner actuals.
//
// Auth: athlete bearer. Requires a linked partner (else 404 no_partner — without
// one it isn't a joint session). Ownership of the assignment is enforced by the
// shared recorder (404 when not owned).

import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { loadDoublesTrainingPartner } from '@/lib/athlete/doubles-training-partner';
import {
  executionMetricsSchema,
  recordWorkoutExecution,
} from '@/lib/sync/record-workout-execution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParamSchema = z.coerce.bigint().positive();

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete bearer token required', 401);

  const { id } = await ctx.params;
  const parsedId = idParamSchema.safeParse(id);
  if (!parsedId.success) return jsonError('invalid_request', 'Invalid assignment id', 400);

  // A joint session requires an active Dobles TRAINING pair (doubles_pairs), not
  // the billing partner link. Without one this isn't a joint log — honest 404
  // rather than silently recording a "joint" with nobody.
  const partner = await loadDoublesTrainingPartner(auth.athlete_id);
  if (!partner) {
    return jsonError('no_partner', 'No linked partner for this athlete', 404);
  }

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
  const assignmentId = Number(parsedId.data);
  const partnerAthleteId = Number(partner.partner_athlete_id);

  // HONESTY GATE — respect the athlete's privacy choice. Read the CURRENT
  // visibility (scoped to the caller's own assignment). If they marked this
  // session private ('self_only'), we must NOT silently flip it to shared to
  // log it as joint — that would leak a session they chose to keep private.
  // Reject with a clear 409 instead. 'shared' (the default) proceeds. A missing
  // row (assignment not owned) falls through to the recorder's 404 below.
  const visRows = await sql<{ partner_visibility: 'shared' | 'self_only' }[]>`
    select partner_visibility
    from workout_assignments
    where id = ${assignmentId} and athlete_id = ${athleteId}
    limit 1
  `;
  if (visRows[0]?.partner_visibility === 'self_only') {
    return jsonError(
      'session_private',
      'Esta sesión está marcada como privada; no se puede registrar como conjunta.',
      409,
    );
  }

  // Record THIS athlete's execution exactly like the solo path (same model).
  const result = await recordWorkoutExecution({ athleteId, assignmentId, input: parsed.data });
  if (!result.ok) {
    if (result.reason === 'invalid_assignment') {
      return jsonError('bad_request', 'invalid assignment id', 400);
    }
    return jsonError('not_found', 'Assignment not found', 404);
  }

  // Link the partner on the execution. Scoped to the caller's own execution so
  // this can never touch the partner's rows. We do NOT force partner_visibility
  // to 'shared' — it's already 'shared' here (self_only was rejected above), and
  // silently flipping an athlete's visibility is exactly the dishonesty we avoid.
  await sql`
    update workout_executions
    set partner_athlete_id = ${partnerAthleteId}, updated_at = now()
    where id = ${Number(result.execution_id)} and athlete_id = ${athleteId}
  `;

  return jsonOk({
    saved: true,
    joint: true,
    assignment_id: result.assignment_id,
    execution_id: result.execution_id,
    segments_saved: result.segments_saved,
    prs: result.prs,
    partner_athlete_id: String(partnerAthleteId),
  });
}
