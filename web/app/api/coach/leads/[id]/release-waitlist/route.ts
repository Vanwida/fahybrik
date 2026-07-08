// POST /api/coach/leads/[id]/release-waitlist — MANUALLY open a plaza to a waitlisted lead (#18).
// Coach-guarded. Stamps waitlist_released_at (idempotent) and emails the lead the booking
// link. Body carries no fields (the leadId in the path is the whole input) — validated for
// shape all the same.
//
// Delivery model: the release stamp is DURABLE — once the coach commits a plaza to this lead
// it stays released even if the email fails (the coach opened the plaza; we just owe the
// notification). The email itself is de-duped via a lead_nurture_log claim (touch_type
// 'waitlist_released', the same claim-before-send pattern as nurture): claim, send, and on a
// failed send DELETE the claim so a retry re-sends. On email failure we KEEP the release and
// return 502 so the coach knows the notification didn't go out.

import { z } from 'zod';
import { sql } from '@/lib/db';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { releaseWaitlistLead } from '@/lib/leads/waitlist';
import { sendWaitlistReleasedEmail } from '@/lib/leads/waitlist-email';
import { WAITLIST_RELEASED_TOUCH } from '@fahybrid/shared/domain/leads/nurture';

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
    const { released, lead } = await releaseWaitlistLead(leadId);
    if (!lead) {
      // Never on the waitlist → nothing to release.
      return jsonError('not_waitlisted', 'El lead no está en lista de espera', 409);
    }

    // Claim-before-send: only the first successful send persists a log row (a failed send
    // deletes its claim below), so a lost claim ⇒ the release email already went out.
    const claim = await sql<{ id: string }[]>`
      insert into lead_nurture_log (lead_id, touch_type)
      values (${Number(leadId)}, ${WAITLIST_RELEASED_TOUCH})
      on conflict (lead_id, touch_type) do nothing
      returning id::text as id
    `;
    if (claim.length === 0) {
      // Already emailed on a prior release → idempotent success.
      return jsonOk({ released, emailed: true });
    }

    const emailRes = await sendWaitlistReleasedEmail({
      email: lead.email,
      nombre: lead.nombre,
      cita_token: lead.token,
      unsubscribe_token: lead.unsubscribe_token,
    });

    if (!emailRes.sent) {
      // Keep the release stamped; drop the claim so a retry re-sends. Surface 502 (same body
      // shape as success) so the coach sees the plaza opened but the email didn't go out.
      await sql`delete from lead_nurture_log where id = ${Number(claim[0]!.id)}`;
      return jsonOk({ released, emailed: false }, 502);
    }

    return jsonOk({ released, emailed: true });
  } catch (err) {
    console.error('[POST /api/coach/leads/[id]/release-waitlist]', err);
    return jsonError('release_failed', 'No se pudo liberar la plaza', 500);
  }
}
