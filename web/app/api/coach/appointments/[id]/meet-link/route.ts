// POST /api/coach/appointments/[id]/meet-link — paste/replace the Meet link on an
// appointment and re-send the confirmation email (with the link). Coach-guarded.

import type { NextResponse } from 'next/server';
import { appointmentMeetLinkInput } from '@fahybrid/shared/schema';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { CitasError, setAppointmentMeetLink } from '@/lib/citas/store';
import { sendAppointmentAccepted } from '@/lib/citas/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, ctx: Ctx): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return jsonError('invalid_id', 'id inválido', 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }
  const parsed = appointmentMeetLinkInput.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Enlace no válido', 400, parsed.error.flatten());
  }

  try {
    const a = await setAppointmentMeetLink({ id: BigInt(id), meet_link: parsed.data.meet_link });
    // Re-send the confirmation with the fresh link only if the appointment is confirmed.
    if (a.status === 'aceptada') {
      await sendAppointmentAccepted({
        id: a.id,
        requested_start: a.requested_start,
        duration_minutes: a.duration_minutes,
        meet_link: a.meet_link,
        lead_email: a.lead_email,
        lead_nombre: a.lead_nombre,
        lead_token: a.lead_token,
      });
    }
    return jsonOk({ appointment: a });
  } catch (err) {
    if (err instanceof CitasError) return jsonError(err.code, err.message, err.status);
    console.error('[POST /api/coach/appointments/[id]/meet-link]', err);
    return jsonError('error', 'No se pudo guardar el enlace', 500);
  }
}
