import 'server-only';

import { Resend } from 'resend';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { APP_STORE_URL } from '@/lib/invites/deeplinks';

// Alta / access email (funnel #5) — sent to the athlete when their access is
// ready: right away on a COMP alta, and after payment on the STRIPE path (the
// webhook). The account already exists (created at alta with the onboarding
// email) and access is active, so there is NOTHING to "claim" on the web: the
// only way in is the app. This email tells them exactly that — download the app
// and sign in with THEIR email; a one-time code lets them in.
//
// Honest copy: the App Store button is only shown when APP_STORE_URL is set (it
// is an empty placeholder pre-launch) — we never promise a store link that 404s.

export interface SendAltaEmailInput {
  to: string;
  name: string;
}

export interface SendAltaEmailResult {
  sent: boolean;
  skipped_reason?: 'resend_not_configured' | 'resend_send_failed';
}

/** Minimal HTML escape for values interpolated into the template. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendAltaEmail(input: SendAltaEmailInput): Promise<SendAltaEmailResult> {
  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) {
    // No key in this env (local/dev): the alta itself still succeeded; the coach
    // can resend once email is configured.
    return { sent: false, skipped_reason: 'resend_not_configured' };
  }

  const firstName = input.name.trim().split(/\s+/)[0] || '';
  const greeting = firstName ? `Hola ${esc(firstName)},` : 'Hola,';
  const email = input.to;

  const storeCta =
    APP_STORE_URL.trim().length > 0
      ? `<a href="${esc(APP_STORE_URL)}"
           style="display:inline-block;margin:22px 0 6px;background:#F06A2A;color:#0a0a0a;font-weight:800;font-size:16px;text-decoration:none;padding:14px 26px;border-radius:999px;">
          Descargar en App Store →
        </a>`
      : `<p style="margin:22px 0 6px;font-size:14px;color:#8a8a8a;">Te avisaremos en cuanto la app esté disponible para descargar.</p>`;

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#0a0a0a;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;color:#f4f4f4;">
    <div style="font-style:italic;font-weight:800;letter-spacing:0.14em;font-size:13px;color:#F06A2A;text-transform:uppercase;">FAHYBRID</div>
    <h1 style="font-style:italic;font-weight:900;font-size:26px;line-height:1.1;margin:14px 0 8px;">${greeting}</h1>
    <p style="font-size:16px;line-height:1.55;color:#d4d4d4;margin:0 0 8px;">
      Ya tienes tu sitio en FAHYBRID. Descarga la app y entra con tu email:
    </p>
    <p style="font-size:16px;line-height:1.55;color:#f4f4f4;margin:0 0 4px;font-weight:700;">${esc(email)}</p>
    <p style="font-size:15px;line-height:1.55;color:#9a9a9a;margin:0;">
      Te llegará un código de un solo uso para acceder — sin contraseñas.
    </p>
    ${storeCta}
    <p style="margin:28px 0 0;font-size:13px;color:#6f6f6f;">Nos vemos dentro.</p>
  </div>
</body></html>`;

  const text = `${greeting}

Ya tienes tu sitio en FAHYBRID. Descarga la app y entra con tu email:

${email}

Te llegará un código de un solo uso para acceder — sin contraseñas.

Nos vemos dentro.`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: AUTH_CONFIG.resendFromEmail(),
      to: input.to,
      subject: 'Ya tienes tu sitio en FAHYBRID',
      html,
      text,
    });
    if (error) return { sent: false, skipped_reason: 'resend_send_failed' };
    return { sent: true };
  } catch {
    return { sent: false, skipped_reason: 'resend_send_failed' };
  }
}
