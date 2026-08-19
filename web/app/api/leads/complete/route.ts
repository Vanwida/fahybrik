// POST /api/leads/complete — full lead submit (two-phase, phase 2).
//
// Fired at the end of the onboarding (after teléfono + RGPD consent). Overwrites the
// lead row with the full answers, sets status='nuevo', stamps consent + audit, and
// fires two emails: internal notification (to the coach team) + confirmation to the
// lead, que nombra al coach de ESE lead.
// Emails are guarded (skip if Resend unconfigured) and never block the response.

import { leadSubmitInput } from '@fahybrid/shared/schema';
import { sql } from '@/lib/db';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';
import { upsertLeadComplete } from '@/lib/leads/store';
import { sendLeadConfirmation, sendLeadNotification } from '@/lib/leads/email';
import { getCapacityState, type CapacityState } from '@/lib/coach/capacity';
import { coachIdForLead, coachNameForLead, funnelCoachId } from '@/lib/leads/funnel-coach';
import { countWaitlist, joinWaitlist } from '@/lib/leads/waitlist';
import { sendWaitlistJoinedEmail } from '@/lib/leads/waitlist-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = getClientIp(req) ?? 'unknown';
  const rl = await withRateLimit({ scope: 'ip', identifier: ip, ...RATE_LIMITS.leadsSubmit });
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = leadSubmitInput.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Datos no válidos', 400, parsed.error.flatten());
  }

  const { website, ...input } = parsed.data;
  if (website && website.length > 0) {
    return jsonOk({ ok: true }, 200); // honeypot — feign success, persist nothing
  }

  const res = await upsertLeadComplete(input, {
    ip: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
  });

  // CAPACITY GATE (#18). Only a FRESH lead (status ended up 'nuevo') can be waitlisted — a
  // lead the coach already worked (contactado/agendado/convertido/descartado) keeps its
  // booking token and is never retroactively waitlisted. `full` = the FUNNEL club (leads
  // carry no club column until obra 3 — lib/leads/funnel-coach.ts) is capped and at/over
  // the cap right now (uncapped club → never full → this whole branch is skipped).
  let capacity: CapacityState | null = null;
  if (res.status === 'nuevo') {
    const funnelCoach = await funnelCoachId();
    capacity = funnelCoach !== null ? await getCapacityState(funnelCoach) : null;
  }

  // El coach de ESTE lead, ya grabado en la fila por el upsert (migración 0147). Se lee de
  // la fila y no del entorno: si mañana un lead entra por otro enlace, el correo lo nombra
  // a él sin tocar esto.
  const coachName = await coachNameForLead(sql, BigInt(res.id));
  const coachId = await coachIdForLead(sql, BigInt(res.id));
  if (capacity?.full) {
    const jw = await joinWaitlist(res.id); // idempotent; returns the lead's contact for the email
    // Waitlist-joined email instead of the booking confirmation; internal notify stays.
    await Promise.allSettled([
      sendLeadNotification(input),
      jw
        ? sendWaitlistJoinedEmail({
            email: jw.email,
            nombre: jw.nombre,
            unsubscribe_token: jw.unsubscribe_token,
            coach_name: coachName,
          })
        : Promise.resolve(),
    ]);
    // Position = how many leads are actively waiting (this one just joined, so it's last).
    const waitlist_position = await countWaitlist();
    // Back-compat: always include `waitlisted`. NO token — a waitlisted lead can't book yet.
    return jsonOk(
      { ok: true, lead_id: res.id, status: res.status, waitlisted: true, waitlist_position },
      res.created ? 201 : 200,
    );
  }

  // Not full (or an already-worked lead): unchanged behaviour. Fire both emails; guarded
  // senders return a result rather than throwing. The confirmation carries the booking link
  // (/es/cita/[token]) so a lead who didn't pick a slot on the final screen can still book.
  await Promise.allSettled([
    sendLeadNotification(input),
    sendLeadConfirmation(input, res.token, coachName, coachId),
  ]);

  // Return the token so the onboarding final screen can offer the slot picker inline.
  return jsonOk(
    { ok: true, lead_id: res.id, status: res.status, token: res.token, waitlisted: false },
    res.created ? 201 : 200,
  );
}
