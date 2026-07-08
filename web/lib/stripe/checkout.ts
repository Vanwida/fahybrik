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

import type Stripe from 'stripe';
import { getStripeOrThrow } from './client';
import { priceIdForPlan, type PlanType } from './prices';

// ---------------------------------------------------------------------------
// Ad-hoc subscription Checkout (#15 — athlete alta)
//
// Unlike the tiered checkout above, the athlete-alta price is VARIABLE per
// athlete: the coach types a euros/mes figure in the alta modal. There is no
// Stripe Price object — we build a recurring monthly `price_data` on the fly.
//
// customer_email (NOT customer): the athlete has no Stripe customer yet, so
// Checkout creates one from the email at payment time. The webhook maps the
// resulting session back to our pending subscription by the Checkout session id
// (stored on subscriptions.checkout_session_id), never by the customer id.
// ---------------------------------------------------------------------------

/** Default product name shown on the Stripe Checkout + invoices. */
export const ALTA_PRODUCT_NAME = 'FAHYBRID · Entrenamiento personalizado';

/**
 * Plan FUNDADOR coupon id (100% off, duration=forever — created in Stripe).
 * A founder alta applies this so the athlete pays 0 and Stripe never asks for a
 * card, while the real (list) price stays on the subscription for MRR and for the
 * day the founder discount is lifted.
 */
export const FOUNDER_COUPON_ID = 'FUNDADOR';

export type CreateSubscriptionCheckoutAdHocArgs = {
  customer_email: string;
  /** Monthly price in integer cents (money is never a float). */
  amount_cents: number;
  /** ISO 4217 lowercase, e.g. 'eur'. */
  currency: string;
  /** Traceability stamped on the Session + the created Subscription. */
  metadata: Record<string, string>;
  /** Product name override (defaults to ALTA_PRODUCT_NAME). */
  product_name?: string;
  /**
   * Plan FUNDADOR: apply the FOUNDER_COUPON_ID (100%-off-forever) so the total is
   * 0 € and no payment method is collected. The line item keeps the real price.
   */
  founder?: boolean;
};

export type CreateSubscriptionCheckoutAdHocResult = {
  url: string;
  session_id: string;
};

/**
 * Build the recurring monthly `line_items` for an ad-hoc subscription Checkout.
 * Extracted (and exported) so it can be unit-tested without hitting Stripe.
 */
export function buildAdHocSubscriptionLineItems(args: {
  amount_cents: number;
  currency: string;
  product_name?: string;
}): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return [
    {
      price_data: {
        currency: args.currency,
        unit_amount: args.amount_cents,
        recurring: { interval: 'month' },
        product_data: { name: args.product_name ?? ALTA_PRODUCT_NAME },
      },
      quantity: 1,
    },
  ];
}

/**
 * Create an ad-hoc monthly subscription Checkout session for the athlete alta.
 * Throws StripeNotConfiguredError (via getStripeOrThrow) when Stripe is not
 * configured — callers gate on loadStripeConfig() FIRST so the PAID alta fails
 * cleanly before any DB write (no half-athlete).
 */
export async function createSubscriptionCheckoutAdHoc(
  args: CreateSubscriptionCheckoutAdHocArgs,
): Promise<CreateSubscriptionCheckoutAdHocResult> {
  const { stripe, config } = getStripeOrThrow();
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    customer_email: args.customer_email,
    line_items: buildAdHocSubscriptionLineItems({
      amount_cents: args.amount_cents,
      currency: args.currency,
      product_name: args.product_name,
    }),
    success_url: config.checkout_success_url,
    cancel_url: config.checkout_cancel_url,
    // Stamp both the Session and the Subscription so every downstream object is
    // traceable to the athlete/lead without trusting client state.
    metadata: args.metadata,
    subscription_data: { metadata: args.metadata },
  };
  if (args.founder) {
    // Plan FUNDADOR: 100%-off-forever coupon → total 0 €, and `if_required` means
    // Stripe collects NO card. The session still completes and fires
    // checkout.session.completed, so the pago→acceso webhook loop runs identically
    // at 0 €. The real price stays on the line item (MRR + de-founding later).
    params.discounts = [{ coupon: FOUNDER_COUPON_ID }];
    params.payment_method_collection = 'if_required';
  }
  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) {
    throw new Error('stripe_checkout_no_url');
  }
  return { url: session.url, session_id: session.id };
}

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
