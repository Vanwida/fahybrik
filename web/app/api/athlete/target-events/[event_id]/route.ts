// DELETE /api/athlete/target-events/[event_id]
//
// Athletes can unmark a race (e.g. they decided not to enter). Coaches use
// the deep-dive admin to manage targets on athletes' behalf.

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { deleteAthleteTarget } from '@/lib/coach/events';

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

export async function DELETE(req: Request, ctx: Ctx): Promise<NextResponse> {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Athlete bearer required', 401);

  const { event_id } = await ctx.params;
  const id = parseEventId(event_id);
  if (id == null) {
    return jsonError('invalid_id', 'event_id must be a positive integer', 400);
  }

  try {
    await deleteAthleteTarget({ athlete_id: athlete.athlete_id, event_id: id });
    return jsonOk({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/athlete/target-events/[event_id]]', err);
    return jsonError('delete_failed', 'No se pudo eliminar el evento objetivo.', 500);
  }
}
