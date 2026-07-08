// Coach + athlete billing reads (Pagos section, #15).
//
// Read-only. Source of truth: the user-scoped `subscriptions` table joined to
// `athletes` via athletes.user_id → subscriptions.user_id, plus the local
// `athlete_invoices` mirror populated by the Stripe webhooks.
//
// Money is the variable, coach-agreed price (subscriptions.agreed_price_cents),
// NOT a placeholder — comp (courtesy) athletes carry no price and are excluded
// from MRR but still surfaced (tagged is_comp).
//
// These are the contracts the Pagos-UI consumes.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { SubscriptionStatusValue } from '@/lib/stripe';

// ---------------------------------------------------------------------------
// Per-athlete billing (athlete surface + coach roster row)
// ---------------------------------------------------------------------------

export type AthleteBilling = {
  agreed_price_cents: number | null;
  currency: string;
  status: SubscriptionStatusValue | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  is_comp: boolean;
};

/**
 * The athlete's most-relevant subscription for billing display: the newest
 * active/trialing/past_due row, else the newest overall. Returns null when the
 * athlete has no subscription at all.
 */
export async function getAthleteBilling(
  athlete_id: bigint,
  client: Sql = defaultSql,
): Promise<AthleteBilling | null> {
  const rows = await client<
    {
      agreed_price_cents: number | null;
      currency: string | null;
      status: string;
      current_period_end: Date | null;
      cancel_at_period_end: boolean | null;
      source: string | null;
    }[]
  >`
    select
      s.agreed_price_cents           as agreed_price_cents,
      s.currency                     as currency,
      s.status::text                 as status,
      s.current_period_end           as current_period_end,
      s.cancel_at_period_end         as cancel_at_period_end,
      s.source                       as source
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
    agreed_price_cents: r.agreed_price_cents,
    currency: r.currency ?? 'eur',
    status: r.status as SubscriptionStatusValue,
    current_period_end: r.current_period_end?.toISOString() ?? null,
    cancel_at_period_end: r.cancel_at_period_end ?? false,
    is_comp: r.source === 'comp',
  };
}

// ---------------------------------------------------------------------------
// Invoice history (mirrored from Stripe by the webhooks)
// ---------------------------------------------------------------------------

export type AthleteInvoice = {
  id: string;
  stripe_invoice_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  created_at: string;
};

/** All mirrored invoices for an athlete, newest first. */
export async function listAthleteInvoices(
  athlete_id: bigint,
  client: Sql = defaultSql,
): Promise<AthleteInvoice[]> {
  const rows = await client<
    {
      id: string;
      stripe_invoice_id: string;
      amount_cents: number;
      currency: string;
      status: string;
      period_start: Date | null;
      period_end: Date | null;
      paid_at: Date | null;
      created_at: Date;
    }[]
  >`
    select
      ai.id::text               as id,
      ai.stripe_invoice_id      as stripe_invoice_id,
      ai.amount_cents           as amount_cents,
      ai.currency               as currency,
      ai.status                 as status,
      ai.period_start           as period_start,
      ai.period_end             as period_end,
      ai.paid_at                as paid_at,
      ai.created_at             as created_at
    from athlete_invoices ai
    join subscriptions s on s.id = ai.subscription_id
    join athletes a on a.user_id = s.user_id
    where a.id = ${athlete_id}
    order by ai.created_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    stripe_invoice_id: r.stripe_invoice_id,
    amount_cents: r.amount_cents,
    currency: r.currency,
    status: r.status,
    period_start: r.period_start ? r.period_start.toISOString().slice(0, 10) : null,
    period_end: r.period_end ? r.period_end.toISOString().slice(0, 10) : null,
    paid_at: r.paid_at?.toISOString() ?? null,
    created_at: r.created_at.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Coach roster billing (Pagos section)
// ---------------------------------------------------------------------------

export type CoachBillingRow = {
  athlete_id: string;
  full_name: string;
  email: string;
  status: SubscriptionStatusValue | null;
  is_comp: boolean;
  agreed_price_cents: number | null;
  currency: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
};

export type CoachBilling = {
  athletes: CoachBillingRow[];
  active_count: number;
  past_due_count: number;
  canceled_count: number;
  not_subscribed_count: number;
  comp_count: number;
  upcoming_renewals_7d: CoachBillingRow[];
  // Sum of agreed_price_cents across active + trialing NON-comp subscriptions.
  mrr_cents: number;
};

/**
 * Per-athlete billing rows for a coach's Pagos section. Excludes nothing —
 * comp athletes are surfaced too (tagged is_comp) but never counted in MRR.
 */
export async function listCoachBilling(args: {
  coach_id: bigint;
  now?: Date;
  client?: Sql;
}): Promise<CoachBilling> {
  const client = args.client ?? defaultSql;
  const now = args.now ?? new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const rows = await client<
    {
      athlete_id: string;
      full_name: string;
      email: string;
      stripe_customer_id: string | null;
      status: string | null;
      source: string | null;
      agreed_price_cents: number | null;
      currency: string | null;
      current_period_end: Date | null;
      cancel_at_period_end: boolean | null;
    }[]
  >`
    select
      a.id::text                          as athlete_id,
      a.full_name                         as full_name,
      u.email                             as email,
      s.stripe_customer_id                as stripe_customer_id,
      s.status::text                      as status,
      s.source                            as source,
      s.agreed_price_cents                as agreed_price_cents,
      s.currency                          as currency,
      s.current_period_end                as current_period_end,
      s.cancel_at_period_end              as cancel_at_period_end
    from athletes a
    join users u on u.id = a.user_id
    left join lateral (
      select stripe_customer_id, status, source, agreed_price_cents, currency,
             current_period_end, cancel_at_period_end
      from subscriptions s2
      where s2.user_id = a.user_id
      order by
        case when s2.status in ('active', 'trialing', 'past_due') then 0 else 1 end,
        s2.created_at desc
      limit 1
    ) s on true
    where a.coach_id = ${args.coach_id}
      and u.deleted_at is null
    order by a.full_name asc
  `;

  const athletes: CoachBillingRow[] = rows.map((r) => ({
    athlete_id: r.athlete_id,
    full_name: r.full_name,
    email: r.email,
    status: (r.status as SubscriptionStatusValue | null) ?? null,
    is_comp: r.source === 'comp',
    agreed_price_cents: r.agreed_price_cents,
    currency: r.currency ?? 'eur',
    current_period_end: r.current_period_end?.toISOString() ?? null,
    cancel_at_period_end: r.cancel_at_period_end ?? false,
    stripe_customer_id: r.stripe_customer_id,
  }));

  let active = 0;
  let past_due = 0;
  let canceled = 0;
  let not_subscribed = 0;
  let comp = 0;
  let mrr_cents = 0;
  const upcoming: CoachBillingRow[] = [];

  for (const a of athletes) {
    if (a.is_comp) comp += 1;
    if (a.status === 'active' || a.status === 'trialing') active += 1;
    else if (a.status === 'past_due') past_due += 1;
    else if (a.status === 'canceled' || a.status === 'incomplete') canceled += 1;
    else not_subscribed += 1;

    // MRR: real money only — active/trialing, non-comp, with an agreed price.
    if (!a.is_comp && (a.status === 'active' || a.status === 'trialing') && a.agreed_price_cents) {
      mrr_cents += a.agreed_price_cents;
    }

    if (
      a.current_period_end &&
      (a.status === 'active' || a.status === 'trialing') &&
      !a.cancel_at_period_end
    ) {
      const t = new Date(a.current_period_end).getTime();
      if (t >= now.getTime() && t <= sevenDays.getTime()) {
        upcoming.push(a);
      }
    }
  }

  return {
    athletes,
    active_count: active,
    past_due_count: past_due,
    canceled_count: canceled,
    not_subscribed_count: not_subscribed,
    comp_count: comp,
    upcoming_renewals_7d: upcoming,
    mrr_cents,
  };
}
