// Unit tests for softDeleteAccount.
//
// We stub the postgres tag and assert that the helper:
//   - Anonymizes email + sets deleted_at on users (the first mutation).
//   - Cancels pending partner_invitations.
//   - Marks active subscriptions cancel_at_period_end = true.
//   - Inserts an account_deletion_jobs row.
//   - Notifies the partner via the notifications table when partner_id is set.
//   - Revokes all active sessions.

import { describe, expect, it } from 'vitest';
import {
  softDeleteAccount,
  ACCOUNT_DELETION_GRACE_DAYS,
  ACCOUNT_DELETION_CONFIRMATION,
} from '@/lib/athlete/account-deletion';
import type { Sql } from '@/lib/db';

type Call = { raw: string; values: unknown[] };

function makeFakeSql(scripted: Array<unknown[]>): { sql: Sql; calls: Call[] } {
  const calls: Call[] = [];
  let cursor = 0;
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    const raw = strings.join('?');
    calls.push({ raw, values });
    const next = scripted[cursor++] ?? [];
    return Promise.resolve(next);
  };
  // Como el driver real: sql.json(v) liga el objeto como parámetro jsonb.
  (tag as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;
  return { sql: tag as unknown as Sql, calls };
}

describe('softDeleteAccount', () => {
  it('exposes the canonical confirmation string', () => {
    expect(ACCOUNT_DELETION_CONFIRMATION).toBe('DELETE MY ACCOUNT');
    expect(ACCOUNT_DELETION_GRACE_DAYS).toBe(30);
  });

  it('runs the full side-effect chain when the user has a partner', async () => {
    // Query order in helper:
    //   1. UPDATE users (anonymize, returns {id, partner_id})
    //   2. UPDATE users (A14: null out partner_id on both sides of the pairing)
    //   3. UPDATE partner_invitations (returns rows)
    //   4. UPDATE subscriptions (returns rows)
    //   5. INSERT account_deletion_jobs
    //   6. INSERT notifications (partner notify)
    //   7. UPDATE sessions
    const { sql, calls } = makeFakeSql([
      [{ id: '7', partner_id: '9' }], // user newly anonymized
      [], // partner_id cleanup
      [{ id: 'inv1' }, { id: 'inv2' }], // 2 pending invitations cancelled
      [{ id: 'sub1' }], // 1 active subscription marked
      [], // INSERT into account_deletion_jobs
      [], // INSERT notifications
      [], // UPDATE sessions revoked
    ]);

    const result = await softDeleteAccount({
      sql,
      athlete_id: BigInt(42),
      user_id: BigInt(7),
      reason: 'no longer training',
    });

    expect(result.partner_notified).toBe(true);
    expect(result.invitations_cancelled).toBe(2);
    expect(result.subscription_cancelled_at_period_end).toBe(true);
    expect(new Date(result.scheduled_hard_delete_at).getTime()).toBeGreaterThan(Date.now());

    // Anonymize step asserts: email rewrite + deleted_at + the user_id binding.
    const updateUsers = calls[0]!;
    expect(updateUsers.raw).toMatch(/update users/i);
    expect(updateUsers.raw).toMatch(/email = 'deleted-' \|\| id::text/);
    expect(updateUsers.raw).toMatch(/deleted_at = now\(\)/);
    expect(updateUsers.values).toContain(BigInt(7)); // user_id bound

    // A14: partner_id cleanup nulls both the surviving partner's link and the
    // deleted user's own link, bound to user_id 7.
    const partnerCleanup = calls[1]!;
    expect(partnerCleanup.raw).toMatch(/update users/i);
    expect(partnerCleanup.raw).toMatch(/partner_id = null/);
    expect(partnerCleanup.raw).toMatch(/where partner_id =/i);
    expect(partnerCleanup.raw).toMatch(/or id =/i);
    expect(partnerCleanup.values.filter((v) => v === BigInt(7))).toHaveLength(2);

    // Invitations cancel.
    expect(calls[2]!.raw).toMatch(/update partner_invitations/i);
    expect(calls[2]!.raw).toMatch(/status = 'cancelled'/);

    // Subscription mark.
    expect(calls[3]!.raw).toMatch(/update subscriptions/i);
    expect(calls[3]!.raw).toMatch(/cancel_at_period_end = true/);

    // Account deletion job scheduled.
    expect(calls[4]!.raw).toMatch(/insert into account_deletion_jobs/i);

    // Partner notify uses 'system' notification type with partner_left kind.
    expect(calls[5]!.raw).toMatch(/insert into notifications/i);
    expect(calls[5]!.raw).toMatch(/'system'::notification_type/);
    // El payload viaja como OBJETO (sql.json), ya no como cadena a buscar.
    const payload = calls[5]!.values.find(
      (v): v is { kind: string } =>
        typeof v === 'object' && v != null && (v as { kind?: string }).kind === 'partner_left',
    );
    expect(payload).toBeDefined();

    // Sessions revoked.
    expect(calls[6]!.raw).toMatch(/update sessions/i);
    expect(calls[6]!.raw).toMatch(/revoked_at = now\(\)/);
  });

  it('skips partner notify when user has no partner', async () => {
    const { sql, calls } = makeFakeSql([
      [{ id: '7', partner_id: null }], // no partner
      [], // partner_id cleanup (still runs — clears own + any back-links)
      [], // no invitations
      [], // no active subscription
      [], // INSERT account_deletion_jobs
      [], // UPDATE sessions (no notifications step)
    ]);

    const result = await softDeleteAccount({
      sql,
      athlete_id: BigInt(42),
      user_id: BigInt(7),
    });

    expect(result.partner_notified).toBe(false);
    expect(result.invitations_cancelled).toBe(0);
    expect(result.subscription_cancelled_at_period_end).toBe(false);

    // No insert into notifications happened — last call must be sessions revoke.
    const notifyCall = calls.find((c) => /insert into notifications/i.test(c.raw));
    expect(notifyCall).toBeUndefined();
  });

  it('is idempotent: a second call with deleted_at already set skips side-effects', async () => {
    const { sql, calls } = makeFakeSql([
      [], // UPDATE users returned 0 rows (already deleted)
      [], // INSERT account_deletion_jobs (still attempted, ON CONFLICT DO NOTHING)
    ]);

    const result = await softDeleteAccount({
      sql,
      athlete_id: BigInt(42),
      user_id: BigInt(7),
    });

    expect(result.partner_notified).toBe(false);
    expect(result.invitations_cancelled).toBe(0);
    expect(result.subscription_cancelled_at_period_end).toBe(false);

    // Only 2 queries fired: the anonymize attempt and the job insert.
    expect(calls.length).toBe(2);
    expect(calls[0]!.raw).toMatch(/update users/i);
    expect(calls[1]!.raw).toMatch(/insert into account_deletion_jobs/i);
  });
});
