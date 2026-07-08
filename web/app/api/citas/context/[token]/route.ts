// GET /api/citas/context/[token] — public booking-page data for a lead's opaque token:
// { lead:{nombre}, active_appointment | null, slots }. No auth (token IS the credential);
// rate-limited. Never exposes the numeric id.

import type { NextResponse } from 'next/server';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';
import { CitasError, getBookingContext } from '@/lib/citas/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ token: string }>;
}

export async function GET(req: Request, ctx: Ctx): Promise<NextResponse> {
  const ip = getClientIp(req) ?? 'unknown';
  const rl = await withRateLimit({ scope: 'ip', identifier: ip, ...RATE_LIMITS.citasContext });
  if (!rl.allowed) return rateLimitResponse(rl);

  const { token } = await ctx.params;
  if (!token || token.length < 10) return jsonError('invalid_token', 'Enlace no válido', 400);

  try {
    const context = await getBookingContext(token);
    // Only expose the lead's first name publicly (no email/phone/id on this endpoint).
    const first = (context.lead.nombre ?? '').trim().split(/\s+/)[0] ?? '';
    return jsonOk({
      nombre: first,
      active_appointment: context.active_appointment,
      slots: context.slots,
      waitlisted: context.waitlisted, // #18: UI shows the "en lista de espera" state instead of slots
    });
  } catch (err) {
    if (err instanceof CitasError) return jsonError(err.code, err.message, err.status);
    console.error('[GET /api/citas/context]', err);
    return jsonError('error', 'No se pudo cargar la cita', 500);
  }
}
