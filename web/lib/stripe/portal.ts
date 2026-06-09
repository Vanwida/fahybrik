// Stripe Customer Portal session creation.
//
// The Customer Portal is hosted by Stripe; we just create a session URL
// and redirect the athlete there. They can update payment method,
// download invoices, and cancel — all without us writing any UI.

import { getStripeOrThrow } from './client';

export async function createPortalSession(args: {
  stripe_customer_id: string;
}): Promise<{ url: string }> {
  const { stripe, config } = getStripeOrThrow();
  const session = await stripe.billingPortal.sessions.create({
    customer: args.stripe_customer_id,
    return_url: config.portal_return_url,
  });
  return { url: session.url };
}
