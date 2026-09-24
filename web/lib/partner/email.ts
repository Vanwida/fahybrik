// The invitation emails emit two custom-scheme deep links the iOS handler must
// match (see lib/invites/deeplinks.ts and the AASA paths):
//   fahybrid://partner/redeem?token=…   (this file — Dobles partner pairing)
//   fahybrid://invite?token=…           (coach → athlete account claim)
// Each email pairs a Universal Link (HTTPS, primary button — falls back to the
// web landing page when the app isn't installed) with the custom scheme
// (secondary line — opens the app directly).
import { Resend } from 'resend';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { sql as defaultSql, type Sql } from '@/lib/db';
import { partnerRedeemDeepLink } from '@/lib/invites/deeplinks';
import { BRAND_WORDMARK } from '@fahybrid/shared/domain/coach/club-skin';

export interface PartnerInvitationEmailInput {
  to: string;
  inviter_name: string | null;
  token: string;
  expires_at: Date;
  /**
   * Quien invita (su `users.id`). Con él, el correo habla con la voz de SU club
   * (nombre y acento de la piel); sin él, con la marca de este binario.
   */
  inviter_user_id?: bigint | number | null;
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
 * La marca con la que habla el correo. «Entrenar en X» es el CLUB de quien invita;
 * «la app X» es el binario que se instala — dos cosas distintas, cada una de su
 * sitio (la piel del club y `BRAND_WORDMARK`).
 */
export interface PartnerEmailBrand {
  club: string;
  app: string;
  fill: string;
  on_fill: string;
  text: string;
}

const DEFAULT_PARTNER_BRAND: PartnerEmailBrand = {
  club: BRAND_WORDMARK,
  app: BRAND_WORDMARK,
  fill: '#ff5b1f',
  on_fill: '#fff',
  text: '#ff5b1f',
};

/** El club de quien invita (su piel), o la marca del binario si no hay club o algo falla. */
export async function resolvePartnerEmailBrand(
  inviter_user_id: bigint | number | null | undefined,
  client: Sql = defaultSql,
): Promise<PartnerEmailBrand> {
  if (inviter_user_id == null) return DEFAULT_PARTNER_BRAND;
  try {
    const rows = await client<Array<{ coach_id: string | null }>>`
      select coach_id::text as coach_id from athletes where user_id = ${Number(inviter_user_id)} limit 1
    `;
    const coachId = rows[0]?.coach_id;
    if (!coachId) return DEFAULT_PARTNER_BRAND;
    const { resolveClubEmailSkin } = await import('@/lib/coach/club-skin');
    const skin = await resolveClubEmailSkin(Number(coachId), client);
    return {
      club: skin.wordmark,
      app: BRAND_WORDMARK,
      fill: skin.light.fill,
      on_fill: skin.light.on_fill,
      text: skin.light.text,
    };
  } catch {
    return DEFAULT_PARTNER_BRAND;
  }
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
  // Custom-scheme fallback for people who already have the app installed and
  // want to skip the Universal-Link round-trip. The token is base64url (URL-safe)
  // and additionally encoded by the helper.
  const appLink = partnerRedeemDeepLink(input.token);
  const expiresDays = Math.max(
    1,
    Math.round((input.expires_at.getTime() - Date.now()) / 86_400_000),
  );

  const brand = await resolvePartnerEmailBrand(input.inviter_user_id);
  const clubHtml = escapeHtml(brand.club);
  const appHtml = escapeHtml(brand.app);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: AUTH_CONFIG.resendFromEmail(),
    to: input.to,
    subject: `Únete a ${inviterLabelHtml} en ${brand.club}`,
    text:
      `${inviterLabel} te ha invitado a entrenar en pareja en ${brand.club} (modalidad Dobles HYROX).\n\n` +
      `Acepta la invitación aquí (sin pago, tu compañero/a ya cubre la suscripción Dobles):\n\n${link}\n\n` +
      `¿Ya tienes la app ${brand.app}? Ábrela directamente:\n${appLink}\n\n` +
      `El enlace expira en ${expiresDays} días.\n\nSi no esperabas este correo, ignóralo.`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0a0a0a;background:#fff;">
        <h1 style="margin:0 0 12px;font-size:22px;letter-spacing:-0.01em;">${clubHtml} · Dobles HYROX</h1>
        <p style="margin:0 0 8px;line-height:1.5;">
          <strong>${inviterLabelHtml}</strong> te ha invitado a entrenar en pareja.
        </p>
        <p style="margin:0 0 20px;line-height:1.5;color:#444;">
          Modalidad Dobles HYROX. Sin pago — tu compañero/a ya cubre la suscripción compartida.
        </p>
        <p style="margin:0 0 12px;">
          <a href="${link}" style="display:inline-block;padding:12px 20px;background:${brand.fill};color:${brand.on_fill};text-decoration:none;border-radius:8px;font-weight:600;">Aceptar invitación</a>
        </p>
        <p style="margin:0 0 28px;font-size:13px;line-height:1.5;">
          <a href="${appLink}" style="color:${brand.text};text-decoration:none;font-weight:600;">Abrir directamente en la app ${appHtml} →</a>
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
