import 'server-only';

// Coach billing ACTIONS (#15) — the money-critical writes behind the Pagos
// surfaces + the #13 lifecycle. Every Stripe call is GUARDED: when Stripe is not
// configured for the environment, or the athlete has no LIVE Stripe subscription
// yet (still pending payment / comp), the action degrades to a clean no-op (or the
// local column write only) instead of crashing. Callers in the lifecycle wrap
// these in try/catch too, so a Stripe outage never breaks a pause/baja transition.
//
//   * updateAgreedPrice        — write the variable price locally + (best-effort)
//                                swap the live Stripe subscription's price.
//   * pauseStripeCollection    — Stripe pauses invoicing (behavior: 'void').
//   * resumeStripeCollection   — clear the pause.
//   * cancelStripeAtPeriodEnd  — flag the live sub to cancel at period end.
//
// The subscription we act on is the athlete's MOST-RELEVANT one — the same row
// getAthleteBilling / listCoachBilling read (newest active/trialing/past_due,
// else newest) — so the UI and the mutation never target different rows.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { ALTA_PRODUCT_NAME, getStripeOrThrow, loadStripeConfig } from '@/lib/stripe';

/** Why a Stripe-side action did not run (the local state is still authoritative). */
export type BillingActionSkipReason = 'not_configured' | 'no_live_sub' | 'stripe_error';

export interface BillingActionResult {
  /** true when the Stripe side actually ran; false when it was skipped/degraded. */
  stripe_synced: boolean;
  /** Present only when stripe_synced is false — the honest reason it was skipped. */
  reason?: BillingActionSkipReason;
}

interface AthleteSubRow {
  /** Our BIGINT subscriptions.id. */
  sub_id: bigint;
  /** The Stripe subscription id, or null when the sub is still pending / comp. */
  stripe_subscription_id: string | null;
  /** ISO 4217 lowercase currency of the agreed price. */
  currency: string;
}

/**
 * Resolve the athlete's most-relevant subscription row (id + Stripe linkage +
 * currency). Mirrors the ordering getAthleteBilling uses so a mutation always
 * targets the same row the coach sees. Returns null when the athlete has no
 * subscription at all.
 */
