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
import {
  loadDoblesSimulation,
  type DoblesSimulationDTO,
} from '@/lib/athlete/dobles-simulation';
import {
  resolveCanonicalDoblesPair,
  upsertAthleteSimulation,
  type CanonicalDoblesPair,
} from '@/lib/athlete/dobles-simulation-edit';
import { athleteSimulationPutSchema } from '@fahybrid/shared/schema/dobles-simulation';
import { resolveCoachTips } from '@/lib/coach/guidance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The athlete simulation payload + the coach's editable "consejos" for the
// simulation context (system defaults until the coach authors their own).
type DoblesSimulationWithTips = DoblesSimulationDTO & { coach_tips: string[] };

/** The reading athlete's own + partner's user id + name, from the canonical pair. */
function readerSides(pair: CanonicalDoblesPair): {
  self_user_id: bigint;
  partner_user_id: bigint;
  self_name: string | null;
  partner_name: string | null;
} {
  return pair.reader_is_a
    ? { self_user_id: pair.a_user_id, partner_user_id: pair.b_user_id, self_name: pair.a_name, partner_name: pair.b_name }
    : { self_user_id: pair.b_user_id, partner_user_id: pair.a_user_id, self_name: pair.b_name, partner_name: pair.a_name };
}

export async function GET(
  request: Request,
): Promise<NextResponse<DoblesSimulationWithTips | ApiError>> {
  const auth = await getAthleteSessionFromBearer(
    request.headers.get('authorization'),
  );
  if (!auth) {
    return jsonError('unauthorized', 'Athlete bearer token required', 401);
  }

  // A joint simulation requires an active Dobles TRAINING pair (doubles_pairs).
  // We resolve its CANONICAL orientation so the read + the athlete edit agree on
  // which side is A. Honest-empty (404) when there's no pair.
  const pair = await resolveCanonicalDoblesPair(auth.athlete_id, auth.user_id);
  if (!pair) {
    return jsonError('no_partner', 'No linked partner for this athlete', 404);
  }

  const sides = readerSides(pair);
  const [simulation, coach_tips] = await Promise.all([
    loadDoblesSimulation({
      self_user_id: sides.self_user_id,
      partner_user_id: sides.partner_user_id,
      self_name: sides.self_name,
      partner_name: sides.partner_name,
      coach_name: pair.coach_name,
    }),
    resolveCoachTips(pair.coach_id, 'sim_doubles'),
  ]);

  // Partner linked but nobody has authored a simulation → honest-empty.
  if (!simulation) {
    return jsonError('no_simulation', 'No simulation authored yet', 404);
  }

  return jsonOk({ ...simulation, coach_tips });
}

// PUT — the ATHLETE adjusts the pair's reparto (mig 0099). Self-centric body
// (self/partner/split per station); the edit module flips it to A-centric storage
// using the canonical orientation, stamps athlete provenance, and upserts the
// SINGLE shared row (last-write-wins — no approval flow). The change is instantly
// reflected in BOTH athletes' assignment-detail reparto (station_assignment).
export async function PUT(
  request: Request,
): Promise<NextResponse<DoblesSimulationWithTips | ApiError>> {
  const auth = await getAthleteSessionFromBearer(
    request.headers.get('authorization'),
  );
  if (!auth) {
    return jsonError('unauthorized', 'Athlete bearer token required', 401);
  }

  // Pair membership is the authorization: only an athlete IN the pair can edit it.
  const pair = await resolveCanonicalDoblesPair(auth.athlete_id, auth.user_id);
  if (!pair) {
    return jsonError('no_partner', 'No linked partner for this athlete', 404);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = athleteSimulationPutSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError('bad_request', 'Datos inválidos', 400, parsed.error.flatten());
  }

  await upsertAthleteSimulation({
    pair,
    editor_user_id: auth.user_id,
    input: parsed.data,
  });

  // Return the fresh, reader-centric DTO (+ provenance now = this athlete) so the
  // app updates in place without a second round-trip.
  const sides = readerSides(pair);
  const [simulation, coach_tips] = await Promise.all([
    loadDoblesSimulation({
      self_user_id: sides.self_user_id,
      partner_user_id: sides.partner_user_id,
      self_name: sides.self_name,
      partner_name: sides.partner_name,
      coach_name: pair.coach_name,
    }),
    resolveCoachTips(pair.coach_id, 'sim_doubles'),
  ]);
  if (!simulation) {
    return jsonError('internal', 'No se pudo cargar la simulación', 500);
  }
  return jsonOk({ ...simulation, coach_tips });
}
