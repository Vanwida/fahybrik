import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { unlinkPartner } from '@/lib/partner/invitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const unlinkSchema = z.object({
  user_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

/**
 * Coach-only: unlinks a Dobles partner pair. Athletes cannot unilaterally
 * unlink (it would imply cancelling the shared subscription, which must go
 * through Stripe → cascade in W5).
 *
 * If an athlete bearer is present, we return 403 with a clear message.
 * If neither auth surface is present, 401.
 */
export async function POST(req: Request) {
  const coachSession = await getCoachSession();
  if (!coachSession) {
    // Detect whether the caller is at least an athlete to return a more
    // informative error.
    const athleteSession = await getAthleteSessionFromBearer(
      req.headers.get('authorization'),
    );
    if (athleteSession) {
      return jsonError(
        'forbidden',
        'Athletes cannot unilaterally unlink. Cancel the Dobles subscription instead.',
        403,
      );
    }
    return jsonError('unauthorized', 'Coach session required', 401);
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
