// GET /api/athlete/dobles/session/[id]
//
// The Dobles "train together" payload for ONE shared workout assignment: the
// session's exercises with PER-ATHLETE load, each resolved over that athlete's
// OWN 1RM. Drives the iOS dual-load table (DoblesTrainTogetherView).
//
// Auth: athlete bearer (Sign in with Apple JWT). Ownership of the assignment is
// enforced by the resolver — an assignment not owned by the caller (or absent)
// returns 404 to avoid leaking existence.
//
// Honest-empty: a Dobles session needs a linked partner. With no partner we
// return 404 → the iOS client renders the "Sin sesión conjunta" empty state
// (it never fabricates either athlete's loads).

import { z } from 'zod';
import type { NextResponse } from 'next/server';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { loadPartner } from '@/lib/partner/invitations';
import {
  loadDoblesSession,
  type DoblesTrainTogetherSession,
} from '@/lib/athlete/dobles-session';
import type { ApiError } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParamSchema = z.coerce.bigint().positive();

function firstName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<DoblesTrainTogetherSession | ApiError>> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) {
    return jsonError('unauthorized', 'Athlete bearer token required', 401);
  }

  const { id } = await ctx.params;
  const parsed = idParamSchema.safeParse(id);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid assignment id', 400);
  }

  // A train-together session requires a linked partner. Honest-empty otherwise.
  const partner = await loadPartner(auth.user_id);
  if (!partner || partner.athlete_id == null) {
    return jsonError('no_partner', 'No linked partner for this athlete', 404);
  }

  const session = await loadDoblesSession({
    sql,
    self_athlete_id: auth.athlete_id,
    self_name: firstName(auth.full_name),
    assignment_id: parsed.data,
    partner_athlete_id: partner.athlete_id,
    partner_name: firstName(partner.full_name),
  });

  if (!session) {
    return jsonError('not_found', 'Assignment not found', 404);
  }

  return jsonOk(session);
}
