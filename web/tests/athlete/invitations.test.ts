/**
 * Real-DB integration tests for the athlete account-claim invitation flow
 * (lib/athlete/invitations.ts). Exercises the actual transactions against a
 * Neon test branch — no SQL is mocked. Covers:
 *   - create: rejects non-owned athletes; stores ONLY the token hash.
 *   - redeem: valid token binds apple_user_id onto the target user.
 *   - redeem: expired → token_expired; reuse → invitation_already_claimed;
 *     apple_id already bound to another user → apple_id_already_linked;
 *     unknown token → token_invalid.
 *
 * Security assertion (M12): the plaintext token is never persisted — the DB
 * column only ever holds the SHA-256 hash.
 */
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import {
  createAthleteInvitation,
  redeemAthleteInvitation,
} from '@/lib/athlete/invitations';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describeWithDb('athlete invitations (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });

  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });

  afterAll(async () => {
    await closeTestSql();
  });

  async function newFixture(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    return fx;
  }

  test('create stores ONLY the token hash and returns the plaintext once', async () => {
    const fx = await newFixture();
    const created = await createAthleteInvitation({
      athlete_id: BigInt(fx.athleteId),
      coach_id: BigInt(fx.coachId),
      client: sql,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const token = created.result.token;
    expect(token.length).toBeGreaterThan(20);

    // The DB row must hold the HASH, never the plaintext.
    const rows = await sql<{ token_sha256: string; status: string }[]>`
      select token_sha256, status from athlete_invitations
      where id = ${created.result.invitation.id}
    `;
    expect(rows[0]?.token_sha256).toBe(sha256(token));
    expect(rows[0]?.token_sha256).not.toBe(token);
    expect(rows[0]?.status).toBe('pending');
  });

  test('create rejects an athlete not owned by the coach', async () => {
    const fx = await newFixture();
    const other = await newFixture(); // different coach
    const res = await createAthleteInvitation({
      athlete_id: BigInt(fx.athleteId),
      coach_id: BigInt(other.coachId),
      client: sql,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('athlete_not_owned');
  });

  test('valid token binds apple_user_id onto the target user', async () => {
    const fx = await newFixture();
    const created = await createAthleteInvitation({
      athlete_id: BigInt(fx.athleteId),
      coach_id: BigInt(fx.coachId),
      client: sql,
    });
    if (!created.ok) throw new Error('setup failed');

    const appleId = `apple-${fx.athleteUserId}-sub`;
    const res = await redeemAthleteInvitation({
      token: created.result.token,
      apple_identity: { apple_user_id: appleId },
      client: sql,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.user_id).toBe(BigInt(fx.athleteUserId));
    expect(res.result.athlete_id).toBe(BigInt(fx.athleteId));

    // The binding actually landed on the target user.
    const userRows = await sql<{ apple_user_id: string | null }[]>`
      select apple_user_id from users where id = ${fx.athleteUserId}
    `;
    expect(userRows[0]?.apple_user_id).toBe(appleId);

    // Invitation flipped to redeemed.
    const invRows = await sql<{ status: string; redeemed_at: Date | null }[]>`
      select status, redeemed_at from athlete_invitations where id = ${created.result.invitation.id}
    `;
    expect(invRows[0]?.status).toBe('redeemed');
    expect(invRows[0]?.redeemed_at).not.toBeNull();

    // Invite-only gate is server-side: redeeming must leave the athlete with a
    // REAL, persisted active subscription (source='comp'), so refreshAccess
    // sees an active sub on restart instead of locking them back out.
    const subRows = await sql<{ status: string; source: string }[]>`
      select status::text as status, source from subscriptions
      where user_id = ${fx.athleteUserId}
    `;
    expect(subRows.length).toBe(1);
    expect(subRows[0]?.status).toBe('active');
    expect(subRows[0]?.source).toBe('comp');

    // Clean up the comp subscription the redeem created (fixture teardown does
    // not know about it; subscriptions cascade on user delete, but be explicit).
    await sql`delete from subscriptions where user_id = ${fx.athleteUserId}`;
  });

  test('expired invitation → token_expired (and marked expired)', async () => {
    const fx = await newFixture();
    // Mint with a clock in the past so expires_at is already behind us.
    const created = await createAthleteInvitation({
      athlete_id: BigInt(fx.athleteId),
      coach_id: BigInt(fx.coachId),
      client: sql,
      now: () => Date.now() - 20 * 24 * 60 * 60 * 1000, // 20 days ago (TTL 14d)
    });
    if (!created.ok) throw new Error('setup failed');

    const res = await redeemAthleteInvitation({
      token: created.result.token,
      apple_identity: { apple_user_id: `apple-${fx.athleteUserId}-x` },
      client: sql,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('token_expired');

    const invRows = await sql<{ status: string }[]>`
      select status from athlete_invitations where id = ${created.result.invitation.id}
    `;
    expect(invRows[0]?.status).toBe('expired');
  });

  test('reusing a redeemed token → invitation_already_claimed', async () => {
    const fx = await newFixture();
    const created = await createAthleteInvitation({
      athlete_id: BigInt(fx.athleteId),
      coach_id: BigInt(fx.coachId),
      client: sql,
    });
    if (!created.ok) throw new Error('setup failed');

    const appleId = `apple-${fx.athleteUserId}-reuse`;
    const first = await redeemAthleteInvitation({
      token: created.result.token,
      apple_identity: { apple_user_id: appleId },
      client: sql,
    });
    expect(first.ok).toBe(true);

    // Second redeem of the SAME token, even by the same identity, is rejected
    // because the invitation is already redeemed (single-use).
    const second = await redeemAthleteInvitation({
      token: created.result.token,
      apple_identity: { apple_user_id: appleId },
      client: sql,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('invitation_already_claimed');
  });

  test('apple_user_id already bound to another user → apple_id_already_linked', async () => {
    const fx = await newFixture();
    const other = await newFixture();

    // Bind the apple_user_id to a DIFFERENT user (other.athleteUserId).
    const stolenAppleId = `apple-${other.athleteUserId}-owned`;
    await sql`update users set apple_user_id = ${stolenAppleId} where id = ${other.athleteUserId}`;

    const created = await createAthleteInvitation({
      athlete_id: BigInt(fx.athleteId),
      coach_id: BigInt(fx.coachId),
      client: sql,
    });
    if (!created.ok) throw new Error('setup failed');

    const res = await redeemAthleteInvitation({
      token: created.result.token,
      apple_identity: { apple_user_id: stolenAppleId },
      client: sql,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('apple_id_already_linked');

    // The original owner's binding is untouched (no hijack).
    const ownerRows = await sql<{ apple_user_id: string | null }[]>`
      select apple_user_id from users where id = ${other.athleteUserId}
    `;
    expect(ownerRows[0]?.apple_user_id).toBe(stolenAppleId);
  });

  test('unknown token → token_invalid', async () => {
    const res = await redeemAthleteInvitation({
      token: 'this-token-does-not-exist-anywhere',
      apple_identity: { apple_user_id: 'apple-nobody' },
      client: sql,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('token_invalid');
  });
});

// Fast unit coverage (no DB) for the comp-subscription grant on redeem. Asserts
// the exact insert shape, and that a pre-existing active sub suppresses it.
describe('redeemAthleteInvitation — comp subscription grant (fake-sql)', () => {
  const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  function makeHandler(opts: {
    hasActiveSub: boolean;
    calls: { text: string; values: unknown[] }[];
  }): SqlHandler {
    return (sqlText, values) => {
      opts.calls.push({ text: sqlText, values });
      if (sqlText.includes('from athlete_invitations') && sqlText.includes('for update')) {
        return [
          {
            id: '7',
            athlete_id: '3',
            target_user_id: '5',
            created_by_coach_id: '9',
            status: 'pending',
            expires_at: FUTURE,
            redeemed_at: null,
            created_at: new Date(),
          },
        ];
      }
      // Apple-owner lookup: not bound anywhere yet.
      if (sqlText.includes('where apple_user_id') && sqlText.includes('from users')) {
        return [];
      }
      // Target user lookup.
      if (sqlText.includes('select id, email, apple_user_id') || (sqlText.includes('from users') && sqlText.includes('where id'))) {
        return [{ id: '5', email: 'a@test.local', apple_user_id: null }];
      }
      // Existing active subscription probe.
      if (sqlText.includes('from subscriptions') && sqlText.includes("status = 'active'")) {
        return opts.hasActiveSub ? [{ id: '50' }] : [];
      }
      // Athlete lookup at the end.
      if (sqlText.includes('from athletes') && sqlText.includes('where id')) {
        return [{ id: '3', full_name: 'A', onboarded_at: null }];
      }
      return [];
    };
  }

  test('inserts an active comp subscription when none exists', async () => {
    const calls: { text: string; values: unknown[] }[] = [];
    const fake = createFakeSql(makeHandler({ hasActiveSub: false, calls }));
    const res = await redeemAthleteInvitation({
      token: 'tok',
      apple_identity: { apple_user_id: 'apple-new' },
      client: fake,
    });
    expect(res.ok).toBe(true);
    const insert = calls.find((c) => c.text.startsWith('insert into subscriptions'));
    expect(insert).toBeTruthy();
    expect(insert!.values).toContain(BigInt(5)); // target user_id (interpolated)
    // plan_type/status/source are SQL literals, asserted on the text.
    expect(insert!.text).toContain("'individual'");
    expect(insert!.text).toContain("'active'");
    expect(insert!.text).toContain("'comp'");
  });

  test('does NOT insert a second sub when the user already has an active one', async () => {
    const calls: { text: string; values: unknown[] }[] = [];
    const fake = createFakeSql(makeHandler({ hasActiveSub: true, calls }));
    const res = await redeemAthleteInvitation({
      token: 'tok',
      apple_identity: { apple_user_id: 'apple-new' },
      client: fake,
    });
    expect(res.ok).toBe(true);
    expect(calls.some((c) => c.text.startsWith('insert into subscriptions'))).toBe(false);
  });
});
