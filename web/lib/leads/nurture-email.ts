// Nurture emails (Resend) — the reminder/nurture sends for funnel #10. Table-driven: one
// copy entry per touch_type, rendered through the same guarded sender + light brand shell
// as the citas emails (lib/citas/reminder-email.ts). Reuses AUTH_CONFIG.resendFromEmail()
// — the SINGLE from-sender helper (prod = hello@fahybrid.com once RESEND_FROM_EMAIL is set,
// dev = the verified noreply@aistudios.pro) — so there is no second Resend key anywhere.
//
// Every email carries the RGPD unsubscribe link to the confirmation PAGE (not the bare
// POST endpoint) so an email-client GET prefetch can never auto-unsubscribe. Guarded like
// every funnel send: no RESEND_API_KEY → logs + returns {sent:false}, never throws.
//
// Copy: short, ES, tú-form, sober (no inflated exclamations, NO prices ever).

import { Resend } from 'resend';
import { z } from 'zod';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { NURTURE_TOUCH_TYPES, type NurtureTouchType } from '@fahybrid/shared/domain/leads/nurture';

export interface NurtureEmailResult {
  sent: boolean;
  skipped_reason?: 'resend_not_configured' | 'resend_send_failed' | 'missing_cita_token';
}

// Public route paths the emails link to (single-locale ES funnel). Kept local to this file.
const CITA_PATH = '/es/cita/'; // + token
const EMPIEZA_PATH = '/es/empieza';
const UNSUBSCRIBE_PAGE_PATH = '/es/no-mas-emails'; // ?token=… → confirm → POST /api/leads/unsubscribe

// Inlined brand palette (mail clients strip CSS custom properties). Mirrors citas emails.
const BRAND_INK = '#0a0a0a';
const BRAND_ORANGE = '#F06A2A';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const shell = (inner: string) =>
  `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:${BRAND_INK};background:#fff;">
     <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_ORANGE};">FAHYBRID</p>${inner}
   </div>`;

type CtaKind = 'cita' | 'empieza';

interface TouchCopy {
  subject: string;
  heading: string;
  /** Body paragraphs (plain strings; escaped at render). */
  body: string[];
  ctaLabel: string;
  ctaKind: CtaKind;
}

// One entry per touch. Presentation lives here (web); the cadence/sequence metadata lives
// in shared/domain/leads/nurture.ts. tú-form, sober, no prices.
const COPY: Record<NurtureTouchType, TouchCopy> = {
  parcial_t1: {
    subject: 'Termina tu solicitud en FAHYBRID',
    heading: 'Te quedó a medias',
    body: [
      'Empezaste tu solicitud pero no llegaste a terminarla. Son un par de minutos, y con ella Pablo puede preparar tu plan a tu medida.',
      'Retómala donde la dejaste:',
    ],
    ctaLabel: 'Completar mi solicitud',
    ctaKind: 'empieza',
  },
  parcial_t3: {
    subject: 'Quedan pocas plazas · termina tu solicitud',
    heading: 'Las plazas son limitadas',
    body: [
      'Pablo entrena a un número limitado de atletas para poder seguir cada plan de cerca. Ahora mismo hay plazas, pero se cierran.',
      'Si quieres tu sitio, termina tu solicitud y lo vemos:',
    ],
    ctaLabel: 'Completar mi solicitud',
    ctaKind: 'empieza',
  },
  nuevo_t1: {
    subject: 'Reserva tu llamada con Pablo',
    heading: 'El siguiente paso es una llamada',
    body: [
      'Ya tenemos tus respuestas. El siguiente paso es una videollamada de 30 minutos con Pablo para ver tu caso y cómo enfocar tu plan.',
      'Elige el hueco que mejor te venga:',
    ],
    ctaLabel: 'Reservar mi llamada',
    ctaKind: 'cita',
  },
  nuevo_t4: {
    subject: '¿Reservamos tu llamada con Pablo?',
    heading: 'Seguimos con tu hueco',
    body: [
      'Aún no has reservado tu videollamada con Pablo. Cuando te venga bien, elige un hueco y lo vemos con calma.',
      'Reserva aquí:',
    ],
    ctaLabel: 'Reservar mi llamada',
    ctaKind: 'cita',
  },
  noshow_rebook: {
    subject: 'Reprograma tu llamada con Pablo',
    heading: 'Nos quedó pendiente',
    body: [
      'No pudimos vernos en la llamada. No pasa nada: elige otro hueco y la retomamos cuando te vaya bien.',
      'Reprograma aquí:',
    ],
    ctaLabel: 'Elegir otro hueco',
    ctaKind: 'cita',
  },
  pensandoselo_t3: {
    subject: '¿Alguna duda con tu plan?',
    heading: '¿Lo has podido pensar?',
    body: [
      'Hablamos hace unos días y te quedabas dándole una vuelta. Si te ha surgido cualquier duda, respóndeme a este correo y la resolvemos.',
      'Y si prefieres, podemos vernos otra vez:',
    ],
    ctaLabel: 'Reservar otra llamada',
    ctaKind: 'cita',
  },
};

