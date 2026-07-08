// Subscription DB sync (user-scoped, source of truth = `subscriptions`).
//
// "Is this athlete subscribed?" is answered from the `subscriptions` table.
// All writes flow through Stripe webhooks — never from client requests, never
// inferred from a checkout return URL.
//
// We map Stripe customers → our user via subscriptions.stripe_customer_id,
// which we set at checkout. The webhook then keeps status / period_end /
// cancel_at_period_end / plan_type in sync.
//
// Status mapping: the `subscription_status` enum (migration 0021) is a narrow
// set — active, past_due, canceled, incomplete, trialing. Stripe emits a wider
// set; we collapse unknowns / terminal-incomplete states to the nearest member.

import type Stripe from 'stripe';
import type { Sql } from '@/lib/db';
import { planForPriceId, type PlanType } from './prices';

export type SubscriptionStatusValue =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'trialing';

const STRIPE_TO_LOCAL: Record<string, SubscriptionStatusValue> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  unpaid: 'past_due',
  canceled: 'canceled',
  incomplete: 'incomplete',
  incomplete_expired: 'canceled',
  paused: 'incomplete',
};

export function mapStripeStatus(s: string): SubscriptionStatusValue {
  // Unknown future statuses coerce to 'incomplete' so the DB enum is never
  // violated; the webhook log captures the raw status for debugging.
  return STRIPE_TO_LOCAL[s] ?? 'incomplete';
}

/** Extract the price id from the first subscription item. */
function priceIdOf(sub: Stripe.Subscription): string | null {
  return sub.items.data[0]?.price?.id ?? null;
}

/** Extract current_period_end as an ISO string (handles SDK shape drift). */
function periodEndIso(sub: Stripe.Subscription): string | null {
  const item = sub.items.data[0];
  const periodEndUnix =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null;
  return periodEndUnix != null ? new Date(periodEndUnix * 1000).toISOString() : null;
}

export async function findUserIdByCustomerId(
  client: Sql,
  stripe_customer_id: string,
): Promise<bigint | null> {
  const rows = await client<{ user_id: string }[]>`
    select user_id::text as user_id
    from subscriptions
    where stripe_customer_id = ${stripe_customer_id}
    order by created_at desc
    limit 1
  `;
  if (!rows[0]) return null;
  return BigInt(rows[0].user_id);
}

/**
 * Create the initial `subscriptions` row at checkout time, before Stripe has
 * confirmed payment. status='incomplete' until the webhook activates it.
 *
 * Idempotent on (user_id, plan_type) with no live subscription: if a prior
 * incomplete row exists for the user+plan we update it rather than stacking
 * rows. A user resubscribing after cancel gets a fresh row only once the prior
 * one is canceled, which keeps stripe_subscription_id (unique) clean.
 */
export async function ensureCheckoutSubscriptionRow(args: {
  client: Sql;
  user_id: bigint;
  plan_type: PlanType;
  stripe_customer_id: string;
}): Promise<void> {
  const { client, user_id, plan_type, stripe_customer_id } = args;
  // Reuse an existing not-yet-active row for this user+plan (avoids a pile of
  // incomplete rows when the user re-opens checkout). Otherwise insert.
  const existing = await client<{ id: string }[]>`
    select id::text as id
    from subscriptions
    where user_id = ${user_id}
      and plan_type = ${plan_type}
      and status in ('incomplete', 'past_due')
      and stripe_subscription_id is null
    order by created_at desc
    limit 1
  `;
  if (existing[0]) {
    await client`
      update subscriptions
      set stripe_customer_id = ${stripe_customer_id},
          updated_at = now()
      where id = ${BigInt(existing[0].id)}
    `;
    return;
  }
  await client`
    insert into subscriptions (
      user_id, plan_type, stripe_customer_id, status, created_at, updated_at
    )
    values (
      ${user_id}, ${plan_type}, ${stripe_customer_id}, 'incomplete', now(), now()
    )
  `;
}

export type UpsertSubscriptionArgs = {
  client: Sql;
  user_id: bigint;
  subscription: Stripe.Subscription;
};

/**
 * Sync a Stripe subscription into the `subscriptions` table. Keyed by
 * stripe_subscription_id (unique). If the user already has an incomplete row
 * (created at checkout) WITHOUT a stripe_subscription_id, we attach to it;
 * otherwise we upsert by stripe_subscription_id.
 */
