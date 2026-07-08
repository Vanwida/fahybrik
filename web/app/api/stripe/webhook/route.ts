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
  findSubscriptionIdByStripeSubId,
  upsertAthleteInvoice,
} from '@/lib/stripe';
import { activateAltaOnCheckout } from '@/lib/stripe/alta-activation';
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

// checkout.session.completed: the payer finished checkout.
//
// First try the #15 athlete-alta path — it maps the session id → our pending
// subscription, activates it, and sends the ACCESS (claim) email EXACTLY once
// (claim-before-send stamp). If the session is not an alta session, fall back to
// the legacy tiered-checkout sync. Both are idempotent under Stripe retries.
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const activation = await activateAltaOnCheckout({ client: sql, session });
  if (activation.matched) return;

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
  // Mirror the invoice into the local Pagos history (idempotent on invoice id).
  await mirrorInvoice(invoice);
}

async function handleInvoiceFailed(invoice: Stripe.Invoice): Promise<void> {
  const sub_id = extractSubscriptionId(invoice);
  if (!sub_id) return;
  // Stripe sets the sub to 'past_due' automatically; refetch to mirror.
  const { stripe } = getStripeOrThrow();
  const sub = await stripe.subscriptions.retrieve(sub_id);
  const customer_id = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const user_id = await findUserIdByCustomerId(sql, customer_id);
  // Mirror the failed invoice regardless of whether we can map the customer
  // (drives "Cobro en riesgo" in the Pagos history).
  await mirrorInvoice(invoice);
  if (!user_id) return;
  await upsertSubscription({ client: sql, user_id, subscription: sub });
  // Notify the athlete (and their coach) that the payment failed.
  await notifyPaymentFailed({ client: sql, user_id });
}

// Upsert a Stripe invoice into `athlete_invoices` (Pagos history). No-op when the
// invoice has no subscription or the subscription isn't tracked locally yet.
// Idempotent: upsertAthleteInvoice keys on the unique stripe_invoice_id.
async function mirrorInvoice(invoice: Stripe.Invoice): Promise<void> {
  const stripe_sub_id = extractSubscriptionId(invoice);
  if (!stripe_sub_id) return;
  const subscription_id = await findSubscriptionIdByStripeSubId(sql, stripe_sub_id);
  if (!subscription_id) return;

  const inv = invoice as unknown as {
    id?: string | null;
    amount_paid?: number | null;
    amount_due?: number | null;
    total?: number | null;
    currency?: string | null;
    status?: string | null;
    period_start?: number | null;
    period_end?: number | null;
    status_transitions?: { paid_at?: number | null } | null;
  };
  if (!inv.id) return;

  await upsertAthleteInvoice(sql, {
    subscription_id,
    stripe_invoice_id: inv.id,
    amount_cents: inv.amount_paid ?? inv.amount_due ?? inv.total ?? 0,
    currency: inv.currency ?? 'eur',
    status: inv.status ?? 'open',
    period_start: unixToIsoDate(inv.period_start),
    period_end: unixToIsoDate(inv.period_end),
    paid_at: unixToIso(inv.status_transitions?.paid_at ?? null),
  });
}

function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = (invoice as unknown as { subscription?: string | { id: string } | null })
    .subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}

/** Unix seconds → 'YYYY-MM-DD' (date column), or null. */
function unixToIsoDate(unix: number | null | undefined): string | null {
  if (unix == null) return null;
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

/** Unix seconds → ISO timestamp (timestamptz column), or null. */
function unixToIso(unix: number | null | undefined): string | null {
  if (unix == null) return null;
  return new Date(unix * 1000).toISOString();
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
