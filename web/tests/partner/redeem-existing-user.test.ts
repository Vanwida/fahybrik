/**
 * C4 — an EXISTING FAHYBRID user (or an authenticated Bearer caller) can accept
 * a partner invitation. Previously redeem was create-only and hard-409'd a
 * known apple_user_id/email. These are REAL-DB integration tests against the
 * Neon test branch — SKIPPED (loudly) when TEST_DATABASE_URL is unset.
 *
 * Two flows exercised:
 *   1) unauthenticated + Apple identity → EXISTING user: resolveOrCreatePartnerUser
 *      links (is_new=false, no 409) and redeemInvitation sets partner_id both ways.
 *   2) authenticated Bearer athlete session → the caller is linked, verified by
 *      driving the actual POST handler end-to-end (auth resolution → redeem →
 *      response) with a real signed session JWT.
 */

import { afterAll, afterEach, expect, test } from 'vitest';
import { describeWithDb, getTestSql, closeTestSql } from '../utils/test-db';

// The route + its deps (session, rate-limit, invitations) all read the
// module-level `@/lib/db` `sql`, which resolves `globalThis.__fahybrik_sql ??
// createClient()`. Point that at the test branch BEFORE those modules evaluate
// so the full POST handler runs against the Neon test branch, not the app DB.
// getTestSql() is a lazy proxy — no connection until a query actually runs, so
// this is inert when the suite is skipped (no TEST_DATABASE_URL).
const testSql = getTestSql();
(globalThis as unknown as { __fahybrik_sql: unknown }).__fahybrik_sql = testSql;

// The Bearer path signs + verifies a real athlete session JWT; both sides use
// AUTH_SECRET. Provide a deterministic test secret when the env has none so the
// sign→verify round-trip is self-contained.
process.env.AUTH_SECRET ??= 'test-secret-partner-redeem-c4';

// Imported AFTER the global sql + env are set (route pulls in @/lib/db, session,
// rate-limit — each binds `sql` at module-evaluation time).
const { resolveOrCreatePartnerUser, POST } = await import(
  '@/app/api/athlete/partner/redeem/route'
);
const { createInvitation } = await import('@/lib/partner/invitations');
const { issueSession, audiences } = await import('@/lib/auth/session');

