// GET /api/athlete/assignments/[id]/detail
//
// Returns the full pre-workout payload for an assigned session: assignment
// metadata + the resolved workout (blocks → items with sets/reps/load/RPE/
// pace/etc.). The iOS pre-workout brief / active workout screens hydrate
// from here; the week endpoint only ships the short card.
//
// Auth: athlete bearer (Sign in with Apple JWT). Ownership is enforced by
// the helper — if the assignment isn't owned by the calling athlete (or
// doesn't exist) we return 404 to avoid leaking existence.

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { resolveAthleteRunningThresholds } from '@/lib/coach/running-thresholds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParamSchema = z.coerce.bigint();

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) {
    return jsonError('unauthorized', 'Athlete bearer token required', 401);
  }

  const { id } = await ctx.params;
  const parsed = idParamSchema.safeParse(id);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid assignment id', 400);
  }

  // El umbral de pendiente del coach, resuelto UNA vez aquí y no dentro del
  // cargador: viaja en `run_compliance` para que la app deje de tener su propia
  // constante del 3 %. Ver `shared/domain/running/gradient.ts`.
  const thresholds = await resolveAthleteRunningThresholds(auth.athlete_id, sql);

  const detail = await loadAssignmentDetail({
    sql,
    athlete_id: auth.athlete_id,
    assignment_id: parsed.data,
    // Enables deriving the Dobles station split (reparto) from the reading
    // athlete's perspective for HYROX-simulation sessions.
    self_user_id: auth.user_id,
    gradient_retires_pace_pct: thresholds.gradient_retires_pace_pct,
  });

  if (!detail) {
    return jsonError('not_found', 'Assignment not found', 404);
  }

  return jsonOk(detail);
}
