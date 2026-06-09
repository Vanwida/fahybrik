import { z } from 'zod';
import { verifyAppleIdToken } from '@/lib/auth/apple';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { audiences, issueSession } from '@/lib/auth/session';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';
import {
  redeemAthleteInvitation,
  type RedeemAthleteInvitationError,
} from '@/lib/athlete/invitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const redeemSchema = z.object({
  identity_token: z.string().min(20),
  invite_token: z.string().min(10).max(200),
  nonce: z.string().min(1).max(256).optional(),
});

/** Map typed redeem errors to HTTP status codes (per spec). */
function httpStatusFor(code: RedeemAthleteInvitationError['code']): number {
  switch (code) {
    case 'token_expired':
    case 'token_revoked':
      return 410;
    case 'invitation_already_claimed':
    case 'apple_id_already_linked':
      return 409;
    case 'token_invalid':
    default:
      return 404;
  }
}

/**
 * POST /api/athlete/invite/redeem
 *
 * Body: { identity_token, invite_token, nonce? }
 *
 * Verifies the Apple identity token server-side, redeems the athlete
 * invitation (binding apple_user_id onto the pre-provisioned target user), and
 * issues an athlete session — same response shape as the normal Apple sign-in.
 */
export async function POST(req: Request) {
  // Throttle redeem per IP — the token is the only secret, so cap guesses.
  const rl = await withRateLimit({
    scope: 'ip',
    identifier: getClientIp(req) ?? 'unknown',
    ...RATE_LIMITS.partnerRedeem,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = redeemSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid request body', 400, parsed.error.flatten());
  }

  let identity;
  try {
    identity = await verifyAppleIdToken({
      id_token: parsed.data.identity_token,
      ...(parsed.data.nonce !== undefined ? { expected_nonce: parsed.data.nonce } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'apple_token_invalid';
    return jsonError('apple_token_invalid', message, 401);
  }

  const redemption = await redeemAthleteInvitation({
    token: parsed.data.invite_token,
    apple_identity: { apple_user_id: identity.apple_user_id },
  });

  if (!redemption.ok) {
    return jsonError(
      redemption.error.code,
      redemption.error.message,
      httpStatusFor(redemption.error.code),
    );
  }

  const userAgent = req.headers.get('user-agent');
  const ip = getClientIp(req);
  const session = await issueSession({
    user_id: redemption.result.user_id,
    audience: audiences.athlete,
    ttl_seconds: AUTH_CONFIG.athleteSessionTtlSeconds,
    user_agent: userAgent,
    ip,
  });

  // Same shape as POST /api/auth/apple so the iOS client reuses one decoder.
  return jsonOk({
    user_id: redemption.result.user_id.toString(),
    athlete_id: redemption.result.athlete_id.toString(),
    session_token: session.token,
    expires_at: session.expires_at.toISOString(),
    email: redemption.result.email,
    is_private_email: identity.is_private_email,
    full_name: redemption.result.full_name,
    onboarded_at: redemption.result.onboarded_at?.toISOString() ?? null,
  });
}
