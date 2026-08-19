// Appointment emails (Resend) — reuses the same guarded sender as the lead emails
// (aistudios.pro verified domain; see lib/leads/email.ts). Every send is guarded: if
// RESEND_API_KEY is unset it logs + returns {sent:false} instead of throwing, so the
// booking/accept flow is never blocked by delivery.
//
//   • booking received  → lead ("recibimos tu solicitud, tu coach la confirma")
//   • booking internal  → coach team (LEADS_NOTIFY_EMAIL): "nueva solicitud de cita"
//   • accepted          → lead ("cita confirmada") + .ics attachment (+ Meet link if any)
//   • rejected          → lead ("elige otro hueco") with the re-book link
//   • cancelled         → lead
//
// EL NOMBRE DEL COACH ES DATO, NO PLANTILLA. Cada envío recibe `coach_name` (el del
// coach de ESE lead/atleta) y la copia pide fragmentos a `coachVoice` en vez de
// interpolar el nombre pelado. Importa más aquí que en un push: el `.ics` se queda en
// el calendario del atleta para siempre, y un correo no se retira.

import { Resend } from 'resend';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { buildIcs } from '@fahybrid/shared/domain/citas/ics';
import type { CitaModality } from '@fahybrid/shared/schema';
import { coachVoice } from '@/lib/coach/voice';
import { resolveClubEmailSkin, type ClubEmailSkin } from '@/lib/coach/club-skin';

export interface CitaEmailResult {
  sent: boolean;
  skipped_reason?: 'resend_not_configured' | 'resend_send_failed';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** e.g. "jueves 10 de julio, 18:00" (Europe/Madrid). */
export function formatMadrid(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d);
  const time = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return `${day}, ${time}`;
}

function bookingUrl(token: string): string {
  return `${AUTH_CONFIG.appUrl().replace(/\/$/, '')}/es/cita/${token}`;
}

interface Appt {
  id: string;
  requested_start: string;
  duration_minutes: number;
  meet_link: string | null;
  lead_email: string;
  lead_nombre: string | null;
  lead_token: string;
  /** #40: videollamada (Meet) o presencial (en el box, con dirección). */
  modality: CitaModality;
  /** #40: presencial address (coach profile: studio_name + location). Null/absent = sin fijar. */
  location?: { name: string | null; address: string | null } | null;
  /**
   * Nombre del coach que atiende esta cita (`coaches.full_name`). Null/vacío → la copia
   * se queda sin la coletilla «con X» y se lee igual de bien.
   */
  coach_name?: string | null;
  /** El club que atiende esta cita — pinta su piel (nombre + acento) en el correo al
   *  lead. Ausente/nulo → marca de este binario, como hoy. */
  coach_id?: bigint | number | null;
}

// #40: presencial address helpers. Builds a one-line address ("Box — Calle") for display + the
// .ics LOCATION, and a Google Maps deep link. Either part (name/address) may be null/blank.
const MAPS_SEARCH_BASE = 'https://www.google.com/maps/search/?api=1&query=';

function presentAddress(location: { name: string | null; address: string | null } | null | undefined): {
  hasAddress: boolean;
  addressStr: string;
  mapsUrl: string | null;
} {
  const parts = [location?.name, location?.address].filter((s): s is string => Boolean(s && s.trim()));
  const hasAddress = parts.length > 0;
  return {
    hasAddress,
    addressStr: parts.join(' — '),
    mapsUrl: hasAddress ? `${MAPS_SEARCH_BASE}${encodeURIComponent(parts.join(', '))}` : null,
  };
}

/** The noun for the cita in copy: "sesión presencial" vs "videollamada" (#40). */
function citaNoun(modality: CitaModality): string {
  return modality === 'presencial' ? 'sesión presencial' : 'videollamada';
}

