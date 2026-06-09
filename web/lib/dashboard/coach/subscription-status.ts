import 'server-only';

import type {
  SubscriptionPlanType,
  SubscriptionStatus,
} from '@fahybrid/shared/schema/_primitives';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

// Coach-facing subscription state for a single athlete. Read-only projection
// over the `subscriptions` table (source of truth, owned by the Stripe webhook
// agent). We join via `athletes.user_id → subscriptions.user_id` and also pick
// up Dobles plans where the athlete is the partner (`partner_user_id`).

export interface AthleteSubscriptionStatus {
  plan_type: SubscriptionPlanType;
  status: SubscriptionStatus;
  /** ISO datetime of next billing cycle, or null when unknown. */
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /** True when this athlete is the Dobles partner (not the primary holder). */
  is_partner: boolean;
}

export async function getAthleteSubscriptionStatus(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<AthleteSubscriptionStatus | null> {
  const client = params.client ?? defaultSql;

  // Guard: only expose subscriptions for athletes the coach owns.
  const rows = await client<
    Array<{
      plan_type: SubscriptionPlanType;
      status: SubscriptionStatus;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
      is_partner: boolean;
    }>
  >`
    select
      s.plan_type,
      s.status,
      to_char(s.current_period_end, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as current_period_end,
      s.cancel_at_period_end,
      (s.partner_user_id = a.user_id) as is_partner
    from athletes a
    join subscriptions s
      on s.user_id = a.user_id or s.partner_user_id = a.user_id
    where a.id = ${params.athlete_id} and a.coach_id = ${params.coach_id}
    order by s.created_at desc
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    plan_type: row.plan_type,
    status: row.status,
    current_period_end: row.current_period_end,
    cancel_at_period_end: row.cancel_at_period_end,
    is_partner: row.is_partner,
  };
}
