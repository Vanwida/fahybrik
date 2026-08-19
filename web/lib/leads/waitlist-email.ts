// Waitlist emails (Resend) for #18 — the two transactional sends around the capacity gate:
//   • JOINED   — the lead finished onboarding while the coach was at capacity → they're on the
//     FIFO list. Premium, exclusive-club tone (scarcity = positioning, NOT rejection). No
//     cita link (they can't book yet), no prices.
//   • RELEASED — the coach MANUALLY opened a plaza → warm invite to book the intro call,
//     carrying the /es/cita/<token> CTA.
//
// Same guarded sender + brand shell + single Resend key as the nurture emails (via
// lib/leads/email-shell.ts + AUTH_CONFIG). No second Resend key anywhere.

import { Resend } from 'resend';
import { z } from 'zod';
import { AUTH_CONFIG } from '@/lib/auth/config';
import {
  brandShell,
  citaUrl,
  ctaButton,
  escapeHtml,
  unsubscribeFooter,
  unsubscribeTextLine,
} from './email-shell';
import { coachVoice } from '@/lib/coach/voice';
import { resolveClubEmailSkin } from '@/lib/coach/club-skin';

export interface WaitlistEmailResult {
  sent: boolean;
  skipped_reason?: 'resend_not_configured' | 'resend_send_failed';
}

// Inputs trace to lead-submitted data → Zod-validate the shape (fails closed with a ZodError
// the caller can catch). email/token are constrained; nombre may be absent.
/** Nombre del coach de este lead (`leads.coach_id` → `coaches.full_name`). Sin dueño o
 *  sin nombre → null, y la copia prescinde del nombre sin dejar hueco. */
const coachNameField = z.string().nullable().optional();
/** El coach de este lead — pinta su piel (nombre + acento) en vez de la marca de
 *  este binario. Sin dueño → marca de este binario, como hoy. Va como texto. */
const coachIdField = z.string().nullable().optional();

const joinedInputSchema = z.object({
  email: z.string().email(),
  nombre: z.string().nullable(),
  unsubscribe_token: z.string().min(1),
  coach_name: coachNameField,
  coach_id: coachIdField,
});
export type WaitlistJoinedInput = z.infer<typeof joinedInputSchema>;

const releasedInputSchema = z.object({
  email: z.string().email(),
  nombre: z.string().nullable(),
  cita_token: z.string().min(1),
  unsubscribe_token: z.string().min(1),
  coach_name: coachNameField,
  coach_id: coachIdField,
});
export type WaitlistReleasedInput = z.infer<typeof releasedInputSchema>;

function greeting(nombre: string | null): { text: string; html: string } {
  const first = nombre?.trim().split(/\s+/)[0] ?? '';
  return first
    ? { text: `Hola ${first},`, html: `Hola ${escapeHtml(first)},` }
    : { text: 'Hola,', html: 'Hola,' };
}

function paragraphsHtml(body: string[]): string {
  return body
    .map((p) => `<p style="margin:0 0 12px;line-height:1.6;">${escapeHtml(p)}</p>`)
    .join('\n       ');
}

/** The one guarded Resend send both waitlist emails funnel through. */
async function sendEmail(args: {
  email: string;
  subject: string;
  text: string;
  html: string;
}): Promise<WaitlistEmailResult> {
  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) {
    console.warn('[leads/waitlist-email] RESEND_API_KEY not configured — skipping', { to: args.email });
    return { sent: false, skipped_reason: 'resend_not_configured' };
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: AUTH_CONFIG.resendFromEmail(),
    to: args.email,
    subject: args.subject,
    text: args.text,
    html: args.html,
  });
  if (error) {
    console.error('[leads/waitlist-email] send failed', { to: args.email, error: error.message });
    return { sent: false, skipped_reason: 'resend_send_failed' };
  }
  return { sent: true };
}

/** "Estás en la lista de espera" — sent when a lead completes onboarding at full capacity. */
export async function sendWaitlistJoinedEmail(input: WaitlistJoinedInput): Promise<WaitlistEmailResult> {
  const { email, nombre, unsubscribe_token, coach_name, coach_id } = joinedInputSchema.parse(input);
  const skin = await resolveClubEmailSkin(coach_id ? BigInt(coach_id) : null);
  const v = coachVoice(coach_name, skin.wordmark);
  const g = greeting(nombre);
  const subject = `Estás en la lista de espera de ${skin.wordmark}`;
  const heading = 'Estás en la lista de espera';
  const body = [
    `${v.subject} entrena a un grupo reducido de atletas para poder seguir cada plan de cerca. Ahora mismo el grupo está completo.`,
    'Te hemos apuntado a la lista de espera. En cuanto se abra una plaza te escribimos, y se respeta el orden de llegada.',
    'No tienes que hacer nada más: nosotros te avisamos.',
  ];

  const text =
    `${g.text}\n\n` +
    `${body.join('\n\n')}\n\n` +
    `— ${v.signature}\n\n` +
    unsubscribeTextLine(unsubscribe_token);

  const html = brandShell(
    `<h1 style="margin:8px 0 14px;font-size:22px;">${escapeHtml(heading)}</h1>
       <p style="margin:0 0 12px;line-height:1.6;">${g.html}</p>
       ${paragraphsHtml(body)}
       <p style="margin:24px 0 0;color:#666;">— ${escapeHtml(v.signature)}</p>
       ${unsubscribeFooter(unsubscribe_token)}`,
    { wordmark: skin.wordmark, text: skin.light.text },
  );

  return sendEmail({ email, subject, text, html });
}

/** "Se ha liberado una plaza" — sent when the coach manually releases a waitlisted lead. */
export async function sendWaitlistReleasedEmail(input: WaitlistReleasedInput): Promise<WaitlistEmailResult> {
  const { email, nombre, cita_token, unsubscribe_token, coach_name, coach_id } =
    releasedInputSchema.parse(input);
  const skin = await resolveClubEmailSkin(coach_id ? BigInt(coach_id) : null);
  const v = coachVoice(coach_name, skin.wordmark);
  const g = greeting(nombre);
  const subject = `Se ha liberado una plaza — reserva tu llamada${v.withCoach}`;
  const heading = 'Se ha liberado tu plaza';
  const cta = citaUrl(cita_token);
  const ctaLabel = 'Reservar mi llamada';
  const body = [
    `Buenas noticias: se ha abierto una plaza en el grupo de ${v.object} y es para ti.`,
    `El siguiente paso es una videollamada de 30 minutos${v.withCoach} para ver tu caso y cómo enfocar tu plan. Elige el hueco que mejor te venga:`,
  ];

  const text =
    `${g.text}\n\n` +
    `${body.join('\n\n')}\n${cta}\n\n` +
    `— ${v.signature}\n\n` +
    unsubscribeTextLine(unsubscribe_token);

  const html = brandShell(
    `<h1 style="margin:8px 0 14px;font-size:22px;">${escapeHtml(heading)}</h1>
       <p style="margin:0 0 12px;line-height:1.6;">${g.html}</p>
       ${paragraphsHtml(body)}
       ${ctaButton(cta, ctaLabel, skin.light)}
       <p style="margin:24px 0 0;color:#666;">— ${escapeHtml(v.signature)}</p>
       ${unsubscribeFooter(unsubscribe_token)}`,
    { wordmark: skin.wordmark, text: skin.light.text },
  );

  return sendEmail({ email, subject, text, html });
}