// `skin` es la piel del club de ESTA cita (`resolveClubEmailSkin`, superficie `light`
// — este shell es de fondo blanco). Sin skin, pinta exactamente lo de hoy: wordmark
// "FAHYBRID" en el naranja fijo.
const shell = (inner: string, skin?: ClubEmailSkin) => {
  const wordmark = skin?.wordmark ?? 'FAHYBRID';
  const textColor = skin?.light.text ?? '#F06A2A';
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0a0a0a;background:#fff;">
     <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${textColor};">${escapeHtml(wordmark)}</p>${inner}
   </div>`;
};

async function send(opts: {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  ics?: { filename: string; content: string };
}): Promise<CitaEmailResult> {
  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) {
    console.warn('[citas/email] RESEND_API_KEY not configured — skipping', { to: opts.to, subject: opts.subject });
    return { sent: false, skipped_reason: 'resend_not_configured' };
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: AUTH_CONFIG.resendFromEmail(),
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.ics
      ? [{ filename: opts.ics.filename, content: opts.ics.content }]
      : undefined,
  });
  if (error) {
    console.error('[citas/email] send failed', { subject: opts.subject, error: error.message });
    return { sent: false, skipped_reason: 'resend_send_failed' };
  }
  return { sent: true };
}

/** Lead: "recibimos tu solicitud de cita". */
export async function sendBookingReceived(appt: Appt): Promise<CitaEmailResult> {
  const skin = await resolveClubEmailSkin(appt.coach_id ?? null);
  const when = formatMadrid(appt.requested_start);
  const hi = appt.lead_nombre ? `Hola ${escapeHtml(appt.lead_nombre.split(' ')[0])},` : 'Hola,';
  const noun = citaNoun(appt.modality);
  const v = coachVoice(appt.coach_name);
  return send({
    to: appt.lead_email,
    subject: `Hemos recibido tu solicitud de cita · ${skin.wordmark}`,
    text:
      `${appt.lead_nombre ? `Hola ${appt.lead_nombre.split(' ')[0]},` : 'Hola,'}\n\n` +
      `Hemos recibido tu solicitud de ${noun}${v.withCoach} para el ${when} (hora de Madrid). ` +
      `${v.subject} la confirmará en breve y te llegará un email con los detalles.\n\nEl equipo de ${skin.wordmark}`,
    html: shell(
      `<h1 style="margin:8px 0 14px;font-size:22px;">Solicitud de cita recibida</h1>
       <p style="margin:0 0 12px;line-height:1.6;">${hi}</p>
       <p style="margin:0 0 12px;line-height:1.6;">Hemos recibido tu solicitud de ${noun}${escapeHtml(v.withCoach)} para el <strong>${escapeHtml(when)}</strong> (hora de Madrid). ${escapeHtml(v.subject)} la confirmará en breve y te llegará un email con los detalles.</p>
       <p style="margin:24px 0 0;color:#666;">El equipo de ${escapeHtml(skin.wordmark)}</p>`,
      skin,
    ),
  });
}

/** Coach team: "nueva solicitud de cita". */
export async function sendBookingInternal(appt: Appt): Promise<CitaEmailResult> {
  const to = process.env.LEADS_NOTIFY_EMAIL ?? 'hello@fahybrid.com';
  const when = formatMadrid(appt.requested_start);
  const name = appt.lead_nombre || appt.lead_email;
  const noun = citaNoun(appt.modality);
  return send({
    to,
    replyTo: appt.lead_email,
    subject: `Nueva solicitud de cita · ${name}`,
    text: `${name} (${appt.lead_email}) ha solicitado una ${noun} para el ${when} (Madrid). Acéptala o recházala en el dashboard.`,
    html: shell(
      `<h1 style="margin:8px 0 14px;font-size:22px;">Nueva solicitud de cita</h1>
       <p style="margin:0 0 8px;line-height:1.6;"><strong>${escapeHtml(name)}</strong> · <a href="mailto:${escapeHtml(appt.lead_email)}" style="color:#0a0a0a;">${escapeHtml(appt.lead_email)}</a></p>
       <p style="margin:0 0 12px;line-height:1.6;">Ha solicitado una ${noun} para el <strong>${escapeHtml(when)}</strong> (Madrid). Acéptala o recházala en el dashboard.</p>`,
    ),
  });
}

/**
 * Lead: "cita confirmada" + .ics.
 *   • video      → Meet button/link (or "te llegará antes"); .ics LOCATION = meet_link.
 *   • presencial → the box address + a Google Maps link; .ics LOCATION = the address.
 *                  No address on file → honest fallback ("te confirmará el sitio").
 */
export async function sendAppointmentAccepted(appt: Appt): Promise<CitaEmailResult> {
  const skin = await resolveClubEmailSkin(appt.coach_id ?? null);
  const when = formatMadrid(appt.requested_start);
  const hi = appt.lead_nombre ? `Hola ${escapeHtml(appt.lead_nombre.split(' ')[0])},` : 'Hola,';
  const hiText = appt.lead_nombre ? `Hola ${appt.lead_nombre.split(' ')[0]},` : 'Hola,';
  const organizerEmail = process.env.LEADS_NOTIFY_EMAIL ?? 'hello@fahybrid.com';
  const v = coachVoice(appt.coach_name);

  if (appt.modality === 'presencial') {
    const { hasAddress, addressStr, mapsUrl } = presentAddress(appt.location);
    const whereText = hasAddress
      ? `Dónde: ${addressStr}${mapsUrl ? `\nCómo llegar: ${mapsUrl}` : ''}`
      : `${v.subject} te confirmará el sitio antes de la cita.`;
    const whereHtml = hasAddress
      ? `<p style="margin:0 0 6px;line-height:1.6;"><strong>Dónde</strong><br>${escapeHtml(addressStr)}</p>` +
        (mapsUrl
          ? `<p style="margin:0 0 12px;"><a href="${escapeHtml(mapsUrl)}" style="display:inline-block;padding:12px 20px;background:${skin.light.fill};color:${skin.light.on_fill};text-decoration:none;border-radius:8px;font-weight:600;">Cómo llegar</a></p>`
          : '')
      : `<p style="margin:0 0 12px;line-height:1.6;color:#444;">${escapeHtml(v.subject)} te confirmará el sitio antes de la cita.</p>`;

    const ics = buildIcs({
      uid: `appt-${appt.id}@fahybrid.com`,
      start: new Date(appt.requested_start),
      durationMinutes: appt.duration_minutes,
      summary: `Sesión${v.withCoach} (presencial) · ${skin.wordmark}`,
      description: hasAddress
        ? `Sesión presencial${v.withCoach}. Dónde: ${addressStr}`
        : `Sesión presencial${v.withCoach}. ${v.subject} te confirmará el sitio.`,
      location: hasAddress ? addressStr : 'Sesión presencial',
      organizerEmail,
      attendeeEmail: appt.lead_email,
    });

    return send({
      to: appt.lead_email,
      subject: `Sesión presencial confirmada${v.withCoach} · ${skin.wordmark}`,
      text:
        `${hiText}\n\n` +
        `Tu sesión presencial${v.withCoach} está confirmada para el ${when} (hora de Madrid). 30 minutos.\n\n` +
        `${whereText}\n\nAdjuntamos el evento para tu calendario.\n\nEl equipo de ${skin.wordmark}`,
      html: shell(
        `<h1 style="margin:8px 0 14px;font-size:22px;">Sesión confirmada</h1>
         <p style="margin:0 0 12px;line-height:1.6;">${hi}</p>
         <p style="margin:0 0 12px;line-height:1.6;">Tu sesión presencial${escapeHtml(v.withCoach)} está confirmada para el <strong>${escapeHtml(when)}</strong> (hora de Madrid). 30 minutos.</p>
         ${whereHtml}
         <p style="margin:16px 0 0;color:#666;font-size:13px;">Adjuntamos el evento para tu calendario.</p>`,
        skin,
      ),
      ics: { filename: 'cita-fahybrid.ics', content: Buffer.from(ics, 'utf8').toString('base64') },
    });
  }

  // Video (default / backward-compatible).
  const linkLine = appt.meet_link
    ? `Enlace de la videollamada: ${appt.meet_link}`
    : 'El enlace de la videollamada te llegará antes de la cita.';
  const linkHtml = appt.meet_link
    ? `<p style="margin:0 0 12px;"><a href="${escapeHtml(appt.meet_link)}" style="display:inline-block;padding:12px 20px;background:${skin.light.fill};color:${skin.light.on_fill};text-decoration:none;border-radius:8px;font-weight:600;">Unirme a la videollamada</a></p>`
    : `<p style="margin:0 0 12px;line-height:1.6;color:#444;">El enlace de la videollamada te llegará antes de la cita.</p>`;

  const ics = buildIcs({
    uid: `appt-${appt.id}@fahybrid.com`,
    start: new Date(appt.requested_start),
    durationMinutes: appt.duration_minutes,
    summary: `Videollamada${v.withCoach} · ${skin.wordmark}`,
    description: appt.meet_link ? `Videollamada: ${appt.meet_link}` : `Videollamada${v.withCoach}.`,
    location: appt.meet_link ?? 'Videollamada',
    organizerEmail,
    attendeeEmail: appt.lead_email,
  });

  return send({
    to: appt.lead_email,
    subject: `Cita confirmada${v.withCoach} · ${skin.wordmark}`,
    text:
      `${hiText}\n\n` +
      `Tu videollamada${v.withCoach} está confirmada para el ${when} (hora de Madrid). 30 minutos.\n\n` +
      `${linkLine}\n\nAdjuntamos el evento para tu calendario.\n\nEl equipo de ${skin.wordmark}`,
    html: shell(
      `<h1 style="margin:8px 0 14px;font-size:22px;">Cita confirmada</h1>
       <p style="margin:0 0 12px;line-height:1.6;">${hi}</p>
       <p style="margin:0 0 12px;line-height:1.6;">Tu videollamada${escapeHtml(v.withCoach)} está confirmada para el <strong>${escapeHtml(when)}</strong> (hora de Madrid). 30 minutos.</p>
       ${linkHtml}
       <p style="margin:16px 0 0;color:#666;font-size:13px;">Adjuntamos el evento para tu calendario.</p>`,
      skin,
    ),
    ics: { filename: 'cita-fahybrid.ics', content: Buffer.from(ics, 'utf8').toString('base64') },
  });
}

/** Lead: "elige otro hueco" with the re-book link. */
export async function sendAppointmentRejected(appt: Appt): Promise<CitaEmailResult> {
  const skin = await resolveClubEmailSkin(appt.coach_id ?? null);
  const url = bookingUrl(appt.lead_token);
  const hi = appt.lead_nombre ? `Hola ${escapeHtml(appt.lead_nombre.split(' ')[0])},` : 'Hola,';
  const v = coachVoice(appt.coach_name);
  return send({
    to: appt.lead_email,
    subject: `Sobre tu cita${v.withCoach} · ${skin.wordmark}`,
    text:
      `${appt.lead_nombre ? `Hola ${appt.lead_nombre.split(' ')[0]},` : 'Hola,'}\n\n` +
      `${v.subject} no puede en el hueco que elegiste. Elige otro que te venga bien aquí:\n${url}\n\nEl equipo de ${skin.wordmark}`,
    html: shell(
      `<h1 style="margin:8px 0 14px;font-size:22px;">Elijamos otro hueco</h1>
       <p style="margin:0 0 12px;line-height:1.6;">${hi}</p>
       <p style="margin:0 0 12px;line-height:1.6;">${escapeHtml(v.subject)} no puede en el hueco que elegiste. Elige otro que te venga bien:</p>
       <p style="margin:0 0 12px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:${skin.light.fill};color:${skin.light.on_fill};text-decoration:none;border-radius:8px;font-weight:600;">Elegir otro hueco</a></p>`,
      skin,
    ),
  });
}

/** Lead: "cita cancelada". */
export async function sendAppointmentCancelled(appt: Appt): Promise<CitaEmailResult> {
  const skin = await resolveClubEmailSkin(appt.coach_id ?? null);
  const url = bookingUrl(appt.lead_token);
  const when = formatMadrid(appt.requested_start);
  const hi = appt.lead_nombre ? `Hola ${escapeHtml(appt.lead_nombre.split(' ')[0])},` : 'Hola,';
  const noun = citaNoun(appt.modality);
  const v = coachVoice(appt.coach_name);
  return send({
    to: appt.lead_email,
    subject: `Tu cita${v.withCoach} se ha cancelado · ${skin.wordmark}`,
    text:
      `${appt.lead_nombre ? `Hola ${appt.lead_nombre.split(' ')[0]},` : 'Hola,'}\n\n` +
      `Tu ${noun} del ${when} se ha cancelado. Puedes reservar otra aquí:\n${url}\n\nEl equipo de ${skin.wordmark}`,
    html: shell(
      `<h1 style="margin:8px 0 14px;font-size:22px;">Cita cancelada</h1>
       <p style="margin:0 0 12px;line-height:1.6;">${hi}</p>
       <p style="margin:0 0 12px;line-height:1.6;">Tu ${noun} del <strong>${escapeHtml(when)}</strong> se ha cancelado. Puedes reservar otra cuando quieras:</p>
       <p style="margin:0 0 12px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:${skin.light.fill};color:${skin.light.on_fill};text-decoration:none;border-radius:8px;font-weight:600;">Reservar otra cita</a></p>`,
      skin,
    ),
  });
}
