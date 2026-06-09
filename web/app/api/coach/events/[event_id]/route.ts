// Coach single-event API.
//
// PATCH /api/coach/events/[event_id]  — edit fields / toggle visibility

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import { EventsError, updateEvent } from '@/lib/coach/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ event_id: string }>;
}

function parseEventId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    const n = BigInt(raw);
    return n > BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  const coach = await getCoachSession();
  if (!coach) return jsonError('unauthorized', 'Coach session required', 401);

  const { event_id } = await ctx.params;
  const id = parseEventId(event_id);
  if (id == null) {
    return jsonError('invalid_id', 'event_id must be a positive integer', 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }

  try {
    const event = await updateEvent({ event_id: id, input: body });
    return jsonOk({ event });
  } catch (err) {
    if (err instanceof EventsError) {
      return jsonError(err.code, err.message, err.status);
    }
    console.error('[PATCH /api/coach/events/[event_id]]', err);
    return jsonError('update_failed', 'No se pudo actualizar el evento.', 500);
  }
}
