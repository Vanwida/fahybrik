// Coach billing dashboard query.
//
// Read-only. Pulls every athlete assigned to the coach with their
// subscription status (or null), and rolls up totals.
//
// MRR estimate is naive: count of active+trialing subs × monthly price.
// We don't pull real Price.unit_amount to avoid a Stripe API call on every
// render — Pablo can sanity-check against Stripe Dashboard if he cares about
// the cent.
//
// Source of truth: the user-scoped `subscriptions` table (Finding M9). An
// athlete's subscription is joined via athletes.user_id → subscriptions.user_id.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

export type AthleteBillingRow = {
  athlete_id: string;
  full_name: string;
  email: string;
  stripe_customer_id: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type BillingDashboard = {
  athletes: AthleteBillingRow[];
  active_count: number;
  past_due_count: number;
  canceled_count: number;
  not_subscribed_count: number;
  upcoming_renewals_7d: AthleteBillingRow[];
  // Cents per month per athlete, rendered as €. We assume the price is
  // configured monthly in Stripe; if Alex picks annual we'll add a
  // billing_period column to subscriptions and divide by 12 here.
  monthly_amount_cents: number;
  // active + trialing × monthly_amount_cents.
  mrr_cents: number;
};

const PLACEHOLDER_MONTHLY_CENTS = 8900; // €89.00 — see docs/billing/stripe-setup.md

export async function buildCoachBilling(args: {
  coach_id: bigint;
  now?: Date;
  client?: Sql;
}): Promise<BillingDashboard> {
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
      s.current_period_end                as current_period_end,
      s.cancel_at_period_end              as cancel_at_period_end
    from athletes a
    join users u on u.id = a.user_id
    left join lateral (
      select stripe_customer_id, status, current_period_end, cancel_at_period_end
      from subscriptions s2
      where s2.user_id = a.user_id
      order by
        case when s2.status in ('active', 'trialing', 'past_due') then 0 else 1 end,
        s2.created_at desc
      limit 1
    ) s on true
    where a.coach_id = ${args.coach_id as unknown as number}
      and u.deleted_at is null
    order by a.full_name asc
  `;

  const athletes: AthleteBillingRow[] = rows.map((r) => ({
    athlete_id: r.athlete_id,
    full_name: r.full_name,
    email: r.email,
    stripe_customer_id: r.stripe_customer_id,
    status: r.status,
    current_period_end: r.current_period_end?.toISOString() ?? null,
    cancel_at_period_end: r.cancel_at_period_end ?? false,
  }));

  let active = 0;
  let past_due = 0;
  let canceled = 0;
  let not_subscribed = 0;
  const upcoming: AthleteBillingRow[] = [];

  for (const a of athletes) {
    if (a.status === 'active' || a.status === 'trialing') active += 1;
    else if (a.status === 'past_due' || a.status === 'unpaid') past_due += 1;
    else if (a.status === 'canceled' || a.status === 'incomplete_expired') canceled += 1;
    else not_subscribed += 1;

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
    upcoming_renewals_7d: upcoming,
    monthly_amount_cents: PLACEHOLDER_MONTHLY_CENTS,
    mrr_cents: active * PLACEHOLDER_MONTHLY_CENTS,
  };
}
