import { getCoachSession } from '@/lib/auth/coach-session';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/coach/deep-dive-types';
import { createAthleteInvitation } from '@/lib/athlete/invitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/coach/athletes/[id]/invite
 *
 * Coach-authenticated. Mints (or rotates) an athlete account-claim invitation
 * for an athlete the coach owns, returning the deeplink + plaintext token + the
 * expiry. The plaintext token is surfaced ONCE here (for the coach to share);
 * only its hash is stored.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  // getCoachSession enforces the Origin/CSRF check for cookie-authed requests.
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }

  const { id } = await ctx.params;
  const idParsed = AthleteIdParamSchema.safeParse({ id });
  if (!idParsed.success) {
    return jsonError('bad_request', 'invalid athlete id', 400, idParsed.error.flatten());
  }
  if (idParsed.data.id.startsWith('demo-')) {
    return jsonError('demo_athlete', 'no se pueden invitar atletas demo', 400);
  }

  const athleteId = BigInt(idParsed.data.id);

  const created = await createAthleteInvitation({
    athlete_id: athleteId,
    coach_id: session.coach_id,
  });

  if (!created.ok) {
    // athlete_not_found / athlete_not_owned both surface as 404 so we don't
    // disclose the existence of other coaches' athletes.
    if (created.error.code === 'athlete_already_linked') {
      return jsonError(created.error.code, created.error.message, 409);
    }
    return jsonError('not_found', 'Athlete not found', 404);
  }

  const token = created.result.token;
  const inviteUrl = `${AUTH_CONFIG.appUrl()}/invite/${encodeURIComponent(token)}`;

  return jsonOk(
    {
      invite_url: inviteUrl,
      token,
      expires_at: created.result.expires_at.toISOString(),
    },
    201,
  );
}
