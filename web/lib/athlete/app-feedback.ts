import 'server-only';

// #59 — app_feedback: an athlete tells US (the product team) about a bug or a
// suggestion from inside the app. NOT coach-facing (that is #58). The DB row is
// the SOURCE OF TRUTH: it is always written first. A notification email to the
// team is a best-effort layer on top — if Resend is unconfigured or fails, we
// report it honestly and the row still stands (nothing half-sent).

import { z } from 'zod';
import { Resend } from 'resend';
import { sql as defaultSql, type Sql, type TransactionClient } from '@/lib/db';
import { AUTH_CONFIG } from '@/lib/auth/config';

/** Where the internal notification goes. Env-overridable; defaults to the team inbox. */
const NOTIFY_TO = process.env.APP_FEEDBACK_NOTIFY_EMAIL ?? 'hello@fahybrid.com';

/** Server-side validation for the POST body (trust nothing from the client). */
export const appFeedbackSchema = z.object({
  kind: z.enum(['suggestion', 'bug']),
  body: z.string().trim().min(1).max(2000),
  app_version: z.string().trim().max(60).nullish(),
  screen: z.string().trim().max(120).nullish(),
});

export type AppFeedbackInput = z.infer<typeof appFeedbackSchema>;

export interface RecordAppFeedbackResult {
  id: string;
  /** true when the team notification email was sent; false when skipped/failed. */
  email_sent: boolean;
  /** Present when the email was NOT sent, so the caller can log honestly. */
  email_skipped_reason?: 'resend_not_configured' | 'resend_send_failed';
}

/**
 * Persist one app_feedback row (source of truth), then best-effort notify the
 * team. Never throws on the email path — the row is the contract.
 */
export async function recordAppFeedback(params: {
  athleteUserId: number;
  input: AppFeedbackInput;
  sql?: Sql | TransactionClient;
}): Promise<RecordAppFeedbackResult> {
  const client = params.sql ?? defaultSql;
  const { athleteUserId, input } = params;

  const rows = await client<Array<{ id: string }>>`
    insert into app_feedback (athlete_user_id, kind, body, app_version, screen)
    values (
      ${athleteUserId},
      ${input.kind},
      ${input.body},
      ${input.app_version ?? null},
      ${input.screen ?? null}
    )
    returning id::text as id
  `;
  const id = rows[0]!.id;

  const email = await notifyTeam({ id, athleteUserId, input });
  return {
    id,
    email_sent: email.sent,
    ...(email.sent ? {} : { email_skipped_reason: email.reason }),
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function notifyTeam(args: {
  id: string;
  athleteUserId: number;
  input: AppFeedbackInput;
}): Promise<{ sent: true } | { sent: false; reason: 'resend_not_configured' | 'resend_send_failed' }> {
  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) return { sent: false, reason: 'resend_not_configured' };

  const { id, athleteUserId, input } = args;
  const kindLabel = input.kind === 'bug' ? 'Bug' : 'Sugerencia';
  const meta = [
    `Atleta (user id): ${athleteUserId}`,
    input.app_version ? `Versión: ${input.app_version}` : null,
    input.screen ? `Pantalla: ${input.screen}` : null,
    `Feedback #${id}`,
  ].filter((x): x is string => x != null);

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#0a0a0a;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;color:#f4f4f4;">
    <div style="font-size:11px;font-weight:800;letter-spacing:0.1em;color:#F06A2A;text-transform:uppercase;">App feedback · ${esc(kindLabel)}</div>
    <div style="margin:16px 0;padding:16px;background:#141414;border-radius:12px;border:1px solid #262626;white-space:pre-wrap;font-size:15px;line-height:1.6;color:#f4f4f4;">${esc(input.body)}</div>
    <div style="font-size:12px;color:#8a8a8a;line-height:1.6;">${meta.map(esc).join('<br>')}</div>
  </div>
</body></html>`;
  const text = `App feedback · ${kindLabel}\n\n${input.body}\n\n${meta.join('\n')}`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: AUTH_CONFIG.resendFromEmail(),
      to: NOTIFY_TO,
      subject: `App feedback · ${kindLabel}`,
      html,
      text,
    });
    if (error) return { sent: false, reason: 'resend_send_failed' };
    return { sent: true };
  } catch {
    return { sent: false, reason: 'resend_send_failed' };
  }
}
