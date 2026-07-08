import { z } from 'zod';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { consumeEmailLoginCode } from '@/lib/auth/email-code';
import { audiences, issueSession } from '@/lib/auth/session';
import { findAthleteByEmail } from '@/lib/auth/users';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const verifySchema = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
});

/**
 * Passwordless athlete email login — STEP 2 (verify the code).
 *
 * On a correct, unexpired, unspent code for a member email, mints the SAME athlete
 * session bearer as Sign in with Apple (same audience, TTL, sessions row) and
 * returns the SAME response shape the iOS client already decodes. A wrong / expired
 * / reused code (or a non-member email, which never has a code) → generic 400
 * invalid_code — never revealing whether the email exists.
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
  const { email, code } = parsed.data;

  const consumed = await consumeEmailLoginCode(email, code);
  if (!consumed.ok) {
    if (consumed.reason === 'too_many_attempts') {
      return jsonError(
        'too_many_attempts',
        'Demasiados intentos. Pide un código nuevo.',
        429,
      );
    }
    return jsonError('invalid_code', 'El código no es válido o ha caducado.', 400);
  }

  // The code was valid → the account existed at request time. Re-resolve it
  // authoritatively (find-only) to mint the session. A race that removed the
  // account in between falls back to the same generic invalid_code.
  const account = await findAthleteByEmail(consumed.email);
  if (!account) {
    return jsonError('invalid_code', 'El código no es válido o ha caducado.', 400);
  }

  const session = await issueSession({
    user_id: account.user.id,
    audience: audiences.athlete,
    ttl_seconds: AUTH_CONFIG.athleteSessionTtlSeconds,
    user_agent: req.headers.get('user-agent'),
    ip,
  });

  return jsonOk({
    user_id: account.user.id.toString(),
    athlete_id: account.athlete.id.toString(),
    session_token: session.token,
    expires_at: session.expires_at.toISOString(),
    email: account.user.email,
    full_name: account.athlete.full_name,
    onboarded_at: account.athlete.onboarded_at?.toISOString() ?? null,
  });
}