async function loadAthleteSubscription(
  athlete_id: bigint,
  client: Sql,
): Promise<AthleteSubRow | null> {
  const rows = await client<
    { id: string; stripe_subscription_id: string | null; currency: string | null }[]
  >`
    select
      s.id::text                as id,
      s.stripe_subscription_id  as stripe_subscription_id,
      s.currency                as currency
    from athletes a
    join subscriptions s on s.user_id = a.user_id
    where a.id = ${athlete_id}
    order by
      case when s.status in ('active', 'trialing', 'past_due') then 0 else 1 end,
      s.created_at desc
    limit 1
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    sub_id: BigInt(r.id),
    stripe_subscription_id: r.stripe_subscription_id,
    currency: r.currency ?? 'eur',
  };
}

/**
 * Update the coach-agreed monthly price for an athlete.
 *
 * ALWAYS writes the local `subscriptions.agreed_price_cents` (authoritative for
 * the Pagos display + MRR). When Stripe is configured AND the athlete has a LIVE
 * subscription, it also swaps the live price: creates a fresh ad-hoc monthly
 * price and points the subscription item at it. The Stripe swap is BEST-EFFORT —
 * a failure there never throws (the local price is recoverable by re-editing);
 * a still-pending (no stripe_subscription_id) or comp athlete just gets the
 * local column updated.
 *
 * `amount_cents` must be a positive integer (validated at the API boundary).
 */
export async function updateAgreedPrice(args: {
  athlete_id: bigint;
  amount_cents: number;
  client?: Sql;
}): Promise<BillingActionResult> {
  const client = args.client ?? defaultSql;
  const sub = await loadAthleteSubscription(args.athlete_id, client);
  if (!sub) {
    // No subscription row → nothing to price. The UI never shows the editor in
    // this state, so treat it as a clean no-op rather than an error.
    return { stripe_synced: false, reason: 'no_live_sub' };
  }

  // 1) Local column — always. This drives the Pagos display + MRR immediately.
  await client`
    update subscriptions
    set agreed_price_cents = ${args.amount_cents}, updated_at = now()
    where id = ${sub.sub_id}
  `;

  // 2) Stripe swap — only with a live sub + configured Stripe, and best-effort.
  if (!sub.stripe_subscription_id) return { stripe_synced: false, reason: 'no_live_sub' };
  if (!loadStripeConfig().ok) return { stripe_synced: false, reason: 'not_configured' };

  try {
    const { stripe } = getStripeOrThrow();
    const live = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const itemId = live.items.data[0]?.id;
    if (!itemId) return { stripe_synced: false, reason: 'no_live_sub' };

    // A fresh ad-hoc monthly price (no reusable Price object — the amount is
    // variable per athlete, exactly like the alta Checkout).
    const price = await stripe.prices.create({
      currency: sub.currency,
      unit_amount: args.amount_cents,
      recurring: { interval: 'month' },
      product_data: { name: ALTA_PRODUCT_NAME },
    });
    // Swap the item to the new price. proration_behavior 'none' → the new price
    // applies from the next cycle; the coach's edit never surprise-charges the
    // athlete mid-period.
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: itemId, price: price.id }],
      proration_behavior: 'none',
    });
    return { stripe_synced: true };
  } catch {
    return { stripe_synced: false, reason: 'stripe_error' };
  }
}

/**
 * Run a guarded update against the athlete's LIVE Stripe subscription. Returns a
 * clean no-op when Stripe is unconfigured or there is no live sub yet. Never
 * throws — the mutate callback runs inside a try/catch so a Stripe outage can't
 * break a lifecycle transition.
 */
async function withLiveStripeSub(
  athlete_id: bigint,
  client: Sql,
  mutate: (stripe_subscription_id: string) => Promise<void>,
): Promise<BillingActionResult> {
  if (!loadStripeConfig().ok) return { stripe_synced: false, reason: 'not_configured' };
  const sub = await loadAthleteSubscription(athlete_id, client);
  if (!sub?.stripe_subscription_id) return { stripe_synced: false, reason: 'no_live_sub' };
  try {
    await mutate(sub.stripe_subscription_id);
    return { stripe_synced: true };
  } catch {
    return { stripe_synced: false, reason: 'stripe_error' };
  }
}

/**
 * PAUSE collection on the athlete's live Stripe subscription (behavior 'void':
 * invoices during the pause are voided, so the athlete is not charged while
 * paused). No-op when unconfigured / no live sub. Wired into #13 pauseAthlete.
 */
export async function pauseStripeCollection(
  athlete_id: bigint,
  client: Sql = defaultSql,
): Promise<BillingActionResult> {
  return withLiveStripeSub(athlete_id, client, async (subId) => {
    const { stripe } = getStripeOrThrow();
    await stripe.subscriptions.update(subId, { pause_collection: { behavior: 'void' } });
  });
}

/**
 * RESUME collection — clear the pause so Stripe invoices again. No-op when
 * unconfigured / no live sub. Wired into #13 resumeAthlete.
 */
export async function resumeStripeCollection(
  athlete_id: bigint,
  client: Sql = defaultSql,
): Promise<BillingActionResult> {
  return withLiveStripeSub(athlete_id, client, async (subId) => {
    const { stripe } = getStripeOrThrow();
    // Passing '' clears pause_collection (Stripe's Emptyable convention).
    await stripe.subscriptions.update(subId, { pause_collection: '' });
  });
}

/**
 * CANCEL the athlete's live Stripe subscription AT PERIOD END (access continues
 * until the paid period elapses). The local cancel_at_period_end flag is already
 * set by the #13 baja transaction; this makes it real in Stripe. No-op when
 * unconfigured / no live sub.
 */
export async function cancelStripeAtPeriodEnd(
  athlete_id: bigint,
  client: Sql = defaultSql,
): Promise<BillingActionResult> {
  return withLiveStripeSub(athlete_id, client, async (subId) => {
    const { stripe } = getStripeOrThrow();
    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
  });
}

/**
 * UNDO a pending cancellation — the athlete scheduled a baja from the app and then
 * changed their mind before the period elapsed (#13, 0137). Only valid while the
 * subscription is still live; once Stripe has actually deleted it, coming back is a
 * new checkout, not an un-cancel. No-op when unconfigured / no live sub.
 */
export async function uncancelStripeAtPeriodEnd(
  athlete_id: bigint,
  client: Sql = defaultSql,
): Promise<BillingActionResult> {
  return withLiveStripeSub(athlete_id, client, async (subId) => {
    const { stripe } = getStripeOrThrow();
    await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
  });
}
