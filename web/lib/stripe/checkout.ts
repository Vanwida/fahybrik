// Stripe Checkout session creation (multi-tier).
//
// Mode: subscription. The price is resolved from the requested plan_type via
// lib/stripe/prices.ts (individual / dobles / pro_elite). iOS opens the
// returned URL in Safari; Stripe handles the rest.
//
// We always pass a `customer` (never `customer_email`) so the session attaches
// to the existing Stripe customer for the user — invoice history stays on one
// customer record across resubscribes.
//
// Dobles: the checkout only ever charges the payer (user_a). The partner is
// linked AFTER payment via the W4 invitation flow. We stamp metadata
// { fahybrik_user_id, plan_type } so the webhook can map back without trusting
// client state.

import { getStripeOrThrow } from './client';
import { priceIdForPlan, type PlanType } from './prices';

export type CreateCheckoutSessionArgs = {
  stripe_customer_id: string;
  // Used in metadata for traceability and webhook fallback when the customer
  // object isn't enough to map back to a user.
  user_id: bigint;
  plan_type: PlanType;
};

export type CreateCheckoutSessionResult =
  | { ok: true; url: string; session_id: string }
  | { ok: false; reason: 'price_not_configured' };

export async function createCheckoutSession(
  args: CreateCheckoutSessionArgs,
): Promise<CreateCheckoutSessionResult> {
  const price_id = priceIdForPlan(args.plan_type);
  if (!price_id) {
    return { ok: false, reason: 'price_not_configured' };
  }

  const { stripe, config } = getStripeOrThrow();
  const metadata = {
    fahybrik_user_id: args.user_id.toString(),
    plan_type: args.plan_type,
  };
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: args.stripe_customer_id,
    line_items: [{ price: price_id, quantity: 1 }],
    success_url: config.checkout_success_url,
    cancel_url: config.checkout_cancel_url,
    allow_promotion_codes: true,
    subscription_data: { metadata },
    metadata,
  });
  if (!session.url) {
    throw new Error('stripe_checkout_no_url');
  }
  return { ok: true, url: session.url, session_id: session.id };
}
