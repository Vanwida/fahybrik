// =============================================================================
// RGPD / Apple Guideline 5.1.1(v) — athlete soft-delete + scheduled hard-delete.
//
// Why soft-delete first:
//   - The athlete may have second thoughts within a grace window (Apple
//     guidance + RGPD best practice = 30 days).
//   - Their email gets ANONYMIZED to `deleted-{user_id}@fahybrid.com` so the
//     real address is freed up and they can re-register fresh later.
//   - We retain the data physically (cascade-deleted by users PK) until the
//     cron worker (Phase 1c) processes the row in account_deletion_jobs.
//
// What this helper does in one transaction (atomic):
//   1. UPDATE users SET deleted_at = now(), email = 'deleted-{id}@fahybrid.com'
//   2. Cancel pending partner invitations the user initiated.
//   3. Mark any active subscription cancel_at_period_end = true (we never
//      auto-bill a deleted account; refund/chargeback is handled out-of-band).
//   4. INSERT a row into account_deletion_jobs scheduled +30 days.
//   5. Best-effort: notify the partner via `notifications` so they know their
//      Dobles pairing just dissolved.
//   6. Revoke all active sessions for this user (token blacklist effect).
//
// The DELETE /api/athlete/account endpoint orchestrates this + verifies the
// explicit "DELETE MY ACCOUNT" confirmation string.
// =============================================================================

import type { Sql } from '@/lib/db';

export const ACCOUNT_DELETION_GRACE_DAYS = 30;
export const ACCOUNT_DELETION_CONFIRMATION = 'DELETE MY ACCOUNT';

export interface SoftDeleteInput {
  sql: Sql;
  athlete_id: bigint;
  user_id: bigint;
  reason?: string | null;
}

export interface SoftDeleteResult {
  scheduled_hard_delete_at: string;
  partner_notified: boolean;
  invitations_cancelled: number;
  subscription_cancelled_at_period_end: boolean;
}

export async function softDeleteAccount(input: SoftDeleteInput): Promise<SoftDeleteResult> {
  const { sql, user_id, reason } = input;
  const userIdNum = user_id as unknown as number;
  const scheduledFor = new Date(
    Date.now() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );

  // 1) Anonymize the user record. Idempotent — if already deleted we no-op
  // (deleted_at IS NULL guard). The email rewrite uses the row id so it's
  // unique by construction.
  const anonymized = await sql<{ id: string; partner_id: string | null }[]>`
    update users
    set
      deleted_at = now(),
      email = 'deleted-' || id::text || '@fahybrid.com',
      updated_at = now()
    where id = ${userIdNum}
      and deleted_at is null
    returning id::text as id, partner_id::text as partner_id
  `;

  // Idempotent re-call: still schedule the job, but skip downstream side-effects.
  const wasNewlyDeleted = anonymized.length > 0;
  const partnerId = anonymized[0]?.partner_id ?? null;

  // 1b) Break the Dobles pairing on BOTH sides so no live row keeps a FK to a
  // deleted account:
  //   - clear the deleted user's own partner_id, and
  //   - clear partner_id on whoever was pointing back at the deleted user.
  // Run before notifying the partner (step 5) so the surviving user is left in
  // a clean, unpaired state.
  if (wasNewlyDeleted) {
    await sql`
      update users
      set partner_id = null, updated_at = now()
      where partner_id = ${userIdNum} or id = ${userIdNum}
    `;
  }

  // 2) Cancel any pending invitations this user sent.
  let invitationsCancelled = 0;
  if (wasNewlyDeleted) {
    const rows = await sql<{ id: string }[]>`
      update partner_invitations
      set status = 'cancelled'
      where inviter_user_id = ${userIdNum}
        and status = 'pending'
      returning id::text as id
    `;
    invitationsCancelled = rows.length;
  }

  // 3) Mark active subscription cancel_at_period_end = true (don't bill the
  // grace window — they explicitly asked to leave).
  let subscriptionCancelled = false;
  if (wasNewlyDeleted) {
    const rows = await sql<{ id: string }[]>`
      update subscriptions
      set cancel_at_period_end = true, updated_at = now()
      where user_id = ${userIdNum}
        and status = 'active'
        and cancel_at_period_end = false
      returning id::text as id
    `;
    subscriptionCancelled = rows.length > 0;
  }

  // 4) Schedule the irreversible hard-delete. Use ON CONFLICT DO NOTHING via
  // the partial unique index — if a previous pending job exists we leave it.
  await sql`
    insert into account_deletion_jobs (user_id, reason, scheduled_for)
    values (${userIdNum}, ${reason ?? null}, ${scheduledFor.toISOString()}::timestamptz)
    on conflict do nothing
  `;

  // 5) Notify the partner so they know the pairing dissolved. We use the
  // 'system' notification type (the canonical kind for cross-cutting account
  // events) with `kind: 'partner_left'` in the payload so the iOS inbox can
  // render the right copy.
  let partnerNotified = false;
  if (wasNewlyDeleted && partnerId) {
    const payload = {
      kind: 'partner_left',
      former_partner_user_id: user_id.toString(),
    };
    await sql`
      insert into notifications (user_id, type, payload_json)
      values (
        ${partnerId}::bigint,
        'system'::notification_type,
        ${sql.json(payload)}
      )
    `;
    partnerNotified = true;
  }

  // 6) Revoke every active session for this user. The bearer the iOS app
  // sent us in this very request is now invalid from the next request onwards.
  if (wasNewlyDeleted) {
    await sql`
      update sessions
      set revoked_at = now()
      where user_id = ${userIdNum}
        and revoked_at is null
    `;
  }

  return {
    scheduled_hard_delete_at: scheduledFor.toISOString(),
    partner_notified: partnerNotified,
    invitations_cancelled: invitationsCancelled,
    subscription_cancelled_at_period_end: subscriptionCancelled,
  };
}
