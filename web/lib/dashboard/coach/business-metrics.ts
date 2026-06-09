import 'server-only';

import type { SubscriptionPlanType } from '@fahybrid/shared/schema/_primitives';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

// Read-only business metrics over the `subscriptions` table (source of truth,
// owned by the Stripe webhook agent). Coach dashboard only — no writes.
//
// COMP (courtesy) subscriptions — source='comp' — are full-access but FREE
// (coach-granted, see lib/coach/comp-athletes.ts). They are real active
// athletes, so HEADCOUNT metrics include them (active_count, breakdown.count,
// new_this_month). But they generate NO revenue, so REVENUE metrics exclude
// them: MRR sums only source='stripe' tiers, and revenue-churn (the
// canceled-this-month numerator + active-at-month-start denominator) is
// computed over source='stripe' only — a comp athlete churning is not lost
// revenue.

/**
 * Monthly price per tier, in EUR. A Dobles subscription is a single billing
 * record shared by two athletes, so it counts once toward MRR.
 */
export const TIER_PRICE_EUR: Readonly<Record<SubscriptionPlanType, number>> = {
  individual: 70,
  dobles: 115,
  pro_elite: 95,
};

export const TIER_LABEL: Readonly<Record<SubscriptionPlanType, string>> = {
  individual: 'Individual',
  dobles: 'Dobles',
  pro_elite: 'Pro',
};

/** Window for the "renovaciones próximas" metric, in days. */
const RENEWAL_WINDOW_DAYS = 30;

export interface TierBreakdownEntry {
  plan_type: SubscriptionPlanType;
  label: string;
  count: number;
  mrr_eur: number;
}

export interface BusinessMetrics {
  /** Monthly recurring revenue from active subscriptions, in EUR. */
  mrr_eur: number;
  /** Active subscriptions right now (one row per billing record). */
  active_count: number;
  /** Subscriptions canceled within the current calendar month. */
  canceled_this_month: number;
  /** New subscriptions created within the current calendar month. */
  new_this_month: number;
  /** Active subscriptions at the start of the current month (churn denominator). */
  active_at_month_start: number;
  /** Monthly churn rate as a percentage (0–100), or null when no baseline. */
  churn_pct: number | null;
  /** Active subscriptions whose period ends in the next 30 days. */
  renewals_next_30d: number;
  /** Active-subscription counts + MRR contribution per tier. */
  breakdown: TierBreakdownEntry[];
  /** True when there are no subscription rows at all (honest empty state). */
  is_empty: boolean;
}

export async function buildBusinessMetrics(params: {
  client?: Sql;
}): Promise<BusinessMetrics> {
  const client = params.client ?? defaultSql;

  // Active subscriptions grouped by tier — HEADCOUNT (includes comp). One row
  // per billing record, so Dobles is naturally counted once.
  const activeRows = await client<
    Array<{ plan_type: SubscriptionPlanType; count: number }>
  >`
    select plan_type, count(*)::int as count
    from subscriptions
    where status = 'active'
    group by plan_type
  `;

  // Active PAID subscriptions grouped by tier — REVENUE only (source='stripe').
  // Comp subscriptions are free, so they never contribute to MRR.
  const paidActiveRows = await client<
    Array<{ plan_type: SubscriptionPlanType; count: number }>
  >`
    select plan_type, count(*)::int as count
    from subscriptions
    where status = 'active'
      and source = 'stripe'
    group by plan_type
  `;

  const totalRows = await client<Array<{ count: number }>>`
    select count(*)::int as count from subscriptions
  `;

  const newRows = await client<Array<{ count: number }>>`
    select count(*)::int as count
    from subscriptions
    where created_at >= date_trunc('month', current_date)
  `;

  // Revenue churn — paid subscriptions only (source='stripe'). A comp athlete
  // churning is not lost revenue, so it must not move the churn rate.
  const canceledRows = await client<Array<{ count: number }>>`
    select count(*)::int as count
    from subscriptions
    where status = 'canceled'
      and source = 'stripe'
      and updated_at >= date_trunc('month', current_date)
  `;

  // Active (paid) at month start = currently-active paid created before this
  // month + those canceled this month (active until they churned). Revenue
  // churn denominator → source='stripe' only.
  const activeStartRows = await client<Array<{ count: number }>>`
    select count(*)::int as count
    from subscriptions
    where source = 'stripe'
      and created_at < date_trunc('month', current_date)
      and (
        status = 'active'
        or (status = 'canceled' and updated_at >= date_trunc('month', current_date))
      )
  `;

  const renewalRows = await client<Array<{ count: number }>>`
    select count(*)::int as count
    from subscriptions
    where status = 'active'
      and current_period_end is not null
      and current_period_end >= current_date
      and current_period_end < current_date + ${`${RENEWAL_WINDOW_DAYS} days`}::interval
  `;

  const breakdown: TierBreakdownEntry[] = (
    Object.keys(TIER_PRICE_EUR) as SubscriptionPlanType[]
  ).map((tier) => {
    // count = headcount (incl. comp); mrr = paid only (source='stripe').
    const count = activeRows.find((r) => r.plan_type === tier)?.count ?? 0;
    const paidCount = paidActiveRows.find((r) => r.plan_type === tier)?.count ?? 0;
    return {
      plan_type: tier,
      label: TIER_LABEL[tier],
      count,
      mrr_eur: paidCount * TIER_PRICE_EUR[tier],
    };
  });

  const mrr_eur = breakdown.reduce((sum, e) => sum + e.mrr_eur, 0);
  const active_count = breakdown.reduce((sum, e) => sum + e.count, 0);
  const active_at_month_start = activeStartRows[0]?.count ?? 0;
  const canceled_this_month = canceledRows[0]?.count ?? 0;
  const churn_pct =
    active_at_month_start > 0
      ? Math.round((canceled_this_month / active_at_month_start) * 1000) / 10
      : null;

  return {
    mrr_eur,
    active_count,
    canceled_this_month,
    new_this_month: newRows[0]?.count ?? 0,
    active_at_month_start,
    churn_pct,
    renewals_next_30d: renewalRows[0]?.count ?? 0,
    breakdown,
    is_empty: (totalRows[0]?.count ?? 0) === 0,
  };
}
