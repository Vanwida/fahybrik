import { z } from 'zod';
import { createEmailLoginCode, sendEmailLoginCode } from '@/lib/auth/email-code';
import { isFreeSignupEnabled } from '@/lib/auth/free-signup';
import { reviewAccessGate } from '@/lib/auth/review-access';
import { findAthleteByEmail } from '@/lib/auth/users';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  email: z.string().email().toLowerCase(),
});

/**
 * Passwordless athlete email login — STEP 1 (request a code).
 *
 * Enumeration-safe: the response is ALWAYS a generic 200 { ok: true }, whether or
 * not the email belongs to a member. A code is generated + emailed ONLY when a
 * member account exists (find-only, LOGIN NEVER CREATES). The caller can safely
 * advance to the code-entry screen every time.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req) ?? 'unknown';

  // Flood guard per IP first (cheap; no body parse needed).
  const rlIp = await withRateLimit({ scope: 'ip', identifier: ip, ...RATE_LIMITS.emailCodeRequest });
  if (!rlIp.allowed) return rateLimitResponse(rlIp);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'A valid email is required', 400, parsed.error.flatten());
  }
  const email = parsed.data.email;

  // Targeted-inbox-bomb guard per email (an attacker who knows a member's address
  // can't spam their inbox with codes).
  const rlEmail = await withRateLimit({
    scope: 'email',
    identifier: email,
    ...RATE_LIMITS.emailCodeRequest,
  });
  if (!rlEmail.allowed) return rateLimitResponse(rlEmail);

  // App Store review access (env-gated; invisible when unset). The reviewer has no
  // real mailbox, so for the review email we answer the SAME generic 200 WITHOUT
  // issuing/sending a one-time code: the fixed code (checked at /verify) is its only
  // credential, and skipping issuance avoids racing that fixed code. This changes
  // nothing for any other email or when the gate is not configured.
  const gate = reviewAccessGate();
  if (gate && email === gate.email) {
    return jsonOk({ ok: true });
  }

  // Find-only: only issue + send a code when a member account exists. Non-members
  // fall through to the same generic response (no code, no email, no leak).
  // Con FREE_SIGNUP encendido el alta está abierta: el código se emite IGUAL
  // para un email sin cuenta (verify la creará al probar el buzón). La respuesta
  // genérica no cambia en ningún caso → la enumeración sigue siendo imposible.
  const account = await findAthleteByEmail(email);
  if (account || isFreeSignupEnabled()) {
    const { code_plaintext, expires_at } = await createEmailLoginCode(email, { requested_ip: ip });
    await sendEmailLoginCode({
      to: email,
      code: code_plaintext,
      expires_at,
      coach_id: account?.athlete.coach_id ?? null,
    });
  }

  return jsonOk({ ok: true });
}
