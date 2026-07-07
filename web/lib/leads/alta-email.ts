import 'server-only';

import { Resend } from 'resend';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { APP_STORE_URL } from '@/lib/invites/deeplinks';

// Alta email (funnel #5) — sent to the lead when the coach gives them the alta. It
// carries the invite universal link (/invite/[token]): tapping it on the phone opens
// the app if installed, else the landing page which handles the download + claim.
//
// Honest copy: the App Store listing link is only shown when APP_STORE_URL is set
// (it is an empty placeholder pre-launch) — we never promise a store link that 404s.

export interface SendAltaEmailInput {
  to: string;
  name: string;
  /** Public universal link `${appUrl}/invite/${token}`. */
  inviteUrl: string;
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
  const url = input.inviteUrl;

  const storeLine =
    APP_STORE_URL.trim().length > 0
      ? `<p style="margin:14px 0 0;font-size:14px;color:#8a8a8a;">¿En iPhone? Descarga FAHYBRID en la <a href="${esc(
          APP_STORE_URL,
        )}" style="color:#F06A2A;">App Store</a> y abre el enlace de arriba para entrar.</p>`
      : `<p style="margin:14px 0 0;font-size:14px;color:#8a8a8a;">Abre este enlace desde tu iPhone: si ya tienes la app, entras directo; si no, te guiamos para instalarla.</p>`;

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#0a0a0a;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;color:#f4f4f4;">
    <div style="font-style:italic;font-weight:800;letter-spacing:0.14em;font-size:13px;color:#F06A2A;text-transform:uppercase;">FAHYBRID</div>
    <h1 style="font-style:italic;font-weight:900;font-size:26px;line-height:1.1;margin:14px 0 8px;">${greeting}</h1>
    <p style="font-size:16px;line-height:1.55;color:#d4d4d4;margin:0 0 8px;">
      Ya tienes tu sitio en FAHYBRID. Completa tu alta y entra a tu plan: es un solo paso.
    </p>
    <a href="${esc(url)}"
       style="display:inline-block;margin:22px 0 6px;background:#F06A2A;color:#0a0a0a;font-weight:800;font-size:16px;text-decoration:none;padding:14px 26px;border-radius:999px;">
      Completar mi alta →
    </a>
    ${storeLine}
    <p style="margin:22px 0 0;font-size:13px;color:#6f6f6f;">
      Si el botón no funciona, copia y pega esta dirección:<br>
      <span style="color:#9a9a9a;word-break:break-all;">${esc(url)}</span>
    </p>
    <p style="margin:28px 0 0;font-size:13px;color:#6f6f6f;">El enlace caduca en 14 días.</p>
  </div>
</body></html>`;

  const text = `${greeting}

Ya tienes tu sitio en FAHYBRID. Completa tu alta y entra a tu plan (un solo paso):

${url}

El enlace caduca en 14 días.`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: AUTH_CONFIG.resendFromEmail(),
      to: input.to,
      subject: 'Completa tu alta en FAHYBRID',
      html,
      text,
    });
    if (error) return { sent: false, skipped_reason: 'resend_send_failed' };
    return { sent: true };
  } catch {
    return { sent: false, skipped_reason: 'resend_send_failed' };
  }
}
