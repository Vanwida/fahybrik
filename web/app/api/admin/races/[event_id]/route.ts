// Admin single-race API (phase 2c) — owner/admin only.
//
//   PATCH /api/admin/races/[event_id]
//     Edit any field, resolve tentative→confirmed (is_tentative=false + date),
//     toggle is_visible_to_athletes, and set/clear verification. A `verified`
//     boolean in the body maps to verified_by_user_id (true ⇒ this admin,
//     false ⇒ cleared, omitted ⇒ left unchanged) — never a client-supplied id.

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireAdmin } from '@/lib/auth/require-admin';
import { EventsError, updateEvent } from '@/lib/coach/events';
import { adminRaceUpdateInput } from '@fahybrid/shared/schema/events';

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
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

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

  const parsed = adminRaceUpdateInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      'invalid_request',
      'Revisa los campos de la carrera.',
      400,
      parsed.error.flatten(),
    );
  }
  const { verified, ...eventInput } = parsed.data;

  // undefined ⇒ leave verification untouched; true ⇒ this admin; false ⇒ clear.
  const verified_by_user_id =
    verified === undefined ? undefined : verified ? auth.session.user_id : null;

  try {
    const event = await updateEvent({
      event_id: id,
      verified_by_user_id,
      input: eventInput,
    });
    return jsonOk({ race: event });
  } catch (err) {
    if (err instanceof EventsError) {
      return jsonError(err.code, err.message, err.status);
    }
    console.error('[PATCH /api/admin/races/[event_id]]', err);
    return jsonError('update_failed', 'No se pudo actualizar la carrera.', 500);
  }
}
