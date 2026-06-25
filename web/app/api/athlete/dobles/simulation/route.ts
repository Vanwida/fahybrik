// GET /api/athlete/dobles/simulation
//
// The joint HYROX Doubles SIMULATION for the authenticated athlete and their
// linked partner: the coach-authored 8-station split strategy, resolved to the
// READER's perspective, plus the coach's one-line tactical note. Mirrors the
// iOS DoblesSimulation Codable contract (snake_case → convertFromSnakeCase).
//
// The coach authors it A/B-neutrally (PUT /api/coach/athletes/[id]/dobles-
// simulation, migration 0055): stored `self_share` is always athlete A's share.
// This route flips it so the bar reads from the caller's point of view (see
// lib/athlete/dobles-simulation.ts).
//
// Auth: athlete bearer (Sign in with Apple JWT) validated by
// getAthleteSessionFromBearer; an absent/invalid bearer yields 401.
//
// Honest-empty (the iOS view renders its empty state on a nil payload, never a
// fabricated strategy):
//   • no linked partner                  → 404 no_partner
//   • coach authored no simulation yet   → 404 no_simulation

import type { NextResponse } from 'next/server';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk, type ApiError } from '@/lib/api/responses';
import { loadPartner } from '@/lib/partner/invitations';
import {
  loadDoblesSimulation,
  type DoblesSimulationDTO,
} from '@/lib/athlete/dobles-simulation';

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
): Promise<NextResponse<DoblesSimulationDTO | ApiError>> {
  const auth = await getAthleteSessionFromBearer(
    request.headers.get('authorization'),
  );
  if (!auth) {
    return jsonError('unauthorized', 'Athlete bearer token required', 401);
  }

  // A joint simulation requires a linked Dobles partner (users.partner_id).
  const partner = await loadPartner(auth.user_id);
  if (!partner) {
    return jsonError('no_partner', 'No linked partner for this athlete', 404);
  }

  const simulation = await loadDoblesSimulation({
    self_user_id: auth.user_id,
    partner_user_id: partner.user_id,
    self_name: firstName(auth.full_name),
    partner_name: firstName(partner.full_name),
  });

  // Partner linked but the coach hasn't authored a simulation → honest-empty.
  if (!simulation) {
    return jsonError('no_simulation', 'No simulation authored yet', 404);
  }

  return jsonOk(simulation);
}
