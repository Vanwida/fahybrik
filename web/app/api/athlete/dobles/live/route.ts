// POST/GET /api/athlete/dobles/live — LIVE PRESENCE between the two athletes of a
// doubles TRAINING pair (Peloton-style: each in their own gym, each phone sees how
// the other is going). Ephemeral: one upserted row per athlete (0128), never history.
//
//   POST = the athlete's OWN heartbeat, sent by iOS ~every 5 s during the workout.
//   GET  = the PARTNER's latest presence, with a server-computed age_s so the client
//          can render "hace X s" / "sin señal".
//
// Auth: athlete bearer. A doubles TRAINING pair (doubles_pairs — the training
// instrument, NOT the billing users.partner_id) is required on BOTH verbs: without
// one this isn't a joint session (404 no_partner), mirroring the joint-log route.
// The ownership check, the self_only privacy gate, and the finished-only
// normalization live in lib/athlete/dobles-live.ts.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadDoublesTrainingPartner } from '@/lib/athlete/doubles-training-partner';
import {
  liveStatusInputSchema,
  loadPartnerLiveStatus,
  saveDoblesLiveStatus,
} from '@/lib/athlete/dobles-live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Nombre de pila — first whitespace-delimited token, '' when unset. */
function firstName(fullName: string | null | undefined): string {
  const trimmed = fullName?.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? '';
}

export async function POST(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete bearer token required', 401);

  // A joint session needs an active Dobles TRAINING pair — without one this isn't a
  // joint log, so an honest 404 rather than emitting presence into the void.
  const partner = await loadDoublesTrainingPartner(auth.athlete_id);
  if (!partner) return jsonError('no_partner', 'No linked partner for this athlete', 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }
  const parsed = liveStatusInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  const result = await saveDoblesLiveStatus({
    athleteId: Number(auth.athlete_id),
    input: parsed.data,
  });
  if (!result.ok) {
    if (result.reason === 'session_private') {
      return jsonError(
        'session_private',
        'Esta sesión está marcada como privada; no se emite presencia.',
        409,
      );
    }
    return jsonError('not_found', 'Assignment not found', 404);
  }
  return jsonOk({ saved: true });
}

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete bearer token required', 401);

  const partner = await loadDoublesTrainingPartner(auth.athlete_id);
  if (!partner) return jsonError('no_partner', 'No linked partner for this athlete', 404);

  const status = await loadPartnerLiveStatus({
    partnerAthleteId: Number(partner.partner_athlete_id),
    partnerName: firstName(partner.partner_full_name),
  });
  return jsonOk(status);
}
