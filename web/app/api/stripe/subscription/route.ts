// GET /api/stripe/subscription
//
// Athlete-authenticated. Legacy alias of GET /api/athlete/subscription kept for
// any iOS build that still hits this path. Returns the athlete's current
// subscription summary from the `subscriptions` table (source of truth).
//
// New clients should use GET /api/athlete/subscription (richer: includes
// plan_type + partner). This endpoint stays minimal for backwards compat.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { getSubscriptionByUserId, isActive } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) {
    return jsonError('unauthorized', 'Athlete session required', 401);
  }

  const sub = await getSubscriptionByUserId(sql, auth.user_id);
  if (!sub) {
    return jsonOk({
      subscribed: false,
      status: null,
      plan_type: null,
      current_period_end: null,
      cancel_at_period_end: false,
    });
  }

  return jsonOk({
    subscribed: isActive(sub.status),
    status: sub.status,
    plan_type: sub.plan_type,
    current_period_end: sub.current_period_end?.toISOString() ?? null,
    cancel_at_period_end: sub.cancel_at_period_end,
  });
}
