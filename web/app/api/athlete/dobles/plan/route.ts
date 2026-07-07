// GET /api/athlete/dobles/plan
//
// The Dobles CONNECTED PLAN for the authenticated athlete and their linked
// partner: the self athlete's week alongside a read-only view of the partner's
// week, each day tagged with how the two share that session (joint-mandatory
// sim / optional-together / both-done / each-own / rest). Drives the iOS hub
// (DoblesPlanView) and, through `train_together_session_id`, the "Entrenar a la
// vez" screen. Mirrors the iOS DoblesConnectedPlan Codable contract (snake_case
// → convertFromSnakeCase).
//
// Both weeks come from the SAME resolver the individual "Tu semana" uses
// (lib/athlete/week-plan.ts) so the two surfaces never diverge; the togetherness
// classification is a pure mapping over the two weeks (lib/athlete/dobles-plan.ts).
//
// Auth: athlete bearer (Sign in with Apple JWT) validated by
// getAthleteSessionFromBearer; an absent/invalid bearer yields 401.
//
// Honest-empty (the iOS view renders its empty state on a nil payload, never a
// fabricated week):
//   • no linked partner → 404 no_partner

import type { NextResponse } from 'next/server';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk, type ApiError } from '@/lib/api/responses';
import { loadDoublesTrainingPartner } from '@/lib/athlete/doubles-training-partner';
import { buildAthleteWeekPlan } from '@/lib/athlete/week-plan';
import {
  buildDoblesConnectedPlan,
  type DoblesConnectedPlanDTO,
} from '@/lib/athlete/dobles-plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** First word of a full name, for the per-athlete display label. */
function firstName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export async function GET(
  request: Request,
): Promise<NextResponse<DoblesConnectedPlanDTO | ApiError>> {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) {
    return jsonError('unauthorized', 'Athlete bearer token required', 401);
  }

  // A connected plan requires an active Dobles TRAINING pair (doubles_pairs),
  // not the billing partner link. Honest-empty (404) when there's no pair.
  const partner = await loadDoublesTrainingPartner(auth.athlete_id);
  if (!partner) {
    return jsonError('no_partner', 'No linked partner for this athlete', 404);
  }

  // Both athletes' current week from the shared resolver. The training pair
  // always references an existing athlete row, so the partner week resolves.
  const selfWeek = await buildAthleteWeekPlan(auth.athlete_id, 0);
  const partnerWeek = await buildAthleteWeekPlan(partner.partner_athlete_id, 0);

  const plan = buildDoblesConnectedPlan({
    selfWeek,
    partnerWeek,
    self_name: firstName(auth.full_name),
    partner_name: firstName(partner.partner_full_name),
  });

  return jsonOk(plan);
}