export async function upsertSubscription(args: UpsertSubscriptionArgs): Promise<void> {
  const { client, user_id, subscription: sub } = args;
  const status = mapStripeStatus(sub.status);
  const price_id = priceIdOf(sub);
  const resolvedPlan: PlanType | null = price_id ? planForPriceId(price_id) : null;
  const period_end = periodEndIso(sub);
  const cancel_at_period_end = sub.cancel_at_period_end === true;
  const customer_id = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;


  // Try to attach to a pending checkout row for this user that has no
  // stripe_subscription_id yet. We don't filter by plan_type in SQL (keeps the
  // query static); the checkout row's plan_type is authoritative and preserved
  // unless the webhook resolves a concrete tier from the price id.
  const pending = await client<{ id: string }[]>`
    select id::text as id
    from subscriptions
    where user_id = ${user_id}
      and stripe_subscription_id is null
    order by created_at desc
    limit 1
  `;

  if (pending[0]) {
    const pendingId = BigInt(pending[0].id);
    await client`
      update subscriptions
      set stripe_subscription_id = ${sub.id},
          stripe_customer_id = ${customer_id},
          status = ${status},
          current_period_end = ${period_end},
          cancel_at_period_end = ${cancel_at_period_end},
          updated_at = now()
      where id = ${pendingId}
    `;
    // Only overwrite plan_type when we could resolve a concrete tier from the
    // price id (avoids clobbering the checkout plan_type with a guess).
    if (resolvedPlan) {
      await client`
        update subscriptions
        set plan_type = ${resolvedPlan}, updated_at = now()
        where id = ${pendingId}
      `;
    }
    await backfillDoblesPartner(client, user_id);
    return;
  }

  // No pending row → upsert by stripe_subscription_id (unique constraint).
  // plan_type defaults to the resolved tier, else 'individual' (NOT NULL).
  const plan_type: PlanType = resolvedPlan ?? 'individual';
  await client`
    insert into subscriptions (
      user_id, plan_type, stripe_customer_id, stripe_subscription_id,
      status, current_period_end, cancel_at_period_end, created_at, updated_at
    )
    values (
      ${user_id},
      ${plan_type},
      ${customer_id},
      ${sub.id},
      ${status},
      ${period_end},
      ${cancel_at_period_end},
      now(),
      now()
    )
    on conflict (stripe_subscription_id) do update set
      status = excluded.status,
      plan_type = excluded.plan_type,
      stripe_customer_id = excluded.stripe_customer_id,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      updated_at = now()
  `;
  await backfillDoblesPartner(client, user_id);
}

/**
 * Dobles backfill: if this user is linked to a partner (users.partner_id) and
 * now holds a Dobles subscription, mirror the link onto
 * subscriptions.partner_user_id (both directions) so the cancellation cascade
 * can fire. No-op for individual/pro_elite or unlinked users.
 *
 * Lives here (not in lib/partner) to keep the webhook's only dependency the
 * subscriptions module; the link logic is symmetric with
 * lib/partner/invitations.setSubscriptionPartner.
 */
async function backfillDoblesPartner(client: Sql, user_id: bigint): Promise<void> {
  const rows = await client<{ partner_id: string | null }[]>`
    select partner_id::text as partner_id
    from users
    where id = ${user_id}
      and deleted_at is null
    limit 1
  `;
  const partnerId = rows[0]?.partner_id;
  if (!partnerId) return;
  const partnerUserId = BigInt(partnerId);
  // Point each side's most-relevant Dobles sub at the other. Symmetric with
  // setSubscriptionPartner — kept local to avoid a cross-module import in the
  // webhook hot path. Only Dobles subs are touched (plan_type filter).
  for (const [a, b] of [[user_id, partnerUserId], [partnerUserId, user_id]] as const) {
    await client`
      update subscriptions
      set partner_user_id = ${b}, updated_at = now()
      where id = (
        select id from subscriptions
        where user_id = ${a}
          and plan_type = 'dobles'
        order by
          case when status in ('active', 'trialing', 'past_due', 'incomplete') then 0 else 1 end,
          created_at desc
        limit 1
      )
  `;
  }
}

/**
 * Mark a subscription canceled by its Stripe subscription id. Returns the
 * row's BIGINT id + partner_user_id so the webhook can drive the Dobles
 * cascade. Returns null when no row matches (already-deleted / unknown sub).
 */
export async function markCanceled(args: {
  client: Sql;
  stripe_subscription_id: string;
}): Promise<{ id: bigint; partner_user_id: bigint | null } | null> {
  const rows = await args.client<
    { id: string; partner_user_id: string | null }[]
  >`
    update subscriptions
    set status = 'canceled',
        cancel_at_period_end = false,
        updated_at = now()
    where stripe_subscription_id = ${args.stripe_subscription_id}
    returning id::text as id, partner_user_id::text as partner_user_id
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: BigInt(row.id),
    partner_user_id: row.partner_user_id != null ? BigInt(row.partner_user_id) : null,
  };
}

export type SubscriptionRecord = {
  id: bigint;
  user_id: bigint;
  partner_user_id: bigint | null;
  plan_type: PlanType;
  status: SubscriptionStatusValue;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
};

/**
 * Load the user's most-relevant subscription: the newest active/trialing/
 * past_due row if any, else the newest row overall. Used by the athlete
 * subscription endpoint.
 */
export async function getSubscriptionByUserId(
  client: Sql,
  user_id: bigint,
): Promise<SubscriptionRecord | null> {
  const rows = await client<
    {
      id: string;
      user_id: string;
      partner_user_id: string | null;
      plan_type: string;
      status: string;
      current_period_end: Date | null;
      cancel_at_period_end: boolean;
    }[]
  >`
    select id::text as id, user_id::text as user_id,
      partner_user_id::text as partner_user_id, plan_type,
      status::text as status, current_period_end, cancel_at_period_end
    from subscriptions
    where user_id = ${user_id}
    order by
      case when status in ('active', 'trialing', 'past_due') then 0 else 1 end,
      created_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: BigInt(row.id),
    user_id: BigInt(row.user_id),
    partner_user_id: row.partner_user_id != null ? BigInt(row.partner_user_id) : null,
    plan_type: row.plan_type as PlanType,
    status: row.status as SubscriptionStatusValue,
    current_period_end: row.current_period_end,
    cancel_at_period_end: row.cancel_at_period_end,
  };
}

