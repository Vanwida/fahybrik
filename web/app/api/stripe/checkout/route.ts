// POST /api/stripe/checkout
//
// Athlete-authenticated. Body: { plan_type: 'individual'|'dobles'|'pro_elite' }.
// Creates (or reuses) a Stripe customer for the user, records a pending
// `subscriptions` row, and returns a Checkout Session URL. iOS opens this in
// Safari; Stripe handles the rest.
//
// Dobles: this only charges the payer. The partner is linked afterwards via the
// W4 invitation flow — the checkout stamps metadata { fahybrik_user_id,
// plan_type } so the webhook maps back without trusting client state.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import {
  createCheckoutSession,
  ensureCheckoutSubscriptionRow,
  getOrCreateStripeCustomer,
  isPlanType,
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

  // Server-side validation: plan_type is required and must be a known tier.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_body', 'Request body must be JSON', 400);
  }
  const plan_type = (body as { plan_type?: unknown })?.plan_type;
  if (!isPlanType(plan_type)) {
    return jsonError(
      'invalid_plan_type',
      "plan_type must be one of 'individual', 'dobles', 'pro_elite'",
      400,
    );
  }

  try {
    const customer = await getOrCreateStripeCustomer({
      user_id: auth.user_id,
      email: auth.email,
      full_name: auth.full_name,
    });
    const session = await createCheckoutSession({
      stripe_customer_id: customer.stripe_customer_id,
      user_id: auth.user_id,
      plan_type,
    });
    if (!session.ok) {
      // Tier price not configured in this environment (test mode partial).
      return gatedResponse([
        plan_type === 'pro_elite' ? 'STRIPE_PRICE_ID_PRO' : `STRIPE_PRICE_ID_${plan_type.toUpperCase()}`,
      ]);
    }
    // Record the pending subscription row so the webhook can attach the
    // Stripe subscription once payment confirms.
    await ensureCheckoutSubscriptionRow({
      client: sql,
      user_id: auth.user_id,
      plan_type,
      stripe_customer_id: customer.stripe_customer_id,
    });
    return jsonOk({ checkout_url: session.url, session_id: session.session_id });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return gatedResponse(err.missing);
    }
    const message = err instanceof Error ? err.message : 'stripe_error';
    return jsonError('stripe_checkout_failed', message, 502);
  }
}
