// Shared presentational primitives for the leads-funnel emails (nurture #10, waitlist #18).
// ONE brand shell + escaper + URL/CTA/footer builders so every leads email renders
// identically and links through the SAME paths. Pure string-building — no I/O, no Resend.
// The actual send (AUTH_CONFIG.resendFromEmail() sender, single Resend key) and the per-email
// copy live in each caller (nurture-email.ts, waitlist-email.ts).

import { AUTH_CONFIG } from '@/lib/auth/config';

// Inlined brand palette (mail clients strip CSS custom properties).
export const BRAND_INK = '#0a0a0a';
export const BRAND_ORANGE = '#F06A2A';

// Public route paths the emails link to (single-locale ES funnel).
export const CITA_PATH = '/es/cita/'; // + token
export const EMPIEZA_PATH = '/es/empieza';
export const UNSUBSCRIBE_PAGE_PATH = '/es/no-mas-emails'; // ?token=… → confirm → POST /api/leads/unsubscribe

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function appBase(): string {
  return AUTH_CONFIG.appUrl().replace(/\/$/, '');
}

/** Public booking URL for a lead's opaque token. */
export function citaUrl(token: string): string {
  return `${appBase()}${CITA_PATH}${token}`;
}

/** RGPD unsubscribe URL to the confirmation PAGE (never the bare POST endpoint). */
export function unsubscribeUrl(token: string): string {
  return `${appBase()}${UNSUBSCRIBE_PAGE_PATH}?token=${encodeURIComponent(token)}`;
}

/**
 * The light brand shell wrapping every leads email body.
 *
 * `skin` es la piel del club de ESE lead (`resolveClubEmailSkin`, superficie
 * `light` — este shell es de fondo blanco). Sin skin, pinta exactamente lo de
 * hoy: wordmark "FAHYBRID" en el naranja fijo.
 */
export function brandShell(inner: string, skin?: { wordmark: string; text: string }): string {
  const wordmark = skin?.wordmark ?? 'FAHYBRID';
  const textColor = skin?.text ?? BRAND_ORANGE;
  return (
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:${BRAND_INK};background:#fff;">` +
    `<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${textColor};">${escapeHtml(wordmark)}</p>${inner}` +
    `</div>`
  );
}

/**
 * The CTA button (escapes href + label). `accent` es la superficie `light` de
 * `resolveClubEmailSkin` para el club de ESE lead; sin ella, el naranja fijo.
 */
export function ctaButton(
  href: string,
  label: string,
  accent?: { fill: string; on_fill: string },
): string {
  const fill = accent?.fill ?? BRAND_ORANGE;
  const onFill = accent?.on_fill ?? BRAND_INK;
  return `<p style="margin:4px 0 20px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;background:${fill};color:${onFill};text-decoration:none;border-radius:8px;font-weight:600;">${escapeHtml(label)}</a></p>`;
}

/** The muted RGPD unsubscribe footer (HTML). */
export function unsubscribeFooter(unsubscribeToken: string): string {
  const unsub = unsubscribeUrl(unsubscribeToken);
  return `<p style="margin:20px 0 0;font-size:12px;color:#9a9a9a;">Si no quieres más recordatorios, <a href="${escapeHtml(unsub)}" style="color:#9a9a9a;text-decoration:underline;">cancela aquí</a>.</p>`;
}

/** The plain-text equivalent of the unsubscribe footer. */
export function unsubscribeTextLine(unsubscribeToken: string): string {
  return `Si no quieres más recordatorios, cancela aquí: ${unsubscribeUrl(unsubscribeToken)}`;
}
