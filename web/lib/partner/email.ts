import { Resend } from 'resend';
import { AUTH_CONFIG } from '@/lib/auth/config';

export interface PartnerInvitationEmailInput {
  to: string;
  inviter_name: string | null;
  token: string;
  expires_at: Date;
}

export interface PartnerInvitationEmailResult {
  sent: boolean;
  /** Present when sent=false because Resend is not configured. */
  skipped_reason?: 'resend_not_configured' | 'resend_send_failed';
}

/**
 * Escapes the 5 HTML-significant characters so user-controlled strings (e.g.
 * the inviter's full_name) can't inject markup or break out of an attribute
 * when interpolated into the Resend HTML template. & must be escaped first so
 * the entities produced by the other replacements aren't double-escaped.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRedeemLink(token: string): string {
  const base = AUTH_CONFIG.appUrl().replace(/\/$/, '');
  const url = new URL(`${base}/partner/redeem`);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Sends the Dobles partner invitation email via Resend. If Resend is not
 * configured (no RESEND_API_KEY), logs a warning and returns {sent: false}
 * rather than throwing — invitation creation should not be blocked by
 * email delivery in beta.
 */
export async function sendPartnerInvitationEmail(
  input: PartnerInvitationEmailInput,
): Promise<PartnerInvitationEmailResult> {
  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) {
    console.warn(
      '[partner/email] RESEND_API_KEY not configured — skipping invitation email',
      { to: input.to },
    );
    return { sent: false, skipped_reason: 'resend_not_configured' };
  }

  const inviterLabel = input.inviter_name?.trim() || 'tu compañero/a';
  // inviterLabel derives from user-controlled full_name; escape before it
  // reaches any HTML context (subject lines are rendered as text by clients,
  // but we escape there too as defence-in-depth).
  const inviterLabelHtml = escapeHtml(inviterLabel);
  const link = buildRedeemLink(input.token);
  const expiresDays = Math.max(
    1,
    Math.round((input.expires_at.getTime() - Date.now()) / 86_400_000),
  );

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: AUTH_CONFIG.resendFromEmail(),
    to: input.to,
    subject: `Únete a ${inviterLabelHtml} en FAHYBRID`,
    text:
      `${inviterLabel} te ha invitado a entrenar en pareja en FAHYBRID (modalidad Dobles HYROX).\n\n` +
      `Acepta la invitación aquí (sin pago, tu compañero/a ya cubre la suscripción Dobles):\n\n${link}\n\n` +
      `El enlace expira en ${expiresDays} días.\n\nSi no esperabas este correo, ignóralo.`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0a0a0a;background:#fff;">
        <h1 style="margin:0 0 12px;font-size:22px;letter-spacing:-0.01em;">FAHYBRID · Dobles HYROX</h1>
        <p style="margin:0 0 8px;line-height:1.5;">
          <strong>${inviterLabelHtml}</strong> te ha invitado a entrenar en pareja.
        </p>
        <p style="margin:0 0 20px;line-height:1.5;color:#444;">
          Modalidad Dobles HYROX. Sin pago — tu compañero/a ya cubre la suscripción compartida.
        </p>
        <p style="margin:0 0 28px;">
          <a href="${link}" style="display:inline-block;padding:12px 20px;background:#ff5b1f;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Aceptar invitación</a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#666;line-height:1.5;">
          El enlace expira en ${expiresDays} días.<br>
          Si no esperabas este correo, ignóralo.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('[partner/email] Resend send failed', { error: error.message });
    return { sent: false, skipped_reason: 'resend_send_failed' };
  }

  return { sent: true };
}
