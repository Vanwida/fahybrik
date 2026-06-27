// POST /api/athlete/dobles/session/[id]/log
//
// Log a JOINT HYROX Dobles "train together" session. The [id] is the CALLING
// athlete's own workout_assignment (same id the GET session route resolves). The
// athlete logs THEIR OWN execution (own loads / RPE / actuals) exactly like the
// solo path — reusing recordWorkoutExecution, so there is one execution model,
// never a forked doubles copy — and we additionally:
//   1. link the partner athlete on the execution (workout_executions
//      .partner_athlete_id, 0074) so "this pair trained together" is queryable;
//   2. mark the assignment partner_visibility='shared' so the partner + coach
//      see the result (the product promise: "los dos resultados quedan visibles
//      para ambos y para el coach").
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
import { loadPartner } from '@/lib/partner/invitations';
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

  // A joint session requires a linked partner. Without one this isn't a joint
  // log — honest 404 rather than silently recording a "joint" with nobody.
  const partner = await loadPartner(auth.user_id);
  if (!partner || partner.athlete_id == null) {
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
  const partnerAthleteId = Number(partner.athlete_id);

  // Record THIS athlete's execution exactly like the solo path (same model).
  const result = await recordWorkoutExecution({ athleteId, assignmentId, input: parsed.data });
  if (!result.ok) {
    if (result.reason === 'invalid_assignment') {
      return jsonError('bad_request', 'invalid assignment id', 400);
    }
    return jsonError('not_found', 'Assignment not found', 404);
  }

  // Link the partner on the execution + share the result. Scoped to the caller's
  // own execution / assignment so this can never touch the partner's rows.
  await sql`
    update workout_executions
    set partner_athlete_id = ${partnerAthleteId}, updated_at = now()
    where id = ${Number(result.execution_id)} and athlete_id = ${athleteId}
  `;
  await sql`
    update workout_assignments
    set partner_visibility = 'shared', updated_at = now()
    where id = ${assignmentId} and athlete_id = ${athleteId}
  `;

  return jsonOk({
    saved: true,
    joint: true,
    assignment_id: result.assignment_id,
    execution_id: result.execution_id,
    segments_saved: result.segments_saved,
    partner_athlete_id: String(partnerAthleteId),
  });
}
