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
import { coachVoice, type CoachVoice } from '@/lib/coach/voice';
import { resolveClubEmailSkin } from '@/lib/coach/club-skin';
import {
  EMPIEZA_PATH,
  appBase,
  brandShell,
  citaUrl,
  ctaButton,
  escapeHtml,
  unsubscribeFooter,
  unsubscribeTextLine,
} from './email-shell';

export interface NurtureEmailResult {
  sent: boolean;
  skipped_reason?: 'resend_not_configured' | 'resend_send_failed' | 'missing_cita_token';
}

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
//
// Cada entrada es FUNCIÓN del coach de ese lead: el nombre sale de `leads.coach_id` y la
// plantilla pide el fragmento que le toca por posición (`subject` a principio de frase,
// `object` en medio, `withCoach` como coletilla que desaparece entera si no hay nombre).
// `wordmark` es el nombre de marca a pintar en el único hueco que lo menciona (parcial_t1);
// el resto de copys no nombran la marca y no necesitan el parámetro.
const copyFor = (v: CoachVoice, wordmark: string): Record<NurtureTouchType, TouchCopy> => ({
  parcial_t1: {
    subject: `Termina tu solicitud en ${wordmark}`,
    heading: 'Te quedó a medias',
    body: [
      `Empezaste tu solicitud pero no llegaste a terminarla. Son un par de minutos, y con ella ${v.object} puede preparar tu plan a tu medida.`,
      'Retómala donde la dejaste:',
    ],
    ctaLabel: 'Completar mi solicitud',
    ctaKind: 'empieza',
  },
  parcial_t3: {
    subject: 'Quedan pocas plazas · termina tu solicitud',
    heading: 'Las plazas son limitadas',
    body: [
      `${v.subject} entrena a un número limitado de atletas para poder seguir cada plan de cerca. Ahora mismo hay plazas, pero se cierran.`,
      'Si quieres tu sitio, termina tu solicitud y lo vemos:',
    ],
    ctaLabel: 'Completar mi solicitud',
    ctaKind: 'empieza',
  },
  nuevo_t1: {
    subject: `Reserva tu llamada${v.withCoach}`,
    heading: 'El siguiente paso es una llamada',
    body: [
      `Ya tenemos tus respuestas. El siguiente paso es una videollamada de 30 minutos${v.withCoach} para ver tu caso y cómo enfocar tu plan.`,
      'Elige el hueco que mejor te venga:',
    ],
    ctaLabel: 'Reservar mi llamada',
    ctaKind: 'cita',
  },
  nuevo_t4: {
    subject: `¿Reservamos tu llamada${v.withCoach}?`,
    heading: 'Seguimos con tu hueco',
    body: [
      `Aún no has reservado tu videollamada${v.withCoach}. Cuando te venga bien, elige un hueco y lo vemos con calma.`,
      'Reserva aquí:',
    ],
    ctaLabel: 'Reservar mi llamada',
    ctaKind: 'cita',
  },
  noshow_rebook: {
    subject: `Reprograma tu llamada${v.withCoach}`,
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
});

// Our own DB feeds this, but `email` traces to lead-submitted input → validate the shape
// (fails closed with a ZodError the cron catches per-candidate, so one bad row never aborts
// the batch). touch_type is constrained to the known set.
const nurtureInputSchema = z.object({
  touch_type: z.enum(NURTURE_TOUCH_TYPES),
  email: z.string().email(),
  nombre: z.string().nullable(),
  cita_token: z.string().min(1).nullable(),
  unsubscribe_token: z.string().min(1),
  /** Nombre del coach de este lead (`leads.coach_id` → `coaches.full_name`). Sin
   *  dueño o sin nombre → null, y la copia prescinde del nombre sin dejar hueco. */
  coach_name: z.string().nullable().optional(),
  /** El coach de este lead — pinta su piel (nombre + acento) en vez de la marca de
   *  este binario. Sin dueño → marca de este binario, como hoy. Va como texto. */
  coach_id: z.string().nullable().optional(),
});

export type NurtureEmailInput = z.infer<typeof nurtureInputSchema>;

function ctaUrl(kind: CtaKind, citaToken: string | null): string | null {
  if (kind === 'empieza') return `${appBase()}${EMPIEZA_PATH}`;
  if (!citaToken) return null; // 'cita' CTA needs the booking token
  return citaUrl(citaToken);
}

/** Sends the nurture email for one candidate touch. Guarded + validated. */
export async function sendNurtureEmail(input: NurtureEmailInput): Promise<NurtureEmailResult> {
  const { touch_type, email, nombre, cita_token, unsubscribe_token, coach_name, coach_id } =
    nurtureInputSchema.parse(input);
  const skin = await resolveClubEmailSkin(coach_id ? BigInt(coach_id) : null);
  const voice = coachVoice(coach_name, skin.wordmark);
  const copy = copyFor(voice, skin.wordmark)[touch_type];

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

  const bodyText = copy.body.join('\n\n');
  const bodyHtml = copy.body
    .map((p) => `<p style="margin:0 0 12px;line-height:1.6;">${escapeHtml(p)}</p>`)
    .join('\n       ');

  const text =
    `${hi}\n\n` +
    `${bodyText}\n${cta}\n\n` +
    `— ${voice.signature}\n\n` +
    unsubscribeTextLine(unsubscribe_token);

  const html = brandShell(
    `<h1 style="margin:8px 0 14px;font-size:22px;">${escapeHtml(copy.heading)}</h1>
       <p style="margin:0 0 12px;line-height:1.6;">${hiHtml}</p>
       ${bodyHtml}
       ${ctaButton(cta, copy.ctaLabel, skin.light)}
       <p style="margin:24px 0 0;color:#666;">— ${escapeHtml(voice.signature)}</p>
       ${unsubscribeFooter(unsubscribe_token)}`,
    { wordmark: skin.wordmark, text: skin.light.text },
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
