/**
 * Real-DB integration tests for the EJE ÚNICO account-link driven by the
 * doubles training pair. Exercises the three-axis coherence against a real Neon
 * branch (no SQL mocked):
 *
 *   (a) createDoublesPair    → sets users.partner_id BOTH ways.
 *   (b) dissolveDoublesPair  → clears users.partner_id + subscriptions.partner_user_id,
 *                              but LEAVES workout_executions (joint history conserved).
 *   (c) athlete self-unlink  → clears all three axes (pair, partner_id, subs).
 *
 * Each test builds its own coach + two athletes (+ dobles subscriptions) with the
 * shared fixture and a small second-athlete helper, then tears everything down.
 * Skipped (loudly) when TEST_DATABASE_URL is unset — see utils/test-db.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

// Real-DB txns on a cold Neon branch endpoint exceed the 5s default. 30s headroom.
const DB_TEST_TIMEOUT_MS = 30_000;

import {
  createDoublesPair,
  dissolveDoublesPair,
  unlinkDoublesPairForAthlete,
} from '@/lib/dashboard/coach/doubles-pairs';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeTemplate,
  makeAssignment,
  type Fixture,
} from '../utils/db-fixtures';

describeWithDb('doubles pair ⟺ account link (real DB)', () => {
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

  // ---- helpers ---------------------------------------------------------------

  /** A second athlete (+ its user) under the SAME coach as the fixture. */
  async function makeSecondAthlete(fx: Fixture): Promise<{
    athleteId: number;
    userId: number;
  }> {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await sql<{ id: string }[]>`
      insert into users (email, role) values (${'ath2-' + suffix + '@test.local'}, 'athlete')
      returning id::text
    `;
    const userId = Number(user[0]!.id);
    const athlete = await sql<{ id: string }[]>`
      insert into athletes (user_id, coach_id, full_name)
      values (${userId}, ${fx.coachId}, 'Test Athlete B')
      returning id::text
    `;
    const athleteId = Number(athlete[0]!.id);
    cleanups.push(async () => {
      // doubles_pairs → athletes on delete cascade; subscriptions → users on
      // delete cascade. Delete the pairs explicitly first for clarity, then the
      // athlete + user (which cascade the rest).
      await sql`delete from doubles_pairs where athlete_a_id = ${athleteId} or athlete_b_id = ${athleteId}`;
      await sql`delete from athletes where id = ${athleteId}`;
      await sql`delete from users where id = ${userId}`;
    });
    return { athleteId, userId };
  }

  /** Give a user a dobles subscription (so the billing mirror has a row to link). */
  async function makeDoblesSubscription(userId: number): Promise<void> {
    await sql`
      insert into subscriptions (user_id, plan_type, status)
      values (${userId}, 'dobles', 'incomplete')
    `;
    // subscriptions cascade on user delete; the user cleanup removes them.
  }

  async function partnerIdOf(userId: number): Promise<string | null> {
    const rows = await sql<{ partner_id: string | null }[]>`
      select partner_id::text as partner_id from users where id = ${userId} limit 1
    `;
    return rows[0]?.partner_id ?? null;
  }

  async function subPartnerOf(userId: number): Promise<string | null> {
    const rows = await sql<{ partner_user_id: string | null }[]>`
      select partner_user_id::text as partner_user_id
      from subscriptions where user_id = ${userId} limit 1
    `;
    return rows[0]?.partner_user_id ?? null;
  }

  async function pairStatus(pairId: number): Promise<string | null> {
    const rows = await sql<{ status: string }[]>`
      select status from doubles_pairs where id = ${pairId} limit 1
    `;
    return rows[0]?.status ?? null;
  }

  // ---- (a) createDoublesPair sets partner_id both ways -----------------------

  test(
    'createDoublesPair sets users.partner_id BOTH ways',
    async () => {
      const fx = await makeCoachAndAthlete(sql);
      cleanups.push(fx.cleanup);
      const b = await makeSecondAthlete(fx);

      const pair = await createDoublesPair({
        coach_id: fx.coachId,
        athlete_a_id: fx.athleteId,
        athlete_b_id: b.athleteId,
        client: sql,
      });

      expect(pair.status).toBe('active');
      expect(await partnerIdOf(fx.athleteUserId)).toBe(String(b.userId));
      expect(await partnerIdOf(b.userId)).toBe(String(fx.athleteUserId));
    },
    DB_TEST_TIMEOUT_MS,
  );

  // ---- (b) dissolve clears account+billing, conserves executions -------------

  test(
    'dissolveDoublesPair clears partner_id + subscriptions.partner_user_id, leaves executions',
    async () => {
      const fx = await makeCoachAndAthlete(sql);
      cleanups.push(fx.cleanup);
      const b = await makeSecondAthlete(fx);
      await makeDoblesSubscription(fx.athleteUserId);
      await makeDoblesSubscription(b.userId);

      const pair = await createDoublesPair({
        coach_id: fx.coachId,
        athlete_a_id: fx.athleteId,
        athlete_b_id: b.athleteId,
        client: sql,
      });

      // Sanity: linked on all axes before dissolve.
      expect(await partnerIdOf(fx.athleteUserId)).toBe(String(b.userId));
      expect(await subPartnerOf(fx.athleteUserId)).toBe(String(b.userId));
      expect(await subPartnerOf(b.userId)).toBe(String(fx.athleteUserId));

      // A logged JOINT execution (0074) for the fixture athlete, linking the partner.
      const templateId = await makeTemplate({ fx, name: 'Joint session' });
      const assignmentId = await makeAssignment({
        fx,
        templateId,
        scheduledForIso: '2026-01-05',
        status: 'completed',
      });
      const execRows = await sql<{ id: string }[]>`
        insert into workout_executions (assignment_id, athlete_id, partner_athlete_id, started_at)
        values (${assignmentId}, ${fx.athleteId}, ${b.athleteId}, now())
        returning id::text
      `;
      const execId = Number(execRows[0]!.id);

      await dissolveDoublesPair({
        coach_id: fx.coachId,
        pair_id: pair.id,
        client: sql,
      });

      // Training axis flipped; account + billing cleared BOTH ways.
      expect(await pairStatus(pair.id)).toBe('dissolved');
      expect(await partnerIdOf(fx.athleteUserId)).toBeNull();
      expect(await partnerIdOf(b.userId)).toBeNull();
      expect(await subPartnerOf(fx.athleteUserId)).toBeNull();
      expect(await subPartnerOf(b.userId)).toBeNull();

      // Joint history CONSERVED — the execution (and its partner link) stands.
      const execAfter = await sql<{ id: string; partner_athlete_id: string | null }[]>`
        select id::text as id, partner_athlete_id::text as partner_athlete_id
        from workout_executions where id = ${execId} limit 1
      `;
      expect(execAfter.length).toBe(1);
      expect(execAfter[0]!.partner_athlete_id).toBe(String(b.athleteId));
    },
    DB_TEST_TIMEOUT_MS,
  );

  // ---- (c) athlete self-unlink clears all three axes -------------------------

  test(
    'unlinkDoublesPairForAthlete clears pair + partner_id + subscriptions.partner_user_id',
    async () => {
      const fx = await makeCoachAndAthlete(sql);
      cleanups.push(fx.cleanup);
      const b = await makeSecondAthlete(fx);
      await makeDoblesSubscription(fx.athleteUserId);
      await makeDoblesSubscription(b.userId);

      const pair = await createDoublesPair({
        coach_id: fx.coachId,
        athlete_a_id: fx.athleteId,
        athlete_b_id: b.athleteId,
        client: sql,
      });

      const result = await unlinkDoublesPairForAthlete({
        athlete_id: fx.athleteId,
        user_id: fx.athleteUserId,
        client: sql,
      });

      expect(result.dissolved_pair_id).toBe(pair.id);
      expect(result.cleared_partner).toBe(true);
      expect(result.partner_user_id).toBe(String(b.userId));

      expect(await pairStatus(pair.id)).toBe('dissolved');
      expect(await partnerIdOf(fx.athleteUserId)).toBeNull();
      expect(await partnerIdOf(b.userId)).toBeNull();
      expect(await subPartnerOf(fx.athleteUserId)).toBeNull();
      expect(await subPartnerOf(b.userId)).toBeNull();
    },
    DB_TEST_TIMEOUT_MS,
  );
});
