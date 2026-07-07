// T-24h reminder email (Resend) — the lead's "mañana a las HH:MM" nudge before an
// accepted videollamada with Pablo. NEW file on purpose: it mirrors lib/citas/email.ts
// (same guarded sender, same brand shell) but is triggered by the hourly reminder cron,
// not by a coach action, so it lives on its own to keep each surface single-purpose.
//
// Guarded like every other citas email: if RESEND_API_KEY is unset it logs + returns
// {sent:false} instead of throwing, so a delivery blip never crashes the cron.

import { Resend } from 'resend';
import { z } from 'zod';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import type { CitaEmailResult } from './email';

// Brand tokens. Email HTML can't rely on CSS custom properties (mail clients strip
// them), so the palette is inlined — named here as the single source within this file.
const BRAND_INK = '#0a0a0a';
const BRAND_ORANGE = '#F06A2A';

// escapeHtml + shell are intentionally re-declared here (their originals are private to
// lib/citas/email.ts and we must not touch that file). Small, self-contained, no drift risk.
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

/** "HH:MM" in the given timezone (24h, es-ES). */
function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

// External-ish input (traces to lead-submitted email + a possibly-external meet link):
// validate the shape before we build/send. Fails closed with a thrown ZodError the cron
// catches per-appointment, so one bad row never aborts the batch.
const reminderInputSchema = z.object({
  requested_start: z.string().datetime({ offset: true }),
  meet_link: z.string().url().nullable(),
  lead_email: z.string().email(),
  lead_nombre: z.string().nullable(),
  // No timezone column on leads today → defaults to Europe/Madrid (BOX_TIMEZONE).
  // Kept as a param so adding a lead tz later is a one-line change in reminder.ts.
  timezone: z.string().optional(),
});

export type CitaReminderInput = z.infer<typeof reminderInputSchema>;

/**
 * Lead: "Mañana a las HH:MM · tu videollamada con Pablo" (+ Meet link if present).
 * Time is rendered in the lead's timezone when provided, else Europe/Madrid.
 */
export async function sendCitaReminderEmail(input: CitaReminderInput): Promise<CitaEmailResult> {
  const { requested_start, meet_link, lead_email, lead_nombre, timezone } =
    reminderInputSchema.parse(input);
  const tz = timezone ?? BOX_TIMEZONE;
  const madrid = tz === BOX_TIMEZONE;

  const time = formatTime(requested_start, tz);
  const hi = lead_nombre ? `Hola ${escapeHtml(lead_nombre.split(' ')[0])},` : 'Hola,';
  const hiText = lead_nombre ? `Hola ${lead_nombre.split(' ')[0]},` : 'Hola,';
  const tzNote = madrid ? ' (hora de Madrid)' : '';

  const linkText = meet_link
    ? `Enlace de la videollamada: ${meet_link}`
    : 'El enlace de la videollamada te llegará antes de la cita.';
  const linkHtml = meet_link
    ? `<p style="margin:0 0 12px;"><a href="${escapeHtml(meet_link)}" style="display:inline-block;padding:12px 20px;background:${BRAND_ORANGE};color:${BRAND_INK};text-decoration:none;border-radius:8px;font-weight:600;">Unirme a la videollamada</a></p>`
    : `<p style="margin:0 0 12px;line-height:1.6;color:#444;">El enlace de la videollamada te llegará antes de la cita.</p>`;

  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) {
    // No console.log in prod paths: warn is the repo's guarded-send convention (email.ts).
    console.warn('[citas/reminder-email] RESEND_API_KEY not configured — skipping', {
      to: lead_email,
    });
    return { sent: false, skipped_reason: 'resend_not_configured' };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: AUTH_CONFIG.resendFromEmail(),
    to: lead_email,
    subject: `Mañana a las ${time} · tu videollamada con Pablo`,
    text:
      `${hiText}\n\n` +
      `Recordatorio: mañana a las ${time}${tzNote} tienes tu videollamada con Pablo. Dura 30 minutos.\n\n` +
      `${linkText}\n\n¡Nos vemos!\nEl equipo de FAHYBRID`,
    html: shell(
      `<h1 style="margin:8px 0 14px;font-size:22px;">Mañana a las ${escapeHtml(time)}</h1>
       <p style="margin:0 0 12px;line-height:1.6;">${hi}</p>
       <p style="margin:0 0 12px;line-height:1.6;">Un recordatorio rápido: <strong>mañana a las ${escapeHtml(time)}${escapeHtml(tzNote)}</strong> tienes tu videollamada con Pablo. Dura 30 minutos.</p>
       ${linkHtml}
       <p style="margin:24px 0 0;color:#666;">¡Nos vemos! · El equipo de FAHYBRID</p>`,
    ),
  });

  if (error) {
    console.error('[citas/reminder-email] send failed', { to: lead_email, error: error.message });
    return { sent: false, skipped_reason: 'resend_send_failed' };
  }
  return { sent: true };
}
