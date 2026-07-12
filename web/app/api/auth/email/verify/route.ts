import { z } from 'zod';
import type { NextResponse } from 'next/server';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { consumeEmailLoginCode } from '@/lib/auth/email-code';
import { constantTimeEqual, reviewAccessGate } from '@/lib/auth/review-access';
import { audiences, issueSession } from '@/lib/auth/session';
import { findAthleteByEmail, type AppleAuthResult } from '@/lib/auth/users';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const verifySchema = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
});

/** The generic 400 for a bad/expired/reused code — also returned for a non-member
 *  email, so the response never reveals whether an email exists. */
function invalidCode(): NextResponse {
  return jsonError('invalid_code', 'El código no es válido o ha caducado.', 400);
}

/**
 * Mint the athlete session bearer + the EXACT response body the iOS client decodes.
 * Single source shared by the normal email-code path and the App Review gate so the
 * two can never drift; same audience / TTL / sessions row as Sign in with Apple.
 */
async function issueAthleteSession(
  account: AppleAuthResult,
  req: Request,
  ip: string | null,
): Promise<NextResponse> {
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

  // App Store review access (env-gated; invisible when unset). Checked BEFORE the
  // strict 6-digit schema so the reviewer's fixed alphanumeric code is accepted —
  // but ONLY for the review email. For that email the fixed code is the sole
  // credential (request never issues a real one-time code for it): a match mints
  // the same athlete session as the normal path; any other code → the same generic
  // 400 as a bad code. This opens NOTHING for other emails — a different email
  // carrying the fixed code falls through to the normal path (where it can never
  // match a real code hash) and gets the usual reject.
  const gate = reviewAccessGate();
  if (gate) {
    const rawEmail =
      typeof (payload as { email?: unknown })?.email === 'string'
        ? (payload as { email: string }).email.trim().toLowerCase()
        : null;
    if (rawEmail && rawEmail === gate.email) {
      const rawCode =
        typeof (payload as { code?: unknown })?.code === 'string'
          ? (payload as { code: string }).code
          : '';
      if (!constantTimeEqual(rawCode, gate.code)) {
        return invalidCode();
      }
      const account = await findAthleteByEmail(gate.email);
      if (!account) {
        return invalidCode();
      }
      return issueAthleteSession(account, req, ip);
    }
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
    return invalidCode();
  }

  // The code was valid → the account existed at request time. Re-resolve it
  // authoritatively (find-only) to mint the session. A race that removed the
  // account in between falls back to the same generic invalid_code.
  const account = await findAthleteByEmail(consumed.email);
  if (!account) {
    return invalidCode();
  }

  return issueAthleteSession(account, req, ip);
}
