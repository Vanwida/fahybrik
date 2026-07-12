// #59 — app_feedback (athlete → product team). Two layers:
//   1. PURE: appFeedbackSchema server-side validation.
//   2. REAL DB: recordAppFeedback round-trip (email skipped: RESEND unset) +
//      the FK ON DELETE SET NULL behaviour. Types pinned.

import { afterAll, afterEach, beforeAll, describe, expect, it, test } from 'vitest';
import { appFeedbackSchema, recordAppFeedback } from '@/lib/athlete/app-feedback';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete } from '../utils/db-fixtures';

// ── PURE (Zod) ──────────────────────────────────────────────────────────────
describe('appFeedbackSchema (pure)', () => {
  it('accepts a valid suggestion', () => {
    const r = appFeedbackSchema.safeParse({ kind: 'suggestion', body: 'Añadid modo oscuro' });
    expect(r.success).toBe(true);
  });

  it('trims + keeps optional app_version / screen', () => {
    const r = appFeedbackSchema.parse({ kind: 'bug', body: '  crash  ', app_version: '1.0(3)', screen: 'Hoy' });
    expect(r.body).toBe('crash');
    expect(r.app_version).toBe('1.0(3)');
    expect(r.screen).toBe('Hoy');
  });

  it('rejects an empty body', () => {
    expect(appFeedbackSchema.safeParse({ kind: 'bug', body: '' }).success).toBe(false);
    expect(appFeedbackSchema.safeParse({ kind: 'bug', body: '   ' }).success).toBe(false);
  });

  it('rejects a body over 2000 chars', () => {
    expect(appFeedbackSchema.safeParse({ kind: 'bug', body: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(appFeedbackSchema.safeParse({ kind: 'praise', body: 'ok' }).success).toBe(false);
  });
});

// ── REAL DB ─────────────────────────────────────────────────────────────────
describeWithDb('recordAppFeedback (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  let prevResendKey: string | undefined;

  beforeAll(async () => {
    await sql`select 1 as ok`;
    // Guarantee no email is sent from the test (persist-only path).
    prevResendKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
  });
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    if (prevResendKey !== undefined) process.env.RESEND_API_KEY = prevResendKey;
    await closeTestSql();
  });

  test('persists the row (source of truth) and reports the email skipped', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);

    const res = await recordAppFeedback({
      athleteUserId: fx.athleteUserId,
      input: { kind: 'bug', body: 'La sync se cuelga', app_version: '1.0(3)', screen: 'Hoy' },
      sql,
    });
    cleanups.push(async () => {
      await sql`delete from app_feedback where id = ${Number(res.id)}`;
    });

    expect(res.email_sent).toBe(false);
    expect(res.email_skipped_reason).toBe('resend_not_configured');
    expect(typeof res.id).toBe('string');

    const rows = await sql<
      Array<{ athlete_user_id: string | null; kind: string; body: string; app_version: string | null; screen: string | null }>
    >`
      select athlete_user_id::text as athlete_user_id, kind, body, app_version, screen
      from app_feedback where id = ${Number(res.id)} limit 1
    `;
    expect(rows[0]).toMatchObject({
      athlete_user_id: String(fx.athleteUserId),
      kind: 'bug',
      body: 'La sync se cuelga',
      app_version: '1.0(3)',
      screen: 'Hoy',
    });
  });

  test('FK ON DELETE SET NULL anonymises feedback when the user is deleted', async () => {
    const user = await sql<Array<{ id: string }>>`
      insert into users (email, role) values (${`fb-${Date.now()}@test.local`}, 'athlete')
      returning id::text
    `;
    const userId = Number(user[0]!.id);
    const fb = await sql<Array<{ id: string }>>`
      insert into app_feedback (athlete_user_id, kind, body)
      values (${userId}, 'suggestion', 'idea suelta')
      returning id::text
    `;
    const fbId = Number(fb[0]!.id);
    cleanups.push(async () => {
      await sql`delete from app_feedback where id = ${fbId}`;
    });

    await sql`delete from users where id = ${userId}`;
    const rows = await sql<Array<{ athlete_user_id: string | null }>>`
      select athlete_user_id::text as athlete_user_id from app_feedback where id = ${fbId} limit 1
    `;
    expect(rows[0]!.athlete_user_id).toBeNull();
  });
});
