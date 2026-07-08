// redeemAthleteInvitationByEmail — the EMAIL claim path (universal, no Apple).
// Identity is the PROVEN email matching the invitation's target-user email; on
// match it runs the same finalize (redeemed + comp access) as the Apple path,
// never touching apple_user_id. Scripted fake-sql (no live DB), matching the
// pattern of the Apple redeem fake-sql suite in invitations.test.ts.

import { describe, expect, it } from 'vitest';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';
import { redeemAthleteInvitationByEmail } from '@/lib/athlete/invitations';

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 1000);

interface Call {
  text: string;
  values: unknown[];
}

function handlerFor(opts: {
  invitationStatus?: 'pending' | 'redeemed' | 'revoked' | 'expired';
  expiresAt?: Date;
  targetEmail?: string | null; // null → target user vanished
  calls: Call[];
}): SqlHandler {
  const status = opts.invitationStatus ?? 'pending';
  const expiresAt = opts.expiresAt ?? FUTURE;
  return (sqlText, values) => {
    opts.calls.push({ text: sqlText, values });
    if (sqlText.includes('from athlete_invitations') && sqlText.includes('for update')) {
      return [
        {
          id: '7',
          athlete_id: '3',
          target_user_id: '5',
          created_by_coach_id: '9',
          status,
          expires_at: expiresAt,
          redeemed_at: status === 'redeemed' ? new Date() : null,
          created_at: new Date(),
          lead_id: null,
        },
      ];
    }
    if (sqlText.includes('from users') && sqlText.includes('where id')) {
      return opts.targetEmail === null ? [] : [{ id: '5', email: opts.targetEmail ?? 'gerard@test.local' }];
    }
    if (sqlText.includes('from subscriptions') && sqlText.includes("status = 'active'")) {
      return []; // no active sub → comp insert path
    }
    if (sqlText.includes('from athletes') && sqlText.includes('where id')) {
      return [{ id: '3', full_name: 'Gerard', onboarded_at: null }];
    }
    return [];
  };
}

describe('redeemAthleteInvitationByEmail', () => {
  it('matching email + pending → ok, marks redeemed and grants comp access', async () => {
    const calls: Call[] = [];
    const fake = createFakeSql(handlerFor({ targetEmail: 'gerard@test.local', calls }));
    const res = await redeemAthleteInvitationByEmail({
      token: 'tok',
      verified_email: 'Gerard@Test.Local', // case-insensitive match
      client: fake,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.athlete_id).toBe(BigInt(3));
      expect(res.result.user_id).toBe(BigInt(5));
      expect(res.result.email).toBe('gerard@test.local');
    }
    expect(calls.find((c) => c.text.includes("set status = 'redeemed'"))).toBeTruthy();
    expect(calls.find((c) => c.text.startsWith('insert into subscriptions'))).toBeTruthy();
    // NEVER binds apple_user_id on the email path.
    expect(calls.find((c) => c.text.includes('set apple_user_id'))).toBeFalsy();
  });

  it('email does NOT match the invitation → email_mismatch, no finalize', async () => {
    const calls: Call[] = [];
    const fake = createFakeSql(handlerFor({ targetEmail: 'gerard@test.local', calls }));
    const res = await redeemAthleteInvitationByEmail({
      token: 'tok',
      verified_email: 'intruder@evil.com',
      client: fake,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('email_mismatch');
    expect(calls.find((c) => c.text.startsWith('insert into subscriptions'))).toBeFalsy();
    expect(calls.find((c) => c.text.includes("set status = 'redeemed'"))).toBeFalsy();
  });

  it('already redeemed by the SAME email → idempotent success (re-tap logs in)', async () => {
    const calls: Call[] = [];
    const fake = createFakeSql(handlerFor({ invitationStatus: 'redeemed', targetEmail: 'gerard@test.local', calls }));
    const res = await redeemAthleteInvitationByEmail({
      token: 'tok',
      verified_email: 'gerard@test.local',
      client: fake,
    });
    expect(res.ok).toBe(true);
  });

  it('revoked invitation → token_revoked', async () => {
    const calls: Call[] = [];
    const fake = createFakeSql(handlerFor({ invitationStatus: 'revoked', calls }));
    const res = await redeemAthleteInvitationByEmail({ token: 'tok', verified_email: 'x@y.com', client: fake });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('token_revoked');
  });

  it('expired (past expiry) → token_expired', async () => {
    const calls: Call[] = [];
    const fake = createFakeSql(handlerFor({ expiresAt: PAST, calls }));
    const res = await redeemAthleteInvitationByEmail({ token: 'tok', verified_email: 'x@y.com', client: fake });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('token_expired');
  });

  it('unknown token → token_invalid', async () => {
    const fake = createFakeSql(() => []); // every lookup empty
    const res = await redeemAthleteInvitationByEmail({ token: 'nope', verified_email: 'x@y.com', client: fake });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('token_invalid');
  });
});
