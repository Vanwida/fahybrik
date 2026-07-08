// POST /api/coach/leads/[id]/release-waitlist — MANUALLY open a plaza to a waitlisted lead (#18).
// Coach-guarded. Stamps waitlist_released_at (idempotent) and emails the lead the booking
// link. Body carries no fields (the leadId in the path is the whole input) — validated for
// shape all the same.
//
// Delivery model: the release stamp is DURABLE — once the coach commits a plaza to this lead
// it stays released even if the email fails (the coach opened the plaza; we just owe the
// notification). The stamp+claim-before-send+notify lives in the shared releaseAndNotifyLead
// (lib/leads/waitlist) — the SAME path the automatic FIFO release uses — so this route only maps
// its result to HTTP: found=false ⇒ 409, email failed ⇒ 502 (release kept), else ⇒ 200.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { releaseAndNotifyLead } from '@/lib/leads/waitlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

// No body fields expected; validate the shape so a malformed body is rejected cleanly.
const releaseBodySchema = z.object({}).passthrough();

function parseLeadId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    const n = BigInt(raw);
    return n > BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const leadId = parseLeadId(id);
  if (leadId == null) return jsonError('invalid_id', 'id debe ser un entero positivo', 400);

  // Body is optional/empty; tolerate no body, but validate whatever arrives.
  let raw: unknown = {};
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  if (!releaseBodySchema.safeParse(raw).success) {
    return jsonError('validation_error', 'Cuerpo no válido', 400);
  }

  try {
    // Shared stamp+notify path (also used by the automatic FIFO release). This override just
    // jumps the queue — it releases THIS lead regardless of FIFO position.
    const { found, released, emailed } = await releaseAndNotifyLead(leadId);
    if (!found) {
      // Never on the waitlist → nothing to release.
      return jsonError('not_waitlisted', 'El lead no está en lista de espera', 409);
    }
    if (!emailed) {
      // Release is DURABLE (stamped) but the email didn't go out. Surface 502 (same body shape
      // as success) so the coach sees the plaza opened but the notification failed.
      return jsonOk({ released, emailed: false }, 502);
    }
    return jsonOk({ released, emailed: true });
  } catch (err) {
    console.error('[POST /api/coach/leads/[id]/release-waitlist]', err);
    return jsonError('release_failed', 'No se pudo liberar la plaza', 500);
  }
}
