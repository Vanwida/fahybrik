// Lead funnel emails (Resend). Two sends on full submit:
//   • sendLeadNotification  — internal alert to Pablo/Gerard (LEADS_NOTIFY_EMAIL,
//     default hello@fahybrid.com) with the full answers formatted for the call.
//   • sendLeadConfirmation  — short receipt to the lead.
//
// SENDER: reuses AUTH_CONFIG.resendFromEmail() — the ALREADY-VERIFIED Resend domain
// (aistudios.pro). fahybrid.com is NOT a verified Resend sender yet, so we do not send
// FROM it (would bounce). Internal notification still goes TO hello@fahybrid.com
// (recipients need no verification). Switch the from-address by setting RESEND_FROM_EMAIL
// once fahybrid.com is verified in Resend — no code change needed.
//
// Both sends are GUARDED: if RESEND_API_KEY is unset they log + return {sent:false}
// instead of throwing, so lead capture is never blocked by email delivery.

import { Resend } from 'resend';
import { AUTH_CONFIG } from '@/lib/auth/config';
import type { LeadSubmitInput } from '@fahybrid/shared/schema';
import { leadFirstName } from '@fahybrid/shared/domain/leads/questions';
import { groupLeadSummary, summarizeLead } from '@fahybrid/shared/domain/leads/summary';

export interface LeadEmailResult {
  sent: boolean;
  skipped_reason?: 'resend_not_configured' | 'resend_send_failed';
}

// Local HTML escaper (kept small + local; mirrors lib/partner/email.ts).
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Internal notification to the coach team with the full lead summary. */
export async function sendLeadNotification(input: LeadSubmitInput): Promise<LeadEmailResult> {
  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) {
    console.warn('[leads/email] RESEND_API_KEY not configured — skipping lead notification', {
      email: input.email,
    });
    return { sent: false, skipped_reason: 'resend_not_configured' };
  }
  const to = process.env.LEADS_NOTIFY_EMAIL ?? 'hello@fahybrid.com';
  const nombre = leadFirstName(input.nombre) || 'Sin nombre';
  const grouped = groupLeadSummary(summarizeLead(input as Record<string, unknown>));

  const textBody = [
    `Nuevo lead: ${nombre}`,
    `Email: ${input.email}`,
    `Teléfono: ${input.telefono}`,
    '',
    ...grouped.flatMap((g) => [
      `— ${g.label} —`,
      ...g.rows.map((r) => `${r.question}: ${r.answer}`),
      '',
    ]),
  ].join('\n');

  const htmlBlocks = grouped
    .map(
      (g) => `
        <h3 style="margin:22px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#F06A2A;">${escapeHtml(g.label)}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${g.rows
            .map(
              (r) => `<tr>
                <td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap;">${escapeHtml(r.question)}</td>
                <td style="padding:4px 0;color:#0a0a0a;font-weight:600;">${escapeHtml(r.answer)}</td>
              </tr>`,
            )
            .join('')}
        </table>`,
    )
    .join('');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:620px;margin:0 auto;padding:32px 24px;color:#0a0a0a;background:#fff;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F06A2A;">FAHYBRID · Nuevo lead</p>
      <h1 style="margin:0 0 16px;font-size:24px;letter-spacing:-0.01em;">${escapeHtml(nombre)}</h1>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Email</td><td style="padding:4px 0;font-weight:600;"><a href="mailto:${escapeHtml(input.email)}" style="color:#0a0a0a;">${escapeHtml(input.email)}</a></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Teléfono</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(input.telefono)}</td></tr>
      </table>
      ${htmlBlocks}
      <p style="margin:28px 0 0;font-size:12px;color:#999;">Responde a este email para escribir directamente a ${escapeHtml(nombre)}.</p>
    </div>`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: AUTH_CONFIG.resendFromEmail(),
    to,
    replyTo: input.email,
    subject: `Nuevo lead · ${nombre}`,
    text: textBody,
    html,
  });
  if (error) {
    console.error('[leads/email] notification send failed', { error: error.message });
    return { sent: false, skipped_reason: 'resend_send_failed' };
  }
  return { sent: true };
}

/**
 * Short receipt to the lead. When a `bookingToken` is given (always, post-submit), it
 * carries the CTA to reserve the call at /es/cita/[token] — so a lead who finished the
 * onboarding without picking a slot can still book from the email.
 */
export async function sendLeadConfirmation(
  input: LeadSubmitInput,
  bookingToken?: string,
): Promise<LeadEmailResult> {
  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) {
    console.warn('[leads/email] RESEND_API_KEY not configured — skipping lead confirmation', {
      email: input.email,
    });
    return { sent: false, skipped_reason: 'resend_not_configured' };
  }
  const nombre = leadFirstName(input.nombre);
  const hi = nombre ? `Hola ${escapeHtml(nombre)},` : 'Hola,';
  const bookingUrl = bookingToken
    ? `${AUTH_CONFIG.appUrl().replace(/\/$/, '')}/es/cita/${bookingToken}`
    : null;

  const ctaText = bookingUrl
    ? `Reserva tu videollamada con Pablo — 30 minutos, sin coste — aquí:\n${bookingUrl}`
    : `Pablo revisará tus respuestas y te escribimos en breve para agendar tu llamada — 30 minutos, sin coste.`;
  const ctaHtml = bookingUrl
    ? `<p style="margin:0 0 12px;line-height:1.6;">Elige el hueco que mejor te venga para tu <strong>videollamada con Pablo</strong> — 30 minutos, sin coste.</p>
       <p style="margin:0 0 12px;"><a href="${escapeHtml(bookingUrl)}" style="display:inline-block;padding:12px 20px;background:#F06A2A;color:#0a0a0a;text-decoration:none;border-radius:8px;font-weight:600;">Reservar mi llamada</a></p>`
    : `<p style="margin:0 0 12px;line-height:1.6;">Pablo revisará tus respuestas y te escribimos en breve para <strong>agendar tu llamada</strong> — 30 minutos, sin coste.</p>`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: AUTH_CONFIG.resendFromEmail(),
    to: input.email,
    subject: 'Hemos recibido tu solicitud · FAHYBRID',
    text:
      `${nombre ? `Hola ${nombre},` : 'Hola,'}\n\n` +
      `Hemos recibido tu solicitud. ${ctaText}\n\n` +
      `Si tienes cualquier duda, responde a este email.\n\nEl equipo de FAHYBRID`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0a0a0a;background:#fff;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F06A2A;">FAHYBRID</p>
        <h1 style="margin:0 0 14px;font-size:22px;letter-spacing:-0.01em;">Solicitud recibida</h1>
        <p style="margin:0 0 12px;line-height:1.6;">${hi}</p>
        ${ctaHtml}
        <p style="margin:0 0 12px;line-height:1.6;color:#444;">Si tienes cualquier duda, responde a este email.</p>
        <p style="margin:24px 0 0;line-height:1.6;color:#666;">El equipo de FAHYBRID</p>
      </div>`,
  });
  if (error) {
    console.error('[leads/email] confirmation send failed', { error: error.message });
    return { sent: false, skipped_reason: 'resend_send_failed' };
  }
  return { sent: true };
}
