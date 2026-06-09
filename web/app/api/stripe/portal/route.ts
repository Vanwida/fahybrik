// POST /api/stripe/portal
//
// Athlete-authenticated. Returns a Stripe Customer Portal URL where the
// athlete can manage payment method, view invoices, and cancel.
//
// 404 when the athlete has no Stripe customer yet (i.e. they never went
// through checkout) — iOS should hide the "Gestionar suscripción" button
// in that case.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import {
  createPortalSession,
  loadStripeConfig,
  gatedResponse,
  StripeNotConfiguredError,
} from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const cfg = loadStripeConfig();
  if (!cfg.ok) return gatedResponse(cfg.missing);

  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) {
    return jsonError('unauthorized', 'Athlete session required', 401);
  }

  const rows = await sql<{ stripe_customer_id: string }[]>`
    select stripe_customer_id
    from subscriptions
    where user_id = ${auth.user_id}
      and stripe_customer_id is not null
    order by created_at asc
    limit 1
  `;
  const stripe_customer_id = rows[0]?.stripe_customer_id;
  if (!stripe_customer_id) {
    return jsonError(
      'no_customer',
      'No subscription found. Start a subscription first.',
      404,
    );
  }

  try {
    const session = await createPortalSession({ stripe_customer_id });
    return jsonOk({ url: session.url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return gatedResponse(err.missing);
    }
    const message = err instanceof Error ? err.message : 'stripe_error';
    return jsonError('stripe_portal_failed', message, 502);
  }
}
