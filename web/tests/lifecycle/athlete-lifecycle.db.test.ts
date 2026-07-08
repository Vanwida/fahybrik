/**
 * Real-DB tests for the athlete lifecycle state machine (#13). No SQL mocked (Neon
 * test branch, describeWithDb). WRITTEN for tsc; SKIPPED unless TEST_DATABASE_URL is set.
 *
 * Requires migration 0104_athlete_lifecycle.sql applied to the branch. The lib functions
 * under test use `@/lib/db` (DATABASE_URL); the seeds use the test client
 * (TEST_DATABASE_URL) — the runner points both at the same branch (same convention as
 * waitlist.db.test.ts). Waitlist side-effects are neutralized by pinning max_athletes=null
 * for the suite (releaseWaitlistToCapacity is then a pure no-op), so these tests isolate
 * the lifecycle behaviour.
 *
 * Covers:
 *   • state machine: activo→pausado→activo, activo→baja→activo (re-alta);
 *   • guards reject every illegal transition;
 *   • capacity EXCLUDES paused + baja athletes (active sub, but not counted);
 *   • pause opens the interval (end_date null), resume closes it (end_date=today);
 *   • pause-request: pending → confirm pauses the athlete (requested_by='athlete');
 *   • baja sets cancel_at_period_end, but does NOT anonymize/delete the account and
 *     PRESERVES a seeded workout_execution row (baja ≠ RGPD deletion #19).
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { getCapacityState, getMaxAthletes, setMaxAthletes } from '@/lib/coach/capacity';
import {
  pauseAthlete,
  resumeAthlete,
  bajaAthlete,
  reAltaAthlete,
  requestPause,
  confirmPauseRequest,
  declinePauseRequest,
  getAthleteLifecycle,
  getAthletePauseIntervals,
  listOpenPauseIntervals,
  LifecycleError,
} from '@/lib/coach/athlete-lifecycle';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, makeAssignment, type Fixture } from '../utils/db-fixtures';

describeWithDb('athlete lifecycle state machine (#13, real DB)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];
  let savedMax: number | null = null;

  const todayIso = (): string => isoDateString(startOfDayInBox(new Date()));

  /** A coach + athlete owned by that coach. Registered for teardown. */
  async function newAthlete(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    return fx;
  }

  /** Give the fixture athlete an ACTIVE individual subscription (+1 toward capacity). */
  async function activateSubscription(fx: Fixture): Promise<void> {
    await sql`
      insert into subscriptions (user_id, plan_type, status)
      values (${fx.athleteUserId}, 'individual', 'active')
    `;
  }

  async function lifecycleStatus(fx: Fixture): Promise<string> {
    const rows = await sql<{ lifecycle_status: string }[]>`
      select lifecycle_status from athletes where id = ${fx.athleteId} limit 1
    `;
    return rows[0]!.lifecycle_status;
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
    // Neutralize the waitlist: uncapped ⇒ releaseWaitlistToCapacity is a no-op, so the
    // lifecycle transitions have no email/lead side-effects. Restored in afterAll.
    savedMax = await getMaxAthletes();
    await setMaxAthletes(null);
  });

  afterEach(async () => {
    // Each fixture cleans its own rows in FK-safe order (athlete_pauses / requests +
    // workout_executions cascade from athletes/assignments; subscriptions cascade from users).
    for (const fx of fixtures.splice(0)) {
      await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
      await fx.cleanup();
    }
  });

  afterAll(async () => {
    await setMaxAthletes(savedMax);
    await closeTestSql();
  });

  // ── State machine ───────────────────────────────────────────────────────────────
  test('activo → pausado → activo (pause then resume)', async () => {
    const fx = await newAthlete();
    expect(await lifecycleStatus(fx)).toBe('activo');

    const paused = await pauseAthlete({
      athlete_id: BigInt(fx.athleteId),
      reason: 'lesion',
      requested_by: 'coach',
      coach_id: BigInt(fx.coachId),
    });
    expect(paused.status).toBe('pausado');
    expect(await lifecycleStatus(fx)).toBe('pausado');

    const resumed = await resumeAthlete({ athlete_id: BigInt(fx.athleteId) });
    expect(resumed.status).toBe('activo');
    expect(await lifecycleStatus(fx)).toBe('activo');
  });

  test('activo → baja → activo (re-alta clears baja fields)', async () => {
    const fx = await newAthlete();

    const baja = await bajaAthlete({
      athlete_id: BigInt(fx.athleteId),
      reason: 'otro',
      coach_id: BigInt(fx.coachId),
    });
    expect(baja.status).toBe('baja');

    const lc = await getAthleteLifecycle(BigInt(fx.athleteId));
    expect(lc?.lifecycle_status).toBe('baja');
    expect(lc?.baja_at).not.toBeNull();
    expect(lc?.baja_reason).toBe('otro');

    const realta = await reAltaAthlete({ athlete_id: BigInt(fx.athleteId), coach_id: BigInt(fx.coachId) });
    expect(realta.status).toBe('activo');
    expect(realta.over_capacity).toBe(false); // uncapped for this suite

    const after = await getAthleteLifecycle(BigInt(fx.athleteId));
    expect(after?.lifecycle_status).toBe('activo');
    expect(after?.baja_at).toBeNull();
    expect(after?.baja_reason).toBeNull();
  });

  // ── Guards ──────────────────────────────────────────────────────────────────────
  test('guards reject every illegal transition', async () => {
    const fx = await newAthlete(); // starts activo

    // resume / re_alta from activo are illegal
    await expect(resumeAthlete({ athlete_id: BigInt(fx.athleteId) })).rejects.toBeInstanceOf(LifecycleError);
    await expect(
      reAltaAthlete({ athlete_id: BigInt(fx.athleteId), coach_id: BigInt(fx.coachId) }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });

    // pause, then pausing again is illegal
    await pauseAthlete({
      athlete_id: BigInt(fx.athleteId),
      reason: 'vacaciones',
      requested_by: 'coach',
      coach_id: BigInt(fx.coachId),
    });
    await expect(
      pauseAthlete({
        athlete_id: BigInt(fx.athleteId),
        reason: 'vacaciones',
        requested_by: 'coach',
        coach_id: BigInt(fx.coachId),
      }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });

    // baja, then baja again is illegal; resume from baja is illegal
    await bajaAthlete({ athlete_id: BigInt(fx.athleteId), reason: 'paron', coach_id: BigInt(fx.coachId) });
    await expect(
      bajaAthlete({ athlete_id: BigInt(fx.athleteId), reason: 'paron', coach_id: BigInt(fx.coachId) }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
    await expect(resumeAthlete({ athlete_id: BigInt(fx.athleteId) })).rejects.toBeInstanceOf(LifecycleError);
  });

  test('a missing athlete is not_found (404)', async () => {
    await expect(resumeAthlete({ athlete_id: BigInt(2_000_000_000) })).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });
  });

  // ── Capacity exclusion ────────────────────────────────────────────────────────────
  test('capacity EXCLUDES paused and baja athletes (active sub, not counted)', async () => {
    const base = (await getCapacityState()).active;

    const paused = await newAthlete();
    await activateSubscription(paused);
    const gone = await newAthlete();
    await activateSubscription(gone);
    // Both hold an active subscription and are activo → both counted.
    expect((await getCapacityState()).active).toBe(base + 2);

    // Pause one → excluded even though the subscription stays active.
    await pauseAthlete({
      athlete_id: BigInt(paused.athleteId),
      reason: 'lesion',
      requested_by: 'coach',
      coach_id: BigInt(paused.coachId),
    });
    expect((await getCapacityState()).active).toBe(base + 1);

    // Baja the other → also excluded (subscription still active until period end).
    await bajaAthlete({ athlete_id: BigInt(gone.athleteId), reason: 'otro', coach_id: BigInt(gone.coachId) });
    expect((await getCapacityState()).active).toBe(base);
  });

  test('re-alta over a full cap returns over_capacity=true (coach override still commits)', async () => {
    const a = await newAthlete();
    await activateSubscription(a);
    // Take it to baja so it is currently excluded, then pin the cap at the CURRENT active
    // count (the athlete no longer in it). Re-alta pushes active over the cap.
    await bajaAthlete({ athlete_id: BigInt(a.athleteId), reason: 'otro', coach_id: BigInt(a.coachId) });
    const activeWhileBaja = (await getCapacityState()).active;

    await setMaxAthletes(activeWhileBaja); // exactly full without this athlete
    try {
      const res = await reAltaAthlete({ athlete_id: BigInt(a.athleteId), coach_id: BigInt(a.coachId) });
      expect(res.over_capacity).toBe(true); // over the cap, but the transition committed
      expect(await lifecycleStatus(a)).toBe('activo');
    } finally {
      await setMaxAthletes(null); // restore the suite invariant
    }
  });

  // ── Pause intervals ────────────────────────────────────────────────────────────────
  test('pause OPENS the interval (end_date null), resume CLOSES it at today', async () => {
    const fx = await newAthlete();

    await pauseAthlete({
      athlete_id: BigInt(fx.athleteId),
      reason: 'lesion',
      note: 'rodilla',
      requested_by: 'coach',
      coach_id: BigInt(fx.coachId),
    });

    let intervals = await getAthletePauseIntervals(BigInt(fx.athleteId));
    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.start_date).toBe(todayIso());
    expect(intervals[0]!.end_date).toBeNull(); // OPEN

    // It is also visible in the roster-wide "who is paused" read.
    const open = await listOpenPauseIntervals(BigInt(fx.athleteId));
    expect(open).toHaveLength(1);
    expect(open[0]!.reason).toBe('lesion');
    expect(open[0]!.requested_by).toBe('coach');

    await resumeAthlete({ athlete_id: BigInt(fx.athleteId) });

    intervals = await getAthletePauseIntervals(BigInt(fx.athleteId));
    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.end_date).toBe(todayIso()); // CLOSED at today
    expect(await listOpenPauseIntervals(BigInt(fx.athleteId))).toHaveLength(0);
  });

  // ── Pause requests ─────────────────────────────────────────────────────────────────
  test('pause-request: pending → confirm pauses the athlete (requested_by=athlete)', async () => {
    const fx = await newAthlete();

    const req = await requestPause({ athlete_id: BigInt(fx.athleteId), reason: 'vacaciones', note: 'agosto' });
    expect(req.status).toBe('pending');
    expect(await lifecycleStatus(fx)).toBe('activo'); // a request is NOT a pause

    // A second pending request is rejected.
    await expect(
      requestPause({ athlete_id: BigInt(fx.athleteId), reason: 'vacaciones' }),
    ).rejects.toMatchObject({ code: 'request_exists' });

    const result = await confirmPauseRequest({
      request_id: BigInt(req.request_id),
      coach_id: BigInt(fx.coachId),
    });
    expect(result.status).toBe('pausado');
    expect(await lifecycleStatus(fx)).toBe('pausado');

    // The request row is now confirmed, and the pause carries requested_by='athlete'.
    const reqRows = await sql<{ status: string; resolved_by_coach_id: string | null }[]>`
      select status, resolved_by_coach_id::text as resolved_by_coach_id
      from athlete_pause_requests where id = ${Number(req.request_id)} limit 1
    `;
    expect(reqRows[0]!.status).toBe('confirmed');
    const open = await listOpenPauseIntervals(BigInt(fx.athleteId));
    expect(open[0]!.requested_by).toBe('athlete');
  });

  test('pause-request: decline resolves without pausing; already-resolved re-decline is rejected', async () => {
    const fx = await newAthlete();
    const req = await requestPause({ athlete_id: BigInt(fx.athleteId), reason: 'otro' });

    const declined = await declinePauseRequest({
      request_id: BigInt(req.request_id),
      coach_id: BigInt(fx.coachId),
    });
    expect(declined.status).toBe('declined');
    expect(await lifecycleStatus(fx)).toBe('activo');

    await expect(
      declinePauseRequest({ request_id: BigInt(req.request_id), coach_id: BigInt(fx.coachId) }),
    ).rejects.toMatchObject({ code: 'already_resolved' });
  });

  // ── Baja preserves history + billing (baja ≠ RGPD deletion #19) ──────────────────────
  test('baja sets cancel_at_period_end, does NOT anonymize/delete, and preserves history', async () => {
    const fx = await newAthlete();
    await activateSubscription(fx);

    // Seed an executed workout (history that MUST survive baja).
    const templateId = await makeTemplate({ fx, name: 'Baja history template' });
    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: todayIso() });
    const exec = await sql<{ id: string }[]>`
      insert into workout_executions (assignment_id, athlete_id, notes)
      values (${assignmentId}, ${fx.athleteId}, 'done before baja')
      returning id::text as id
    `;
    const executionId = Number(exec[0]!.id);

    const emailBefore = (
      await sql<{ email: string; deleted_at: Date | null }[]>`
        select email, deleted_at from users where id = ${fx.athleteUserId} limit 1
      `
    )[0]!;

    await bajaAthlete({ athlete_id: BigInt(fx.athleteId), reason: 'lesion', coach_id: BigInt(fx.coachId) });

    // 1) Billing cancels at period end (not immediately).
    const subs = await sql<{ cancel_at_period_end: boolean; status: string }[]>`
      select cancel_at_period_end, status from subscriptions where user_id = ${fx.athleteUserId} limit 1
    `;
    expect(subs[0]!.cancel_at_period_end).toBe(true);
    expect(subs[0]!.status).toBe('active'); // access preserved until period end

    // 2) Account NOT anonymized / soft-deleted.
    const userAfter = (
      await sql<{ email: string; deleted_at: Date | null }[]>`
        select email, deleted_at from users where id = ${fx.athleteUserId} limit 1
      `
    )[0]!;
    expect(userAfter.deleted_at).toBeNull();
    expect(userAfter.email).toBe(emailBefore.email); // unchanged, not deleted-<id>@…

    // 3) No RGPD hard-delete enqueued.
    const jobs = await sql<{ n: number }[]>`
      select count(*)::int as n from account_deletion_jobs where user_id = ${fx.athleteUserId}
    `;
    expect(jobs[0]!.n).toBe(0);

    // 4) History preserved — the executed workout row still exists.
    const stillThere = await sql<{ id: string }[]>`
      select id::text as id from workout_executions where id = ${executionId} limit 1
    `;
    expect(stillThere).toHaveLength(1);
  });
});
