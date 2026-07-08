import { createHash, randomInt } from 'node:crypto';
import { Resend } from 'resend';
import { sql } from '../db';
import { AUTH_CONFIG } from './config';

// Passwordless athlete EMAIL-CODE login (iOS). The email sibling of magic-link.ts
// (coach). A 6-digit one-time code is emailed; only its salted sha256 is stored
// (email_login_codes, migration 0111). The verify path mints the SAME athlete
// session bearer as Sign in with Apple. See lib/auth/users.ts#findAthleteByEmail
// for the find-only account resolution (LOGIN NEVER CREATES).

const CODE_TTL_SECONDS = AUTH_CONFIG.emailLoginCodeTtlSeconds;
const MAX_ATTEMPTS = AUTH_CONFIG.emailLoginCodeMaxAttempts;

/** Brand-orange from lib/leads/email-shell.ts, inlined (mail clients strip CSS vars). */
const BRAND_INK = '#0a0a0a';
const BRAND_ORANGE = '#F06A2A';

/**
 * Salted hash of the code at rest: sha256(email || ':' || code). Binding the
 * hash to the (normalized) email means one code can't be replayed against a
 * different email and blunts precomputed rainbow tables over the tiny 6-digit
 * space. Only this hash is ever persisted; the plaintext code only reaches the
 * athlete's inbox.
 */
function hashCode(email: string, code: string): string {
  return createHash('sha256').update(`${email.toLowerCase()}:${code}`).digest('hex');
}

/** A cryptographically-random 6-digit code, zero-padded (e.g. "004271"). */
export function generateEmailLoginCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export interface CreateEmailLoginCodeResult {
  code_plaintext: string;
  expires_at: Date;
}

/**
 * Issue a fresh login code for `email`. Any still-active code for the same email
 * is invalidated first (consumed_at = now) so ONLY the newest code is ever valid
 * — a "reenviar" supersedes the prior one. Callers MUST have already confirmed a
 * member account exists for the email (find-only); this function does not check.
 */
export async function createEmailLoginCode(
  email: string,
  options: { requested_ip?: string | null } = {},
): Promise<CreateEmailLoginCodeResult> {
  const normalized = email.toLowerCase();
  const code = generateEmailLoginCode();
  const codeHash = hashCode(normalized, code);
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000);

  await sql.begin(async (tx) => {
    // Supersede any prior unspent code for this email — only the newest works.
    await tx`
      update email_login_codes
      set consumed_at = now()
      where email = ${normalized} and consumed_at is null
    `;
    await tx`
      insert into email_login_codes (email, code_sha256, expires_at, requested_ip)
      values (${normalized}, ${codeHash}, ${expiresAt}, ${options.requested_ip ?? null})
    `;
  });

  return { code_plaintext: code, expires_at: expiresAt };
}

export type ConsumeEmailLoginCodeResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'invalid' | 'too_many_attempts' };

/**
 * Verify a submitted code for `email` and, on success, mark it spent (single-use).
 * Runs in one transaction with `for update` so two concurrent verifies can't both
 * pass. Semantics:
 *   - no active (unspent, unexpired) code for the email → { ok:false, invalid }.
 *   - once a code has burned MAX_ATTEMPTS wrong guesses it is invalidated
 *     (consumed) and every further try → { ok:false, too_many_attempts }.
 *   - wrong code → attempts++ → { ok:false, invalid }.
 *   - correct code → consumed → { ok:true, email }.
 * `invalid` deliberately does NOT distinguish wrong / expired / never-existed, so
 * a non-member email (which never has a code) is indistinguishable from a bad code.
 */
export async function consumeEmailLoginCode(
  email: string,
  code: string,
): Promise<ConsumeEmailLoginCodeResult> {
  const normalized = email.toLowerCase();
  const expectedHash = hashCode(normalized, code);

  return await sql.begin(async (tx) => {
    const rows = await tx<{ id: string; code_sha256: string; attempts: number }[]>`
      select id::text as id, code_sha256, attempts
      from email_login_codes
      where email = ${normalized}
        and consumed_at is null
        and expires_at > now()
      order by created_at desc
      limit 1
      for update
    `;
    const row = rows[0];
    if (!row) return { ok: false, reason: 'invalid' } as const;

    const nextAttempts = row.attempts + 1;

    // Cap reached: invalidate the code and refuse (before any hash comparison).
    if (nextAttempts > MAX_ATTEMPTS) {
      await tx`
        update email_login_codes
        set consumed_at = now(), attempts = ${nextAttempts}
        where id = ${BigInt(row.id)}
      `;
      return { ok: false, reason: 'too_many_attempts' } as const;
    }

    if (row.code_sha256 !== expectedHash) {
      await tx`
        update email_login_codes
        set attempts = ${nextAttempts}
        where id = ${BigInt(row.id)}
      `;
      return { ok: false, reason: 'invalid' } as const;
    }

    // Correct: burn it (single-use).
    await tx`
      update email_login_codes
      set consumed_at = now(), attempts = ${nextAttempts}
      where id = ${BigInt(row.id)}
    `;
    return { ok: true, email: normalized } as const;
  });
}

export interface SendEmailLoginCodeResult {
  sent: boolean;
  skipped_reason?: 'resend_not_configured' | 'resend_send_failed';
}

/**
 * Email the plaintext code to the athlete. Guarded like the citas/leads senders:
 * a missing key or send failure logs + returns { sent:false } instead of throwing,
 * so a delivery hiccup never 500s the request (and, since the request always
 * answers generically, never leaks whether the email exists).
 */
export async function sendEmailLoginCode(input: {
  to: string;
  code: string;
  expires_at: Date;
}): Promise<SendEmailLoginCodeResult> {
  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) {
    console.warn('[auth/email-code] RESEND_API_KEY not configured — skipping', { to: input.to });
    return { sent: false, skipped_reason: 'resend_not_configured' };
  }

  const minutes = Math.max(1, Math.round((input.expires_at.getTime() - Date.now()) / 60_000));
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: AUTH_CONFIG.resendFromEmail(),
    to: input.to,
    subject: `${input.code} es tu código de acceso · FAHYBRID`,
    text:
      `Tu código para entrar en FAHYBRID es:\n\n${input.code}\n\n` +
      `Caduca en ${minutes} minutos y solo se puede usar una vez.\n\n` +
      `Si no lo has pedido, ignora este email.`,
    html:
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:${BRAND_INK};background:#fff;">` +
      `<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_ORANGE};">FAHYBRID</p>` +
      `<h1 style="margin:8px 0 14px;font-size:22px;">Tu código de acceso</h1>` +
      `<p style="margin:0 0 16px;line-height:1.6;">Introduce este código en la app para entrar:</p>` +
      `<p style="margin:0 0 16px;font-size:34px;font-weight:800;letter-spacing:0.28em;color:${BRAND_INK};">${input.code}</p>` +
      `<p style="margin:0 0 8px;font-size:13px;color:#666;line-height:1.6;">Caduca en ${minutes} minutos y solo se puede usar una vez.<br>Si no lo has pedido, ignora este email.</p>` +
      `</div>`,
  });

  if (error) {
    console.error('[auth/email-code] send failed', { to: input.to, error: error.message });
    return { sent: false, skipped_reason: 'resend_send_failed' };
  }
  return { sent: true };
}
