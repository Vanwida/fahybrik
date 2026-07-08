// POST /api/citas/book — public booking. Body: { token, start (ISO), website(honeypot) }.
// Token-gated (no auth), rate-limited, honeypot-guarded. AUTO-ACCEPT: the reservation IS
// the confirmed cita (no coach approval step) — bookAppointment creates it `aceptada` +
// advances the lead to `agendado`, we auto-create the Meet, and email the lead the
// confirmation with .ics + Meet link AT ONCE. Internal notify to hello@ stays (aviso, not
// approval). Race-safety lives in the store (per-slot advisory lock + one-active index).

import { bookingInput } from '@fahybrid/shared/schema';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';
import {
  bookAppointment,
  setAppointmentMeetLink,
  setAppointmentGoogleEventId,
  getStudioLocation,
  CitasError,
} from '@/lib/citas/store';
import { createMeeting } from '@/lib/citas/meeting';
import { sendBookingInternal, sendAppointmentAccepted } from '@/lib/citas/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = getClientIp(req) ?? 'unknown';
  const rl = await withRateLimit({ scope: 'ip', identifier: ip, ...RATE_LIMITS.citasBook });
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = bookingInput.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Datos no válidos', 400, parsed.error.flatten());
  }
  const { website, token, start, modality } = parsed.data;
  if (website && website.length > 0) return jsonOk({ ok: true }, 200); // honeypot

  try {
    const res = await bookAppointment({ token, startIso: start, modality });
    let meetLink = res.appointment.meet_link;

    // #40: presencial → the box address (coach profile). Single-coach global; null if unset.
    const studio = modality === 'presencial' ? await getStudioLocation() : null;
    const locationStr = studio
      ? [studio.name, studio.address].filter((s) => s && s.trim()).join(' — ') || null
      : null;

    // Auto-create the calendar event if connected (best-effort; null keeps the manual path).
    //   • video      → event WITH Meet → persist meet_link + event_id (email carries the link).
    //   • presencial → event WITH location, NO Meet → persist only event_id (cancel-hook).
    if (!meetLink) {
      const m = await createMeeting({
        appointmentId: res.appointment.id,
        start: new Date(res.appointment.requested_start),
        durationMinutes: res.appointment.duration_minutes,
        leadEmail: res.lead.email,
        leadName: res.lead.nombre,
        modality,
        location: locationStr,
      });
      if (m.meet_link) {
        await setAppointmentMeetLink({
          id: BigInt(res.appointment.id),
          meet_link: m.meet_link,
          google_event_id: m.event_id ?? null,
        });
        meetLink = m.meet_link;
      } else if (m.event_id) {
        // Presencial: no meet_link, but persist the event id so a cancel can delete it.
        await setAppointmentGoogleEventId(BigInt(res.appointment.id), m.event_id);
      }
    }

    const appt = {
      id: res.appointment.id,
      requested_start: res.appointment.requested_start,
      duration_minutes: res.appointment.duration_minutes,
      meet_link: meetLink,
      lead_email: res.lead.email,
      lead_nombre: res.lead.nombre,
      lead_token: token,
      modality,
      location: studio,
    };
    // Confirmation email (the accepted one: fecha + .ics + Meet/address) + internal notify. Guarded.
    await Promise.allSettled([sendAppointmentAccepted(appt), sendBookingInternal(appt)]);
    return jsonOk({ ok: true, appointment: { ...res.appointment, meet_link: meetLink } }, 201);
  } catch (err) {
    if (err instanceof CitasError) return jsonError(err.code, err.message, err.status);
    console.error('[POST /api/citas/book]', err);
    return jsonError('error', 'No se pudo reservar la cita', 500);
  }
}
