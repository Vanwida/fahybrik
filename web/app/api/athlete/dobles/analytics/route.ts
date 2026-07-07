// GET /api/athlete/dobles/analytics
//
// Shared analytics for the authenticated athlete and their linked Dobles
// partner, built from each athlete's OWN imported single HYROX races (the
// `races` rows with source = 'hyrox_import'). Returns:
//   • best_self / best_partner — each athlete's fastest individual finish
//   • head_to_head[]           — per-station times, self vs partner (best races)
//   • contributions[]          — "who's stronger" per discipline group (self_share)
//   • weekly[]                 — friendly per-athlete comparison (best HYROX + 7-day volume)
//   • doubles_mark / doubles_delta — null (no joint result exists, by decision)
// Mirrors the iOS DoblesSharedAnalytics Codable contract (snake_case).
//
// Auth: athlete bearer (HS256, iss=fahybrik, aud=fahybrik-ios) validated by
// getAthleteSessionFromBearer; an absent/invalid bearer yields 401.
//
// Honest-empty (the iOS view renders its empty state on a nil payload):
//   • no linked partner            → 404 no_partner
//   • neither athlete imported a race → 404 no_data
// We NEVER fabricate marks: a missing side reads null in the contract.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadDoublesTrainingPartner } from '@/lib/athlete/doubles-training-partner';
import { buildDoblesSharedAnalytics } from '@/lib/athlete/dobles-analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** First word of a full name, for the partner column label. */
function firstName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete bearer token required', 401);

  // Shared analytics require an active Dobles TRAINING pair (doubles_pairs),
  // not the billing partner link. Honest-empty (404) when there's no pair.
  const partner = await loadDoublesTrainingPartner(auth.athlete_id);
  if (!partner) {
    return jsonError('no_partner', 'No linked partner for this athlete', 404);
  }

  const analytics = await buildDoblesSharedAnalytics({
    self_athlete_id: auth.athlete_id,
    partner_athlete_id: partner.partner_athlete_id,
    partner_name: firstName(partner.partner_full_name),
  });

  // Neither athlete has an imported race → honest-empty.
  if (!analytics) {
    return jsonError('no_data', 'No imported races to compare yet', 404);
  }

  return jsonOk(analytics);
}
