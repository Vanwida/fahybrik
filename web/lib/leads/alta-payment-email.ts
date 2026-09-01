import 'server-only';

import { Resend } from 'resend';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { resolveClubEmailSkin } from '@/lib/coach/club-skin';
import { brandShell, ctaButton, escapeHtml } from './email-shell';

// Acceptance email (funnel #5 / #15 PAID path) — sent to the athlete on a paid
// alta. It carries the agreed monthly price + a Stripe Checkout button. Access
// (the claim/download link) is NOT in this email: it is sent separately once
// Stripe confirms payment (the webhook). Reuses the shared brand shell so it
// renders identically to the nurture / waitlist emails.

export interface SendAltaPaymentEmailInput {
  to: string;
  name: string;
  /** Monthly price in integer cents. */
  amount_cents: number;
  /** ISO 4217, e.g. 'eur'. */
  currency: string;
  /** Stripe Checkout URL (subscription mode). */
  checkoutUrl: string;
  /** El club que da de alta a este atleta — pinta su piel (nombre + acento) en vez
   *  de la marca de este binario. Ausente/nulo → marca de este binario, como hoy. */
  coach_id?: bigint | number | null;
}

export interface SendAltaPaymentEmailResult {
  sent: boolean;
  skipped_reason?: 'resend_not_configured' | 'resend_send_failed';
}

/** Format cents → localized currency string, e.g. 7000 eur → "70,00 €". */
export function formatMonthlyPrice(amount_cents: number, currency: string): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(amount_cents / 100);
}

export async function sendAltaPaymentEmail(
  input: SendAltaPaymentEmailInput,
): Promise<SendAltaPaymentEmailResult> {
  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) {
    return { sent: false, skipped_reason: 'resend_not_configured' };
  }

  const skin = await resolveClubEmailSkin(input.coach_id ?? null);
  const firstName = input.name.trim().split(/\s+/)[0] || '';
  const greeting = firstName ? `Hola ${escapeHtml(firstName)},` : 'Hola,';
  const priceLabel = formatMonthlyPrice(input.amount_cents, input.currency);
  const url = input.checkoutUrl;

  const inner =
    `<h1 style="font-size:22px;font-weight:800;margin:12px 0 6px;">${greeting}</h1>` +
    `<p style="font-size:16px;line-height:1.55;margin:0 0 6px;">Bienvenido/a a ${escapeHtml(skin.wordmark)}. Tu entrenador ha preparado tu plan personalizado.</p>` +
    `<p style="font-size:16px;line-height:1.55;margin:0 0 16px;">Tu cuota mensual es de <strong>${escapeHtml(priceLabel)}/mes</strong>. Activa tu plan con un pago seguro — se renueva cada mes y puedes cancelar cuando quieras.</p>` +
    ctaButton(url, 'Pagar y activar', skin.light) +
    `<p style="margin:8px 0 0;font-size:14px;color:#6f6f6f;">En cuanto confirmemos el pago, descarga la app y entra con tu email.</p>` +
    `<p style="margin:16px 0 0;font-size:13px;color:#9a9a9a;">Si el botón no funciona, copia y pega esta dirección:<br><span style="word-break:break-all;">${escapeHtml(url)}</span></p>`;

  const html = brandShell(inner, { wordmark: skin.wordmark, text: skin.light.text });
  const text = `${firstName ? `Hola ${firstName},` : 'Hola,'}

Bienvenido/a a ${skin.wordmark}. Tu entrenador ha preparado tu plan personalizado.

Tu cuota mensual es de ${priceLabel}/mes. Activa tu plan con un pago seguro (se renueva cada mes, cancela cuando quieras):

${url}

En cuanto confirmemos el pago, descarga la app y entra con tu email.`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: AUTH_CONFIG.resendFromEmail(),
      to: input.to,
      subject: `Bienvenido/a a ${skin.wordmark} — activa tu plan`,
      html,
      text,
    });
    if (error) return { sent: false, skipped_reason: 'resend_send_failed' };
    return { sent: true };
  } catch {
    return { sent: false, skipped_reason: 'resend_send_failed' };
  }
}
