// GET /api/athlete/dobles/joint-summary?assignment_id=N
//
// The side-by-side summary of ONE joint HYROX Dobles session, shown once BOTH
// athletes have logged it. Thin composition root: auth + parse the query id, then
// delegate all DB work to buildJointSummary (lib/athlete/dobles-joint-summary),
// which threads a single client so it is testable against a Neon branch.
//
// Honest 404s: `no_partner` (no active Dobles training pair) and `not_joint` (the
// caller's execution is missing or doesn't link the current partner).

import type { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk, type ApiError } from '@/lib/api/responses';
import {
  buildJointSummary,
  type JointSummaryDTO,
} from '@/lib/athlete/dobles-joint-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const assignmentIdSchema = z.coerce.bigint().positive();

export async function GET(
  request: Request,
): Promise<NextResponse<JointSummaryDTO | ApiError>> {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) {
    return jsonError('unauthorized', 'Athlete bearer token required', 401);
  }

  const parsedId = assignmentIdSchema.safeParse(
    new URL(request.url).searchParams.get('assignment_id'),
  );
  if (!parsedId.success) {
    return jsonError('invalid_request', 'Invalid assignment id', 400);
  }

  const result = await buildJointSummary({
    selfAthleteId: auth.athlete_id,
    fullName: auth.full_name,
    assignmentId: Number(parsedId.data),
  });
  if (!result.ok) {
    if (result.reason === 'no_partner') {
      return jsonError('no_partner', 'No linked partner for this athlete', 404);
    }
    return jsonError('not_joint', 'No joint execution for this assignment', 404);
  }

  return jsonOk(result.dto);
}
