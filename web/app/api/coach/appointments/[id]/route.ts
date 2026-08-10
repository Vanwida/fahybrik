// PATCH /api/coach/appointments/[id] — coach acts on an appointment.
//   Body: { action: aceptar|rechazar|cancelar|completar|no_show, meet_link?, coach_note? }
//   accept → appointment=aceptada, lead→agendado, meet link via body/adapter, email+.ics.
//   reject/cancel → email to the lead. Coach-guarded, Zod-validated.

import type { NextResponse } from 'next/server';
import { appointmentActionInput } from '@fahybrid/shared/schema';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  actOnAppointment,
  CitasError,
  setAppointmentMeetLink,
  setAppointmentGoogleEventId,
  getStudioLocation,
  type AppointmentWithLead,
} from '@/lib/citas/store';
import { createMeeting } from '@/lib/citas/meeting';
import { deleteCalendarEvent } from '@/lib/citas/google';
import {
  sendAppointmentAccepted,
  sendAppointmentCancelled,
  sendAppointmentRejected,
} from '@/lib/citas/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    const n = BigInt(raw);
    return n > BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const apptId = parseId(id);
  if (apptId == null) return jsonError('invalid_id', 'id inválido', 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }
  const parsed = appointmentActionInput.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Datos no válidos', 400, parsed.error.flatten());
  }
  const { action, meet_link, coach_note } = parsed.data;

  const emailPayload = (
    a: AppointmentWithLead,
    location?: { name: string | null; address: string | null } | null,
  ) => ({
    id: a.id,
    requested_start: a.requested_start,
    duration_minutes: a.duration_minutes,
    meet_link: a.meet_link,
    lead_email: a.lead_email,
    lead_nombre: a.lead_nombre,
    lead_token: a.lead_token,
    modality: a.modality,
    location: location ?? null,
    // El club que atiende la cita (`coaches.full_name`), no el miembro que pulsó el
    // botón: el lead reservó con el club, y así el correo dice lo mismo lo firme quien
    // lo firme desde el panel.
    coach_name: session.club_name,
  });

  try {
    // Tenancy: scoped to the session's club through the cita's lead — an alien cita 404s.
    const res = await actOnAppointment({ id: apptId, coach_id: session.coach_id, action, meet_link, coach_note });
    let a = res.appointment;

    if (res.newStatus === 'aceptada') {
      // #40: presencial → the box address (coach profile). Single-coach global; null if unset.
      const studio = a.modality === 'presencial' ? await getStudioLocation() : null;
      const locationStr = studio
        ? [studio.name, studio.address].filter((s) => s && s.trim()).join(' — ') || null
        : null;
      // No manually-pasted link → ask the adapter (v1 → null; Google later). Best-effort.
      if (!a.meet_link) {
        const m = await createMeeting({
          appointmentId: a.id,
          start: new Date(a.requested_start),
          durationMinutes: a.duration_minutes,
          leadEmail: a.lead_email,
          leadName: a.lead_nombre,
          modality: a.modality,
          location: locationStr,
        });
        if (m.meet_link) {
          a = await setAppointmentMeetLink({
            id: apptId,
            coach_id: session.coach_id,
            meet_link: m.meet_link,
            google_event_id: m.event_id ?? null,
          });
        } else if (m.event_id) {
          // Presencial: no meet_link, but persist the event id so a cancel can delete it.
          await setAppointmentGoogleEventId(apptId, m.event_id);
          a = { ...a, google_event_id: m.event_id };
        }
      }
      await sendAppointmentAccepted(emailPayload(a, studio));
    } else if (res.newStatus === 'rechazada') {
      await sendAppointmentRejected(emailPayload(a));
    } else if (res.newStatus === 'cancelada') {
      // Best-effort: if the meeting was auto-created on Google, delete the calendar
      // event so a cancelled cita doesn't leave a stray Meet on Alex's calendar.
      if (a.google_event_id) await deleteCalendarEvent(a.google_event_id).catch(() => {});
      await sendAppointmentCancelled(emailPayload(a));
    }
    // completada / no_show → no lead email.

    return jsonOk({ appointment: a });
  } catch (err) {
    if (err instanceof CitasError) return jsonError(err.code, err.message, err.status);
    console.error('[PATCH /api/coach/appointments/[id]]', err);
    return jsonError('error', 'No se pudo actualizar la cita', 500);
  }
}
