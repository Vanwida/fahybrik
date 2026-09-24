import 'server-only';

import type { SubscriptionPlanType } from '@fahybrid/shared/schema/_primitives';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
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
//
// «ESTE MES» Y «LOS PRÓXIMOS 30 DÍAS» VAN EN EL CALENDARIO DEL CLUB (DECISIONS
// 2026-09-23, «Qué día es en cada sitio»): el mes empieza a medianoche del día 1
// en el huso del club al que pertenece cada suscripción (el coach del atleta que
// la tiene), no en el de la sesión de Postgres (UTC). Con un coach, todas las
// filas son de su club; en la vista de plataforma cada fila lleva el suyo, así
// que el total es la suma de lo que ve cada club. Sin club, o con un huso que
// Postgres no conoce, cae al defecto (la guarda de `runAutoPublish`).

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

/** Los recuentos de un tier, tal cual salen de la consulta. */
interface TierCounts {
  plan_type: SubscriptionPlanType;
  active: number;
  paid_active: number;
  total: number;
  new_this_month: number;
  canceled_this_month: number;
  active_at_month_start: number;
  renewals: number;
}

export async function buildBusinessMetrics(params: {
  client?: Sql;
  /**
   * Scope to ONE coach's athletes (a subscription belongs to the coach of the athlete
   * whose user holds it — `subscriptions` has no club column). Omitted = platform-wide,
   * which only the admin surface (/admin, /api/admin/metrics) may ask for.
   */
  coach_id?: bigint | number;
  /** El instante desde el que se cuenta «este mes» (tests); por defecto, ahora. */
  now?: Date;
}): Promise<BusinessMetrics> {
  const client = params.client ?? defaultSql;
  const nowIso = (params.now ?? new Date()).toISOString();
  const scope =
    params.coach_id === undefined ? client`true` : client`ath.coach_id = ${Number(params.coach_id)}`;

  // Una fila por tier con todos los recuentos, cada suscripción medida contra
  // las fronteras de SU club: el mes (medianoche local del día 1) y la ventana
  // de renovaciones (de la medianoche local de hoy a la de dentro de 30 días).
  const rows = await client<Array<TierCounts>>`
    with valid_tz as materialized (select name from pg_timezone_names),
    sub as (
      select s.plan_type, s.status, s.source, s.created_at, s.updated_at, s.current_period_end,
             coalesce(v.name, ${BOX_TIMEZONE}) as tz
      from subscriptions s
      left join athletes ath on ath.user_id = s.user_id
      left join coaches c on c.id = ath.coach_id
      left join valid_tz v on v.name = c.timezone
      where ${scope}
    ),
    zoned as (
      -- La hora de pared del club en este instante.
      select sub.*, ${nowIso}::timestamptz at time zone sub.tz as local_now from sub
    ),
    b as (
      select zoned.*,
             date_trunc('month', local_now) at time zone tz                                as month_start,
             local_now::date::timestamp at time zone tz                                    as today_start,
             (local_now::date + ${RENEWAL_WINDOW_DAYS}::int)::timestamp at time zone tz   as window_end
      from zoned
    )
    select
      plan_type,
      -- HEADCOUNT (includes comp). One row per billing record, so Dobles counts once.
      count(*) filter (where status = 'active')::int                                   as active,
      -- REVENUE only (source='stripe'): comp subscriptions never contribute to MRR.
      count(*) filter (where status = 'active' and source = 'stripe')::int             as paid_active,
      count(*)::int                                                                     as total,
      count(*) filter (where created_at >= month_start)::int                           as new_this_month,
      -- Revenue churn — a comp athlete churning is not lost revenue.
      count(*) filter (
        where status = 'canceled' and source = 'stripe' and updated_at >= month_start
      )::int                                                                            as canceled_this_month,
      -- Active (paid) at month start = currently-active paid created before this
      -- month + those canceled this month (active until they churned).
      count(*) filter (
        where source = 'stripe'
          and created_at < month_start
          and (status = 'active' or (status = 'canceled' and updated_at >= month_start))
      )::int                                                                            as active_at_month_start,
      count(*) filter (
        where status = 'active' and current_period_end >= today_start and current_period_end < window_end
      )::int                                                                            as renewals
    from b
    group by plan_type
  `;

  const total = (key: Exclude<keyof TierCounts, 'plan_type'>): number =>
    rows.reduce((sum, r) => sum + r[key], 0);

  const breakdown: TierBreakdownEntry[] = (
    Object.keys(TIER_PRICE_EUR) as SubscriptionPlanType[]
  ).map((tier) => {
    // count = headcount (incl. comp); mrr = paid only (source='stripe').
    const row = rows.find((r) => r.plan_type === tier);
    return {
      plan_type: tier,
      label: TIER_LABEL[tier],
      count: row?.active ?? 0,
      mrr_eur: (row?.paid_active ?? 0) * TIER_PRICE_EUR[tier],
    };
  });

  const mrr_eur = breakdown.reduce((sum, e) => sum + e.mrr_eur, 0);
  const active_count = breakdown.reduce((sum, e) => sum + e.count, 0);
  const active_at_month_start = total('active_at_month_start');
  const canceled_this_month = total('canceled_this_month');
  const churn_pct =
    active_at_month_start > 0
      ? Math.round((canceled_this_month / active_at_month_start) * 1000) / 10
      : null;

  return {
    mrr_eur,
    active_count,
    canceled_this_month,
    new_this_month: total('new_this_month'),
    active_at_month_start,
    churn_pct,
    renewals_next_30d: total('renewals'),
    breakdown,
    is_empty: total('total') === 0,
  };
}