let seq = 0;
function uniqEmail(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

interface SeededUser {
  userId: bigint;
  athleteId: bigint;
  email: string;
}

async function makeAthleteUser(opts: { appleUserId?: string } = {}): Promise<SeededUser> {
  const email = uniqEmail('redeem-c4');
  const users = await testSql<{ id: string }[]>`
    insert into users (email, apple_user_id, role)
    values (${email}, ${opts.appleUserId ?? null}, 'athlete')
    returning id::text as id
  `;
  const userId = BigInt(users[0]!.id);
  const athletes = await testSql<{ id: string }[]>`
    insert into athletes (user_id, full_name)
    values (${userId}, 'Redeem C4 Athlete')
    returning id::text as id
  `;
  return { userId, athleteId: BigInt(athletes[0]!.id), email };
}

const createdUserIds: bigint[] = [];
const createdRateLimitKeys: string[] = [];

async function partnerIdOf(userId: bigint): Promise<bigint | null> {
  const rows = await testSql<{ partner_id: string | null }[]>`
    select partner_id::text as partner_id from users where id = ${userId} limit 1
  `;
  const v = rows[0]?.partner_id;
  return v == null ? null : BigInt(v);
}

afterEach(async () => {
  // FK-safe teardown: child rows first, then the users. Idempotent WHEREs.
  if (createdUserIds.length > 0) {
    await testSql`delete from partner_invitations where inviter_user_id in ${testSql(createdUserIds)}`;
    await testSql`delete from partner_invitations where accepted_user_id in ${testSql(createdUserIds)}`;
    await testSql`delete from sessions where user_id in ${testSql(createdUserIds)}`;
    await testSql`delete from athletes where user_id in ${testSql(createdUserIds)}`;
    await testSql`delete from users where id in ${testSql(createdUserIds)}`;
    createdUserIds.length = 0;
  }
  if (createdRateLimitKeys.length > 0) {
    await testSql`delete from rate_limit_buckets where bucket_key in ${testSql(createdRateLimitKeys)}`;
    createdRateLimitKeys.length = 0;
  }
});

afterAll(async () => {
  await closeTestSql();
});

describeWithDb('POST /api/athlete/partner/redeem — existing user acceptance (C4)', () => {
  test('links an EXISTING Apple user (no 409) and sets partner_id both ways', async () => {
    const inviter = await makeAthleteUser();
    const acceptingApple = `apple-existing-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const accepting = await makeAthleteUser({ appleUserId: acceptingApple });
    createdUserIds.push(inviter.userId, accepting.userId);

    const { invitation } = await createInvitation(inviter.userId, accepting.email, {
      client: testSql,
    });
    const token = invitation.token!;
    expect(token).toBeTruthy();

    // The behavioural change: an EXISTING account resolves to itself instead of
    // throwing user_already_exists → the old 409.
    const resolved = await resolveOrCreatePartnerUser(
      { apple_user_id: acceptingApple, email: accepting.email, full_name: null },
      testSql,
    );
    expect(resolved.is_new).toBe(false);
    expect(resolved.user_id).toBe(accepting.userId);
    expect(resolved.athlete_id).toBe(accepting.athleteId);

    const redemption = await redeemInvitationVia(token, resolved.user_id);
    expect(redemption.ok).toBe(true);
    if (!redemption.ok) return;
    expect(redemption.result.inviter_user_id).toBe(inviter.userId);
    expect(redemption.result.accepted_user_id).toBe(accepting.userId);

    // partner_id linked bidirectionally.
    expect(await partnerIdOf(inviter.userId)).toBe(accepting.userId);
    expect(await partnerIdOf(accepting.userId)).toBe(inviter.userId);
  });

  test('resolveOrCreatePartnerUser matches an existing user by EMAIL when apple_user_id differs', async () => {
    const existing = await makeAthleteUser({ appleUserId: `apple-orig-${Date.now()}` });
    createdUserIds.push(existing.userId);

    // A different Apple sub but the same (already-registered) email must resolve
    // to the SAME account — not create a duplicate that would collide on email.
    const resolved = await resolveOrCreatePartnerUser(
      { apple_user_id: `apple-other-${Date.now()}`, email: existing.email, full_name: null },
      testSql,
    );
    expect(resolved.is_new).toBe(false);
    expect(resolved.user_id).toBe(existing.userId);
  });

  test('links the caller when accepting via a Bearer athlete session (end-to-end POST)', async () => {
    const inviter = await makeAthleteUser();
    const caller = await makeAthleteUser({ appleUserId: `apple-bearer-${Date.now()}` });
    createdUserIds.push(inviter.userId, caller.userId);

    const { invitation } = await createInvitation(inviter.userId, caller.email, {
      client: testSql,
    });
    const token = invitation.token!;

    // A real signed athlete session for the caller (writes to `sessions`).
    const session = await issueSession({
      user_id: caller.userId,
      audience: audiences.athlete,
      ttl_seconds: 3600,
    });

    // Unique client IP → unique rate-limit bucket (cleaned in afterEach).
    const clientIp = `203.0.113.${(Date.now() % 250) + 1}`;
    createdRateLimitKeys.push(`ip:partner-redeem:${clientIp}`);

    const req = new Request('http://localhost/api/athlete/partner/redeem', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.token}`,
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({ token }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user_id: string;
      partner_user_id: string;
      session_token: string;
      athlete_id: string;
    };
    expect(body.user_id).toBe(caller.userId.toString());
    expect(body.partner_user_id).toBe(inviter.userId.toString());
    expect(body.athlete_id).toBe(caller.athleteId.toString());
    expect(body.session_token).toBeTruthy();

    // partner_id linked bidirectionally — the caller IS the accepting user.
    expect(await partnerIdOf(inviter.userId)).toBe(caller.userId);
    expect(await partnerIdOf(caller.userId)).toBe(inviter.userId);
  });
});

// Redeem through the invitations lib with the test client. Kept as a thin
// wrapper so the test reads intent-first and the import stays lazy-friendly.
async function redeemInvitationVia(token: string, acceptedUserId: bigint) {
  const { redeemInvitation } = await import('@/lib/partner/invitations');
  return redeemInvitation(token, acceptedUserId, { client: testSql });
}
