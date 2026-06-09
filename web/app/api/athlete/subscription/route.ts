// GET /api/athlete/subscription
//
// Athlete-authenticated. Returns the athlete's current subscription summary as
// DB-mirrored (source of truth = `subscriptions`), plus the linked partner (for
// Dobles) so iOS Profile can render "Plan Dobles · con <partner> · próxima
// factura DD/MM" without round-tripping to Stripe.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { getSubscriptionByUserId, isActive } from '@/lib/stripe';
import { loadPartner } from '@/lib/partner/invitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) {
    return jsonError('unauthorized', 'Athlete session required', 401);
  }

  const sub = await getSubscriptionByUserId(sql, auth.user_id);
  const partner = await loadPartner(auth.user_id, sql);
  const partnerPayload = partner
    ? {
        user_id: partner.user_id.toString(),
        athlete_id: partner.athlete_id?.toString() ?? null,
        full_name: partner.full_name,
        email: partner.email,
      }
    : null;

  if (!sub) {
    return jsonOk({
      subscribed: false,
      status: null,
      plan_type: null,
      current_period_end: null,
      cancel_at_period_end: false,
      partner: partnerPayload,
    });
  }

  return jsonOk({
    subscribed: isActive(sub.status),
    status: sub.status,
    plan_type: sub.plan_type,
    current_period_end: sub.current_period_end?.toISOString() ?? null,
    cancel_at_period_end: sub.cancel_at_period_end,
    partner: partnerPayload,
  });
}
