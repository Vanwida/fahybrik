// POST /api/stripe/webhook
//
// Stripe webhook receiver. MUST verify the signature before doing anything
// else — see lib/stripe/webhook.ts (constructEvent: parses Stripe-Signature,
// checks timestamp tolerance for replay, timing-safe HMAC compare).
//
// Source of truth: the `subscriptions` table (user-scoped, Finding M9).
//
// Events handled:
//   * checkout.session.completed      → activate subscription (attach sub id)
//   * customer.subscription.created   → upsert (status / period / plan)
//   * customer.subscription.updated   → upsert
//   * customer.subscription.deleted   → mark canceled + Dobles cascade
//   * invoice.paid / payment_succeeded→ ensure active (defensive)
//   * invoice.payment_failed          → past_due + notify athlete + coach
//
// All other events are 200'd to stop Stripe retries.
//
// Idempotency: webhooks redeliver. Our DB ops are upserts keyed by
// stripe_subscription_id (unique) or attach to a pending checkout row, so
// re-applying is safe. The cascade inserts a duplicate in-app notification on
// redelivery (low blast radius, acceptable).

import type Stripe from 'stripe';
import { sql } from '@/lib/db';
import {
  findUserIdByCustomerId,
  upsertSubscription,
  markCanceled,
  loadStripeConfig,
  gatedResponse,
  verifyWebhook,
  getStripeOrThrow,
  StripeNotConfiguredError,
} from '@/lib/stripe';
import { handleSubscriptionCancellation } from '@/lib/partner/cascade';
import { notifyPaymentFailed } from '@/lib/stripe/notifications';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const cfg = loadStripeConfig();
  if (!cfg.ok) return gatedResponse(cfg.missing);

  const raw_body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const verified = verifyWebhook({ raw_body, signature_header: sig });
  if (!verified.ok) {
    return jsonError(401, 'invalid_signature', verified.reason);
  }

  const event = verified.event;
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.resumed':
      case 'customer.subscription.paused':
      case 'customer.subscription.trial_will_end':
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        // Unhandled — return 200 so Stripe stops retrying.
        break;
    }
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return gatedResponse(err.missing);
    }
    captureRouteError(err, {
      route: 'api/stripe/webhook.POST',
      meta: { event_type: event.type, event_id: event.id },
    });
    const message = err instanceof Error ? err.message : 'webhook_error';
    return jsonError(500, 'webhook_processing_failed', message);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// checkout.session.completed: the payer finished checkout. Retrieve the
// subscription it created and sync it (status active, period_end, plan).
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const subId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;
  if (!subId) return; // not a subscription checkout
  const { stripe } = getStripeOrThrow();
  const sub = await stripe.subscriptions.retrieve(subId);
  await syncSubscription(sub);
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription): Promise<void> {
  await syncSubscription(sub);
}

// Resolve the user from the subscription's customer (set at checkout via the
// pending subscriptions row) and upsert. If we can't map the customer yet
// (e.g. created in dashboard), we log + ignore; the next event succeeds.
async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const customer_id = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const user_id = await findUserIdByCustomerId(sql, customer_id);
  if (!user_id) {
    console.warn('[stripe/webhook] unknown customer, skipping', { customer_id });
    return;
  }
  await upsertSubscription({ client: sql, user_id, subscription: sub });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const result = await markCanceled({ client: sql, stripe_subscription_id: sub.id });
  if (!result) return;
  // Dobles cascade: if this subscription has a linked partner, both users lose
  // access. handleSubscriptionCancellation notifies each affected user.
  if (result.partner_user_id) {
    await handleSubscriptionCancellation(result.id, 'stripe_subscription_deleted', {
      client: sql,
    });
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const sub_id = extractSubscriptionId(invoice);
  if (!sub_id) return;
  const { stripe } = getStripeOrThrow();
  const sub = await stripe.subscriptions.retrieve(sub_id);
  await syncSubscription(sub);
}

async function handleInvoiceFailed(invoice: Stripe.Invoice): Promise<void> {
  const sub_id = extractSubscriptionId(invoice);
  if (!sub_id) return;
  // Stripe sets the sub to 'past_due' automatically; refetch to mirror.
  const { stripe } = getStripeOrThrow();
  const sub = await stripe.subscriptions.retrieve(sub_id);
  const customer_id = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const user_id = await findUserIdByCustomerId(sql, customer_id);
  if (!user_id) return;
  await upsertSubscription({ client: sql, user_id, subscription: sub });
  // Notify the athlete (and their coach) that the payment failed.
  await notifyPaymentFailed({ client: sql, user_id });
}

function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = (invoice as unknown as { subscription?: string | { id: string } | null })
    .subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
