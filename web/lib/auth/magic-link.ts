import { createHash, randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { sql } from '../db';
import { AUTH_CONFIG } from './config';

/**
 * Is this email allowed to sign in as a coach?
 *
 * Source of truth is the `coach_allowlist` DB table (migration 0040, status
 * workflow added in 0041) so coaches can be approved self-serve from the admin
 * surface with no redeploy. Only an email whose row is status='approved' passes
 * the DB check. The COACH_ALLOWLIST env var is still honoured (compat /
 * break-glass): an email passes if it's in EITHER. If the DB lookup throws
 * (transient outage), we don't fail open — we fall back to the env allowlist
 * only.
 */
export async function isCoachAllowlisted(email: string): Promise<boolean> {
  const normalized = email.toLowerCase();

  if (AUTH_CONFIG.coachAllowlist().includes(normalized)) {
    return true;
  }

  try {
    const rows = await sql<{ ok: boolean }[]>`
      select true as ok from coach_allowlist
      where email = ${normalized} and status = 'approved' limit 1
    `;
    return rows.length > 0;
  } catch (err) {
    // Don't fail open: a DB error means we can only trust the env allowlist
    // (already checked above → false here). Surface for observability.
    console.error('[isCoachAllowlisted] db lookup failed, env-only fallback', err);
    return false;
  }
}

function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export interface CreateMagicLinkResult {
  token_plaintext: string;
  expires_at: Date;
}

export async function createMagicLink(
  email: string,
  options: { requested_ip?: string | null } = {},
): Promise<CreateMagicLinkResult> {
  const tokenPlaintext = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(tokenPlaintext);
  const expiresAt = new Date(Date.now() + AUTH_CONFIG.magicLinkTtlSeconds * 1000);

  await sql`
    insert into magic_link_tokens (email, token_hash, expires_at, requested_ip)
    values (${email.toLowerCase()}, ${tokenHash}, ${expiresAt}, ${options.requested_ip ?? null})
  `;

  return { token_plaintext: tokenPlaintext, expires_at: expiresAt };
}

export interface ConsumeMagicLinkResult {
  email: string;
}

export async function consumeMagicLink(plaintext: string): Promise<ConsumeMagicLinkResult | null> {
  if (!plaintext) return null;
  const tokenHash = hashToken(plaintext);

  const rows = await sql<{ id: string; email: string; expires_at: Date; used_at: Date | null }[]>`
    update magic_link_tokens
    set used_at = now()
    where token_hash = ${tokenHash}
      and used_at is null
      and expires_at > now()
    returning id::text as id, email, expires_at, used_at
  `;

  const row = rows[0];
  if (!row) return null;
  return { email: row.email };
}

export async function sendMagicLinkEmail(input: {
  to: string;
  link: string;
  expires_at: Date;
}): Promise<void> {
  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const resend = new Resend(apiKey);
  const minutes = Math.max(
    1,
    Math.round((input.expires_at.getTime() - Date.now()) / 60_000),
  );

  const { error } = await resend.emails.send({
    from: AUTH_CONFIG.resendFromEmail(),
    to: input.to,
    subject: 'Your Fahybrik sign-in link',
    text: `Click to sign in to the Fahybrik coach dashboard:\n\n${input.link}\n\nThis link expires in ${minutes} minutes and can only be used once.\n\nIf you didn't request this, ignore this email.`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0a0a0a;">
        <h1 style="margin:0 0 12px;font-size:22px;letter-spacing:-0.01em;">Fahybrik · Coach sign-in</h1>
        <p style="margin:0 0 20px;line-height:1.5;">Click below to sign in to the dashboard.</p>
        <p style="margin:0 0 28px;">
          <a href="${input.link}" style="display:inline-block;padding:12px 20px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Sign in</a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#666;line-height:1.5;">
          This link expires in ${minutes} minutes and can only be used once.<br>
          If you didn't request it, ignore this email.
        </p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`resend_send_failed: ${error.message}`);
  }
}
