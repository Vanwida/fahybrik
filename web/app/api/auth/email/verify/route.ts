import { z } from 'zod';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { consumeEmailLoginCode } from '@/lib/auth/email-code';
import { audiences, issueSession } from '@/lib/auth/session';
import { findAthleteByEmail } from '@/lib/auth/users';
import {
  redeemAthleteInvitationByEmail,
  type RedeemAthleteInvitationByEmailError,
} from '@/lib/athlete/invitations';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const verifySchema = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
  /**
   * Present when the athlete is ACTIVATING their account from an invitation link
   * (web /invite/[token] or the iOS claim screen). The verified code proves they
   * own `email`; the invite_token is then redeemed (account activated) iff that
   * email matches the invited account. Absent → a normal re-entry login.
   */
  invite_token: z.string().min(10).max(200).optional(),
});

/** Map redeem-by-email errors to HTTP status codes + athlete-facing ES copy. */
function inviteErrorResponse(error: RedeemAthleteInvitationByEmailError) {
  switch (error.code) {
    case 'token_expired':
      return jsonError('token_expired', 'La invitación ha caducado. Pídele a tu entrenador una nueva.', 410);
    case 'token_revoked':
      return jsonError('token_revoked', 'La invitación se ha anulado. Pídele a tu entrenador una nueva.', 410);
    case 'email_mismatch':
      return jsonError(
        'email_mismatch',
        'Ese email no coincide con el de tu invitación. Usa el email al que te invitó tu entrenador.',
        409,
      );
    case 'token_invalid':
    default:
      return jsonError('token_invalid', 'La invitación no es válida.', 404);
  }
}

/**
 * Passwordless athlete email login — STEP 2 (verify the code).
 *
 * On a correct, unexpired, unspent code, mints the SAME athlete session bearer as
 * Sign in with Apple. Two modes, by whether `invite_token` is present:
 *   - login (no token): find-only by email (LOGIN NEVER CREATES).
 *   - activation (token): redeem the invitation for the proven email — activates
 *     access (comp subscription) and marks it redeemed.
 * A wrong/expired/reused code → generic invalid_code; an invite problem → a
 * specific, non-enumerating error.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);

  const rl = await withRateLimit({
    scope: 'ip',
    identifier: ip ?? 'unknown',
    ...RATE_LIMITS.emailCodeVerify,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = verifySchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Email and a 6-digit code are required', 400, parsed.error.flatten());
  }
  const { email, code, invite_token } = parsed.data;

  const consumed = await consumeEmailLoginCode(email, code);
  if (!consumed.ok) {
    if (consumed.reason === 'too_many_attempts') {
      return jsonError('too_many_attempts', 'Demasiados intentos. Pide un código nuevo.', 429);
    }
    return jsonError('invalid_code', 'El código no es válido o ha caducado.', 400);
  }

  // Resolve the athlete: ACTIVATION (redeem the invite) vs LOGIN (find-only).
  let account: {
    user_id: bigint;
    athlete_id: bigint;
    email: string;
    full_name: string;
    onboarded_at: Date | null;
  };
  if (invite_token) {
    const redemption = await redeemAthleteInvitationByEmail({
      token: invite_token,
      verified_email: consumed.email,
    });
    if (!redemption.ok) {
      return inviteErrorResponse(redemption.error);
    }
    account = redemption.result;
  } else {
    // The code was valid → the account existed at request time. Re-resolve it
    // authoritatively (find-only). A race that removed the account falls back to
    // the same generic invalid_code.
    const found = await findAthleteByEmail(consumed.email);
    if (!found) {
      return jsonError('invalid_code', 'El código no es válido o ha caducado.', 400);
    }
    account = {
      user_id: found.user.id,
      athlete_id: found.athlete.id,
      email: found.user.email,
      full_name: found.athlete.full_name,
      onboarded_at: found.athlete.onboarded_at,
    };
  }

  const session = await issueSession({
    user_id: account.user_id,
    audience: audiences.athlete,
    ttl_seconds: AUTH_CONFIG.athleteSessionTtlSeconds,
    user_agent: req.headers.get('user-agent'),
    ip,
  });

  return jsonOk({
    user_id: account.user_id.toString(),
    athlete_id: account.athlete_id.toString(),
    session_token: session.token,
    expires_at: session.expires_at.toISOString(),
    email: account.email,
    full_name: account.full_name,
    onboarded_at: account.onboarded_at?.toISOString() ?? null,
  });
}
