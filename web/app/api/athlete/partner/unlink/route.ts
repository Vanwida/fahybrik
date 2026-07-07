import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { unlinkPartner } from '@/lib/partner/invitations';
import { unlinkDoublesPairForAthlete } from '@/lib/dashboard/coach/doubles-pairs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const unlinkSchema = z.object({
  user_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

/**
 * UNIFIED un-pair endpoint.
 *
 * ATHLETE-SELF (primary): an authenticated athlete (Bearer) unlinks THEIR OWN
 * pair. In ONE transaction we clear all three axes:
 *   1. dissolve the caller's active doubles_pairs (training),
 *   2. users.partner_id → null on both sides (account),
 *   3. subscriptions.partner_user_id → null on both sides (billing).
 *
 * HISTORY POLICY: executed JOINT sessions (workout_executions, incl. their
 * partner_athlete_id link, 0074) are CONSERVED — never deleted. Only
 * forward-looking pair surfaces (plan/session/simulation/analytics) stop showing
 * the partner, because they resolve through the now-absent active pair / cleared
 * partner_id. The shared history stands.
 *
 * COACH-SIDE (preserved): when no athlete Bearer is present, a coach session may
 * unlink a given user's billing partner link (legacy capability).
 */
export async function POST(req: Request) {
  // Athlete-self path takes precedence: athletes authenticate via Bearer, coaches
  // via cookie session, so these auth surfaces never collide.
  const athleteSession = await getAthleteSessionFromBearer(
    req.headers.get('authorization'),
  );
  if (athleteSession) {
    const result = await unlinkDoublesPairForAthlete({
      athlete_id: athleteSession.athlete_id,
      user_id: athleteSession.user_id,
    });
    if (!result.cleared_partner && result.dissolved_pair_id == null) {
      return jsonError('not_found', 'No tienes una pareja activa que deshacer.', 404);
    }
    return jsonOk({
      unlinked: true,
      dissolved_pair_id: result.dissolved_pair_id,
      user_id: result.self_user_id,
      former_partner_user_id: result.partner_user_id,
    });
  }

  // Coach-side (preserved): clears the billing partner link for a given user.
  const coachSession = await getCoachSession();
  if (!coachSession) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = unlinkSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid request body', 400, parsed.error.flatten());
  }

  let userId: bigint;
  try {
    userId = BigInt(parsed.data.user_id);
  } catch {
    return jsonError('invalid_request', 'user_id must be a numeric id', 400);
  }

  const result = await unlinkPartner(userId);
  if (!result) {
    return jsonError('not_found', 'User has no partner linked', 404);
  }

  return jsonOk({
    unlinked: true,
    user_id: result.user_id.toString(),
    former_partner_user_id: result.partner_user_id.toString(),
  });
}
