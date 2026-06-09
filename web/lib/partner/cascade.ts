import { sql, type Sql } from '@/lib/db';

/**
 * Subscription cancellation cascade for Dobles.
 *
 * Status: WIRED. Invoked from app/api/stripe/webhook on
 * `customer.subscription.deleted` when the canceled subscription has a
 * `partner_user_id` (Phase 1b Stripe backend). The Stripe webhook is the only
 * caller.
 *
 * Behavior:
 *  - Loads the subscription by id (BIGINT primary key of the `subscriptions`
 *    table — NOT the `stripe_subscription_id` string).
 *  - If `partner_user_id` is set, this is a shared Dobles subscription:
 *    both users lose access at period end. We log + insert a generic `system`
 *    notification for each user (the `notification_type` enum has no
 *    `subscription_cancelled` member yet — see TODO below).
 *  - If `partner_user_id` is null, single-user subscription: nothing to
 *    cascade, only a single notification.
 *  - Does NOT mutate Stripe state itself (that's the webhook's job upstream).
 *  - Idempotent re-entry is safe: we always insert a fresh notification per
 *    call, so a duplicate webhook delivery will only produce a duplicate
 *    in-app notification (acceptable, low blast radius).
 *
 * Note: uses the `system` notification type + a `kind: 'subscription_cancelled'`
 * discriminator in payload_json rather than extending the `notification_type`
 * enum, to avoid a migration for a low-volume notification.
 */
export interface CascadeResult {
  /** True when the helper actually executed against an existing row. */
  ran: boolean;
  /** True when the cancellation was cascaded to a partner. */
  cascaded: boolean;
  affected_user_ids: bigint[];
}

interface CascadeDeps {
  client?: Sql;
  /** For dependency injection in tests. */
  now?: () => Date;
}

export async function handleSubscriptionCancellation(
  subscriptionId: bigint,
  reason: string,
  deps: CascadeDeps = {},
): Promise<CascadeResult> {
  const client = deps.client ?? sql;

  const rows = await client<
    { id: string; user_id: string; partner_user_id: string | null; status: string }[]
  >`
    select id::text as id,
           user_id::text as user_id,
           partner_user_id::text as partner_user_id,
           status::text as status
    from subscriptions
    where id = ${subscriptionId}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    console.warn('[partner/cascade] subscription not found', { subscription_id: subscriptionId.toString() });
    return { ran: false, cascaded: false, affected_user_ids: [] };
  }

  const userIds: bigint[] = [BigInt(row.user_id)];
  if (row.partner_user_id) {
    userIds.push(BigInt(row.partner_user_id));
  }

  // Insert notifications. We use `system` type and discriminator in
  // payload_json to avoid extending the enum until W5.
  const payload = JSON.stringify({
    kind: 'subscription_cancelled',
    subscription_id: subscriptionId.toString(),
    reason,
    cascaded: row.partner_user_id != null,
  });
  for (const uid of userIds) {
    await client`
      insert into notifications (user_id, type, payload_json)
      values (${uid}, 'system', ${payload}::jsonb)
    `;
  }

  console.info('[partner/cascade] processed', {
    subscription_id: subscriptionId.toString(),
    reason,
    cascaded: row.partner_user_id != null,
    affected_user_ids: userIds.map((u) => u.toString()),
  });

  return {
    ran: true,
    cascaded: row.partner_user_id != null,
    affected_user_ids: userIds,
  };
}