export function isActive(status: string): boolean {
  return status === 'active' || status === 'trialing';
}

// ---------------------------------------------------------------------------
// Athlete alta payment core (#15)
// ---------------------------------------------------------------------------

export type AltaPendingSubscription = {
  id: bigint;
  user_id: bigint;
};

/**
 * Map a Stripe Checkout session id back to our PENDING alta subscription. The
 * webhook keys on this (never the customer id) because Checkout creates the
 * customer from customer_email at payment time — so at alta time we only know
 * the session id, which we stamped on the row. Returns null when the session id
 * belongs to a non-alta (legacy tiered) checkout or an unknown session.
 */
export async function findAltaSubscriptionByCheckoutSession(
  client: Sql,
  checkout_session_id: string,
): Promise<AltaPendingSubscription | null> {
  const rows = await client<{ id: string; user_id: string }[]>`
    select id::text as id, user_id::text as user_id
    from subscriptions
    where checkout_session_id = ${checkout_session_id}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: BigInt(row.id), user_id: BigInt(row.user_id) };
}

/**
 * Claim-before-send stamp for the post-payment ACCESS email. Atomic: the single
 * UPDATE with `access_email_sent_at is null` in the WHERE clause means a
 * duplicate webhook (Stripe retries) finds the row already stamped and gets 0
 * rows back — so the caller sends the access email EXACTLY once. Returns true
 * iff THIS call won the claim (i.e. it must now send the email).
 */
export async function claimAccessEmailStamp(
  client: Sql,
  subscription_id: bigint,
): Promise<boolean> {
  const rows = await client<{ id: string }[]>`
    update subscriptions
    set access_email_sent_at = now(), updated_at = now()
    where id = ${subscription_id}
      and access_email_sent_at is null
    returning id::text as id
  `;
  return rows.length > 0;
}

/**
 * Release the claim so a later Stripe retry can re-send. Called when minting the
 * invite or sending the access email FAILED after we claimed the stamp — the
 * atomic claim/clear pair keeps the "exactly once on success" guarantee while
 * still allowing retries on transient failures.
 */
export async function clearAccessEmailStamp(
  client: Sql,
  subscription_id: bigint,
): Promise<void> {
  await client`
    update subscriptions
    set access_email_sent_at = null, updated_at = now()
    where id = ${subscription_id}
  `;
}

export type MirrorInvoiceInput = {
  subscription_id: bigint;
  stripe_invoice_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
};

/**
 * Upsert a Stripe invoice into the local `athlete_invoices` mirror (Pagos
 * history). Idempotent: keyed on stripe_invoice_id (unique) so a redelivered
 * invoice.paid / invoice.payment_failed updates status/paid_at instead of
 * duplicating a row.
 */
export async function upsertAthleteInvoice(
  client: Sql,
  input: MirrorInvoiceInput,
): Promise<void> {
  await client`
    insert into athlete_invoices (
      subscription_id, stripe_invoice_id, amount_cents, currency,
      status, period_start, period_end, paid_at
    )
    values (
      ${input.subscription_id}, ${input.stripe_invoice_id}, ${input.amount_cents},
      ${input.currency}, ${input.status}, ${input.period_start}::date,
      ${input.period_end}::date, ${input.paid_at}::timestamptz
    )
    on conflict (stripe_invoice_id) do update set
      amount_cents = excluded.amount_cents,
      currency = excluded.currency,
      status = excluded.status,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      paid_at = excluded.paid_at
  `;
}

/** Resolve our subscription bigint id from a Stripe subscription id. */
export async function findSubscriptionIdByStripeSubId(
  client: Sql,
  stripe_subscription_id: string,
): Promise<bigint | null> {
  const rows = await client<{ id: string }[]>`
    select id::text as id
    from subscriptions
    where stripe_subscription_id = ${stripe_subscription_id}
    limit 1
  `;
  return rows[0] ? BigInt(rows[0].id) : null;
}
