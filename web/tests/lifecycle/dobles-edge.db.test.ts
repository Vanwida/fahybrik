/**
 * DOUBLES EDGE (#13) — real-DB integration tests for what happens to a doubles
 * pair when ONE member's lifecycle changes. No SQL mocked (real Neon branch).
 *
 * The approved model:
 *   · PAUSE one member → the PAIR STAYS active (they're still partners; one is
 *     temporarily frozen). buildPartnerSnapshot keeps surfacing the partner for the
 *     active member, TAGGED partner_paused=true — it must NOT vanish or break.
 *   · BAJA one member → DISSOLVE the pair across all three axes (training
 *     doubles_pairs.status='dissolved' + account users.partner_id + billing
 *     subscriptions.partner_user_id), notify the surviving partner, and PRESERVE
 *     BOTH histories (workout_executions untouched).
 *
 * The baja teardown is dissolvePairOnBaja(athlete_id, tx) — the seam bajaAthlete
 * calls inside its own transaction; we drive it directly here inside sql.begin.
 *
 * Skipped (loudly) when TEST_DATABASE_URL is unset — see utils/test-db.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

// Real-DB txns on a cold Neon branch endpoint exceed the 5s default. 30s headroom.
const DB_TEST_TIMEOUT_MS = 30_000;

import {
  createDoublesPair,
  dissolvePairOnBaja,
} from '@/lib/dashboard/coach/doubles-pairs';
import { buildPartnerSnapshot } from '@/lib/athlete/partner-snapshot';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeTemplate,
  makeAssignment,
  type Fixture,
} from '../utils/db-fixtures';

describeWithDb('doubles edge — pause keeps pair, baja dissolves it (real DB)', () => {
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

  // ---- helpers (mirror doubles-pairs-account-link.test.ts) -------------------

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
      // doubles_pairs → athletes on delete cascade; subscriptions + notifications →
      // users on delete cascade. Delete pairs explicitly first, then athlete + user.
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

  // ---- (1) PAUSE one member → pair stays, snapshot marks partner paused -------

  test(
    'pause one member: pair stays active, buildPartnerSnapshot marks the partner paused',
    async () => {
      const fx = await makeCoachAndAthlete(sql); // athlete A = the survivor/viewer
      cleanups.push(fx.cleanup);
      const b = await makeSecondAthlete(fx); // athlete B = the one who pauses

      const pair = await createDoublesPair({
        coach_id: fx.coachId,
        athlete_a_id: fx.athleteId,
        athlete_b_id: b.athleteId,
        client: sql,
      });
      expect(pair.status).toBe('active');

      // B goes EN PAUSA (the lifecycle flip pauseAthlete performs). Pair untouched.
      await sql`update athletes set lifecycle_status = 'pausado' where id = ${b.athleteId}`;

      // The pair is STILL active — a pause freezes a member, it does NOT unpair.
      expect(await pairStatus(pair.id)).toBe('active');

      // A's "Tu pareja" snapshot still resolves B, tagged paused (panel shows
      // "en pausa" rather than vanishing/breaking).
      const snap = await buildPartnerSnapshot(fx.athleteId, sql);
      expect(snap).not.toBeNull();
      expect(snap!.athlete_id).toBe(b.athleteId);
      expect(snap!.partner_paused).toBe(true);
    },
    DB_TEST_TIMEOUT_MS,
  );

  // ---- (2) BAJA one member → dissolve all 3 axes, notify, preserve history ----

  test(
    'baja one member: pair dissolved, partner_id cleared both sides, survivor sees no partner, history preserved',
    async () => {
      const fx = await makeCoachAndAthlete(sql); // athlete A = the survivor/viewer
      cleanups.push(fx.cleanup);
      const b = await makeSecondAthlete(fx); // athlete B = the one who leaves
      await makeDoblesSubscription(fx.athleteUserId);
      await makeDoblesSubscription(b.userId);

      const pair = await createDoublesPair({
        coach_id: fx.coachId,
        athlete_a_id: fx.athleteId,
        athlete_b_id: b.athleteId,
        client: sql,
      });

      // Sanity: linked on all three axes before the baja.
      expect(await partnerIdOf(fx.athleteUserId)).toBe(String(b.userId));
      expect(await subPartnerOf(fx.athleteUserId)).toBe(String(b.userId));
      expect(await subPartnerOf(b.userId)).toBe(String(fx.athleteUserId));

      // A JOINT execution (0074) owned by the SURVIVOR (A), linking B — the shared
      // history that MUST survive the dissolve.
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

      // B goes DE BAJA. bajaAthlete flips lifecycle_status then calls the dobles seam
      // inside ITS transaction — we reproduce that here (flip + dissolvePairOnBaja
      // in ONE sql.begin), driving the exact seam.
      await sql.begin(async (tx) => {
        await tx`
          update athletes
          set lifecycle_status = 'baja', baja_at = now(), baja_reason = 'otro'
          where id = ${b.athleteId}
        `;
        await dissolvePairOnBaja(BigInt(b.athleteId), tx);
      });

      // Training axis flipped; account + billing cleared BOTH ways.
      expect(await pairStatus(pair.id)).toBe('dissolved');
      expect(await partnerIdOf(fx.athleteUserId)).toBeNull();
      expect(await partnerIdOf(b.userId)).toBeNull();
      expect(await subPartnerOf(fx.athleteUserId)).toBeNull();
      expect(await subPartnerOf(b.userId)).toBeNull();

      // The survivor's "Tu pareja" panel now shows NO partner (pair dissolved →
      // getActiveDoublesPairForAthlete resolves nothing).
      const snap = await buildPartnerSnapshot(fx.athleteId, sql);
      expect(snap).toBeNull();

      // History CONSERVED — the joint execution (and its partner link) still stands.
      const execAfter = await sql<{ id: string; partner_athlete_id: string | null }[]>`
        select id::text as id, partner_athlete_id::text as partner_athlete_id
        from workout_executions where id = ${execId} limit 1
      `;
      expect(execAfter.length).toBe(1);
      expect(execAfter[0]!.partner_athlete_id).toBe(String(b.athleteId));

      // The SURVIVOR was notified (system / partner_left), pointing at the leaver.
      const notif = await sql<{ payload_json: { kind: string; former_partner_user_id: string } }[]>`
        select payload_json
        from notifications
        where user_id = ${fx.athleteUserId} and type = 'system'
        order by id desc
        limit 1
      `;
      expect(notif.length).toBe(1);
      expect(notif[0]!.payload_json.kind).toBe('partner_left');
      expect(notif[0]!.payload_json.former_partner_user_id).toBe(String(b.userId));
    },
    DB_TEST_TIMEOUT_MS,
  );
});
