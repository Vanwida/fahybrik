/**
 * App Store review access gate — REAL-DB end-to-end (no SQL mocked; Neon test branch).
 * Complements the route-mock suite (email-login-routes.test.ts) by proving the gate
 * mints a GENUINE athlete session against real rows: seeds a real coach + onboarded
 * athlete member, sets REVIEW_ACCESS_EMAIL/CODE to it, drives the REAL /verify (and
 * /request) routes, and asserts a real sessions row + the member-shaped body — plus
 * the negatives (wrong code / other email / gate-off → NO session).
 *
 * WIRING: the routes mint via @/lib/db (DATABASE_URL). We bridge DATABASE_URL → the
 * test branch and DYNAMIC-import the routes AFTER, so their client connects to the
 * branch (the module builds `sql` from DATABASE_URL at import time). AUTH_SECRET is
 * defaulted so the real issueSession can sign.
 *
 * WRITE, do NOT run here (TCP egress is blocked; Alex runs the suite against a branch).
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

// Real-DB txns on a cold Neon branch endpoint exceed the 5s default. 30s headroom.
const DB_TEST_TIMEOUT_MS = 30_000;

// Unique per run so a leftover row from a crashed run can't collide on users.email.
const REVIEW_EMAIL = `review-${Date.now()}@fahybrid.test`;
const REVIEW_CODE = 'FAHYBRID-REVIEW-DBTEST-7Q2X'; // alphanumeric fixed code

describeWithDb('App Store review gate — real session mint (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  let verifyPOST: (req: Request) => Promise<Response>;
  let requestPOST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    // Point the route's production client at the SAME branch getTestSql uses, THEN
    // dynamic-import the routes so @/lib/db builds its client from the branch URL.
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    process.env.AUTH_SECRET ||= 'review-gate-db-test-secret-override-in-ci';
    ({ POST: verifyPOST } = await import('@/app/api/auth/email/verify/route'));
    ({ POST: requestPOST } = await import('@/app/api/auth/email/request/route'));
    await sql`select 1 as ok`;
  });

  afterEach(async () => {
    delete process.env.REVIEW_ACCESS_EMAIL;
    delete process.env.REVIEW_ACCESS_CODE;
    while (cleanups.length) await cleanups.pop()!();
  });

  afterAll(async () => {
    await closeTestSql();
  });

  function enableGate() {
    process.env.REVIEW_ACCESS_EMAIL = REVIEW_EMAIL;
    process.env.REVIEW_ACCESS_CODE = REVIEW_CODE;
  }

  function post(path: string, body: unknown): Request {
    return new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
      body: JSON.stringify(body),
    });
  }

  /** Seed a real coach + onboarded athlete member for `email`. FK-ordered cleanup. */
  async function seedMember(email: string): Promise<{ userId: number; athleteId: number }> {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    // Defensive: drop any leftover row for this email from a crashed prior run.
    await sql`delete from users where email = ${email}`;
    const cu = await sql<{ id: string }[]>`
      insert into users (email, role) values (${'rev-coach-' + suffix + '@test.local'}, 'coach') returning id::text
    `;
    const coachUserId = Number(cu[0]!.id);
    const c = await sql<{ id: string }[]>`
      insert into coaches (user_id, full_name) values (${coachUserId}, 'Review Coach') returning id::text
    `;
    const coachId = Number(c[0]!.id);
    const u = await sql<{ id: string }[]>`
      insert into users (email, role) values (${email}, 'athlete') returning id::text
    `;
    const userId = Number(u[0]!.id);
    const a = await sql<{ id: string }[]>`
      insert into athletes (user_id, coach_id, full_name, onboarded_at)
      values (${userId}, ${coachId}, 'Review FAHYBRID', now()) returning id::text
    `;
    const athleteId = Number(a[0]!.id);
    cleanups.push(async () => {
      await sql`delete from sessions where user_id = ${userId}`;
      await sql`delete from email_login_codes where email = ${email}`;
      await sql`delete from athletes where id = ${athleteId}`;
      await sql`delete from users where id = ${userId}`;
      await sql`delete from coaches where id = ${coachId}`;
      await sql`delete from users where id = ${coachUserId}`;
    });
    return { userId, athleteId };
  }

  test(
    'review email + correct fixed code → real athlete session (sessions row + member body)',
    async () => {
      const { userId, athleteId } = await seedMember(REVIEW_EMAIL);
      enableGate();

      const res = await verifyPOST(post('/api/auth/email/verify', { email: REVIEW_EMAIL, code: REVIEW_CODE }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user_id).toBe(String(userId));
      expect(body.athlete_id).toBe(String(athleteId));
      expect(body.email).toBe(REVIEW_EMAIL);
      expect(typeof body.session_token).toBe('string');
      expect(body.session_token.length).toBeGreaterThan(20);

      // A genuine, non-revoked sessions row was written for the member.
      const rows = await sql<{ n: number }[]>`
        select count(*)::int as n from sessions where user_id = ${userId} and revoked_at is null
      `;
      expect(rows[0]!.n).toBe(1);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'review email + WRONG code → 400, no session row',
    async () => {
      const { userId } = await seedMember(REVIEW_EMAIL);
      enableGate();

      const res = await verifyPOST(post('/api/auth/email/verify', { email: REVIEW_EMAIL, code: 'not-the-code' }));
      expect(res.status).toBe(400);
      const rows = await sql<{ n: number }[]>`select count(*)::int as n from sessions where user_id = ${userId}`;
      expect(rows[0]!.n).toBe(0);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'the fixed code with ANOTHER email opens nothing → 400, review member gets no session',
    async () => {
      const { userId } = await seedMember(REVIEW_EMAIL);
      enableGate();

      const res = await verifyPOST(post('/api/auth/email/verify', { email: 'attacker@test.local', code: REVIEW_CODE }));
      expect(res.status).toBe(400);
      const rows = await sql<{ n: number }[]>`select count(*)::int as n from sessions where user_id = ${userId}`;
      expect(rows[0]!.n).toBe(0);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'gate OFF → review email + fixed code is just a bad code, no session',
    async () => {
      const { userId } = await seedMember(REVIEW_EMAIL);
      // envs intentionally NOT set → gate does not exist.
      const res = await verifyPOST(post('/api/auth/email/verify', { email: REVIEW_EMAIL, code: REVIEW_CODE }));
      expect(res.status).toBe(400); // alphanumeric fails the 6-digit schema → invalid_request
      const rows = await sql<{ n: number }[]>`select count(*)::int as n from sessions where user_id = ${userId}`;
      expect(rows[0]!.n).toBe(0);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'request: review email → generic 200 and NO one-time code persisted',
    async () => {
      await seedMember(REVIEW_EMAIL);
      enableGate();

      const res = await requestPOST(post('/api/auth/email/request', { email: REVIEW_EMAIL }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      // The fixed code is the review email's ONLY credential — no code row is written.
      const rows = await sql<{ n: number }[]>`select count(*)::int as n from email_login_codes where email = ${REVIEW_EMAIL}`;
      expect(rows[0]!.n).toBe(0);
    },
    DB_TEST_TIMEOUT_MS,
  );
});
