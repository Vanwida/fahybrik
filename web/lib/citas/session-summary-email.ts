import 'server-only';

import { Resend } from 'resend';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { resolveClubEmailSkin } from '@/lib/coach/club-skin';

// Post-call summary email (#11) — sent to the lead after the videollamada, from the
// coach's session report (notes + next steps). The coach previews/edits the text at
// send time WITHOUT touching the saved parte. Reinforces conversion + leaves the
// proposal/price in writing. Guarded: on a Resend failure the parte is untouched and
// the caller does NOT stamp summary_email_sent_at.

export interface SendSessionSummaryInput {
  to: string;
  name: string | null;
  /** The discussion recap (coach-edited at send time). */
  summary: string;
  /** Optional next steps line. */
  nextSteps?: string | null;
  /** El coach que envía este resumen — pinta su piel (nombre + acento) en vez de la
   *  marca de este binario. Ausente/nulo → marca de este binario, como hoy. */
  coach_id?: bigint | number | null;
}

export interface SendSessionSummaryResult {
  sent: boolean;
  skipped_reason?: 'resend_not_configured' | 'resend_send_failed' | 'empty';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Preserve the coach's line breaks in HTML. */
function toHtmlParagraphs(text: string): string {
  return esc(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#d4d4d4;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export async function sendSessionSummaryEmail(input: SendSessionSummaryInput): Promise<SendSessionSummaryResult> {
  const summary = input.summary.trim();
  if (!summary) return { sent: false, skipped_reason: 'empty' };

  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) return { sent: false, skipped_reason: 'resend_not_configured' };

  const skin = await resolveClubEmailSkin(input.coach_id ?? null);
  const firstName = input.name?.trim().split(/\s+/)[0] || '';
  const greeting = firstName ? `Hola ${esc(firstName)},` : 'Hola,';
  const next = input.nextSteps?.trim();

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#0a0a0a;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;color:#f4f4f4;">
    <div style="font-style:italic;font-weight:800;letter-spacing:0.14em;font-size:13px;color:${skin.dark.text};text-transform:uppercase;">${esc(skin.wordmark)}</div>
    <h1 style="font-style:italic;font-weight:900;font-size:24px;line-height:1.15;margin:14px 0 12px;">${greeting}</h1>
    <p style="font-size:15px;line-height:1.6;color:#d4d4d4;margin:0 0 14px;">Un resumen de lo que hablamos:</p>
    ${toHtmlParagraphs(summary)}
    ${
      next
        ? `<div style="margin:18px 0 0;padding:14px 16px;background:#141414;border-radius:12px;border:1px solid #262626;">
             <div style="font-size:11px;font-weight:800;letter-spacing:0.1em;color:${skin.dark.text};text-transform:uppercase;margin-bottom:6px;">Próximos pasos</div>
             <div style="font-size:15px;line-height:1.55;color:#f4f4f4;">${esc(next).replace(/\n/g, '<br>')}</div>
           </div>`
        : ''
    }
    <p style="margin:24px 0 0;font-size:13px;color:#8a8a8a;">Cualquier duda, respóndeme a este email.</p>
  </div>
</body></html>`;

  const text = `${greeting}

Un resumen de lo que hablamos:

${summary}${next ? `\n\nPróximos pasos:\n${next}` : ''}

Cualquier duda, respóndeme a este email.`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: AUTH_CONFIG.resendFromEmail(),
      to: input.to,
      subject: `Resumen de tu llamada con ${skin.wordmark}`,
      html,
      text,
    });
    if (error) return { sent: false, skipped_reason: 'resend_send_failed' };
    return { sent: true };
  } catch {
    return { sent: false, skipped_reason: 'resend_send_failed' };
  }
}