// Our own DB feeds this, but `email` traces to lead-submitted input → validate the shape
// (fails closed with a ZodError the cron catches per-candidate, so one bad row never aborts
// the batch). touch_type is constrained to the known set.
const nurtureInputSchema = z.object({
  touch_type: z.enum(NURTURE_TOUCH_TYPES),
  email: z.string().email(),
  nombre: z.string().nullable(),
  cita_token: z.string().min(1).nullable(),
  unsubscribe_token: z.string().min(1),
});

export type NurtureEmailInput = z.infer<typeof nurtureInputSchema>;

function appBase(): string {
  return AUTH_CONFIG.appUrl().replace(/\/$/, '');
}

function ctaUrl(kind: CtaKind, citaToken: string | null): string | null {
  if (kind === 'empieza') return `${appBase()}${EMPIEZA_PATH}`;
  if (!citaToken) return null; // 'cita' CTA needs the booking token
  return `${appBase()}${CITA_PATH}${citaToken}`;
}

function unsubscribeUrl(token: string): string {
  return `${appBase()}${UNSUBSCRIBE_PAGE_PATH}?token=${encodeURIComponent(token)}`;
}

/** Sends the nurture email for one candidate touch. Guarded + validated. */
export async function sendNurtureEmail(input: NurtureEmailInput): Promise<NurtureEmailResult> {
  const { touch_type, email, nombre, cita_token, unsubscribe_token } =
    nurtureInputSchema.parse(input);
  const copy = COPY[touch_type];

  const cta = ctaUrl(copy.ctaKind, cita_token);
  if (!cta) {
    // A 'cita' touch reached us without a booking token — never expected (every lead has
    // one), but we refuse to send a CTA-less email rather than link nowhere.
    console.warn('[leads/nurture-email] missing cita token — skipping', { to: email, touch_type });
    return { sent: false, skipped_reason: 'missing_cita_token' };
  }

  const firstName = nombre?.trim().split(/\s+/)[0] ?? '';
  const hi = firstName ? `Hola ${firstName},` : 'Hola,';
  const hiHtml = firstName ? `Hola ${escapeHtml(firstName)},` : 'Hola,';
  const unsub = unsubscribeUrl(unsubscribe_token);

  const bodyText = copy.body.join('\n\n');
  const bodyHtml = copy.body
    .map((p) => `<p style="margin:0 0 12px;line-height:1.6;">${escapeHtml(p)}</p>`)
    .join('\n       ');

  const text =
    `${hi}\n\n` +
    `${bodyText}\n${cta}\n\n` +
    `— Pablo · FAHYBRID\n\n` +
    `Si no quieres más recordatorios, cancela aquí: ${unsub}`;

  const html = shell(
    `<h1 style="margin:8px 0 14px;font-size:22px;">${escapeHtml(copy.heading)}</h1>
       <p style="margin:0 0 12px;line-height:1.6;">${hiHtml}</p>
       ${bodyHtml}
       <p style="margin:4px 0 20px;"><a href="${escapeHtml(cta)}" style="display:inline-block;padding:12px 20px;background:${BRAND_ORANGE};color:${BRAND_INK};text-decoration:none;border-radius:8px;font-weight:600;">${escapeHtml(copy.ctaLabel)}</a></p>
       <p style="margin:24px 0 0;color:#666;">— Pablo · FAHYBRID</p>
       <p style="margin:20px 0 0;font-size:12px;color:#9a9a9a;">Si no quieres más recordatorios, <a href="${escapeHtml(unsub)}" style="color:#9a9a9a;text-decoration:underline;">cancela aquí</a>.</p>`,
  );

  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) {
    console.warn('[leads/nurture-email] RESEND_API_KEY not configured — skipping', { to: email, touch_type });
    return { sent: false, skipped_reason: 'resend_not_configured' };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: AUTH_CONFIG.resendFromEmail(),
    to: email,
    subject: copy.subject,
    text,
    html,
  });
  if (error) {
    console.error('[leads/nurture-email] send failed', { to: email, touch_type, error: error.message });
    return { sent: false, skipped_reason: 'resend_send_failed' };
  }
  return { sent: true };
}
