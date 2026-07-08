/**
 * Real-DB tests for the #13 ADHERENCE PAUSE EXCLUSION + the athlete week paused flag.
 * No SQL mocked (Neon test branch, describeWithDb). WRITTEN for tsc; SKIPPED unless
 * TEST_DATABASE_URL is set. Requires migration 0104_athlete_lifecycle.sql applied.
 *
 * The lib under test uses `@/lib/db` (DATABASE_URL); seeds use the test client
 * (TEST_DATABASE_URL). The runner points BOTH at the same branch (same convention as
 * athlete-lifecycle.db.test.ts / macro-progress.test.ts).
 *
 * Covers:
 *   • roster adherence EXCLUDES days inside an open pause (denominator shrinks, not 0%):
 *     4 coach sessions across a 2-week window, 2 completed → baseline 50%; an open pause
 *     over the 2 UNCOMPLETED sessions removes them → 100% (proves exclusion, since
 *     counting-as-0% would leave 50% untouched);
 *   • a fully-paused window → scheduled 0 → adherencePct null → compliance_pct null;
 *   • buildAthleteWeekPlan carries paused=true + the open pause's reason/since.
 */

import { afterAll, afterEach, expect, test } from 'vitest';
import { fetchAthletesForCoach } from '@/lib/dashboard/athletes/list';
import { buildAthleteWeekPlan } from '@/lib/athlete/week-plan';
import { addDays, isoDateString, startOfDayUtc } from '@fahybrid/shared/domain/dates';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeTemplate,
  makeMonthTemplate,
  makeAssignment,
  type Fixture,
} from '../utils/db-fixtures';

describeWithDb('adherence pause exclusion + week paused flag (#13, real DB)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  // "Today" aligned with list.ts's rolling window (startOfDayUtc). d(n) = today+n.
  const today = startOfDayUtc(new Date());
  const d = (n: number): string => isoDateString(addDays(today, n));

  async function newAthlete(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    return fx;
  }

  /** Insert an OPEN pause interval (end_date null = paused now) for the athlete. */
  async function openPause(fx: Fixture, startIso: string, reason = 'lesion'): Promise<void> {
    await sql`
      insert into athlete_pauses (athlete_id, start_date, end_date, reason, requested_by)
      values (${fx.athleteId}, ${startIso}::date, null, ${reason}, 'coach')
    `;
  }

  /**
   * Seed an athlete with an ACTIVE plan window (so the roster surfaces a compliance %)
   * and 4 coach sessions inside the rolling adherence window:
   *   • 2 completed (execution-backed) OUTSIDE any later pause: d(-12), d(-10);
   *   • 2 uncompleted INSIDE a would-be pause:                   d(-3),  d(-2).
   * Baseline (no pause): scheduled 4, completed 2 → 50%.
   */
  async function seedAdherence(fx: Fixture): Promise<void> {
    const workoutTemplateId = await makeTemplate({ fx, name: `Adh tpl ${fx.athleteId}` });
    // An active month-assignment window CONTAINING today ⇒ the roster's block_type is
    // non-null ⇒ it computes compliance (rather than "—" for a planless athlete).
    const { monthId } = await makeMonthTemplate({
      fx,
      weekCount: 1,
      workoutDays: [1],
      workoutTemplateId,
    });
    await sql`
      insert into athlete_month_assignments
        (athlete_id, month_template_id, start_date, end_date, created_by_coach_id)
      values (${fx.athleteId}, ${monthId}, ${d(-10)}::date, ${d(10)}::date, ${fx.coachId})
    `;

    // 2 completed (OUTSIDE the pause we add later).
    for (const day of [d(-12), d(-10)]) {
      const assignmentId = await makeAssignment({ fx, templateId: workoutTemplateId, scheduledForIso: day });
      await sql`
        insert into workout_executions (assignment_id, athlete_id, notes)
        values (${assignmentId}, ${fx.athleteId}, 'done')
      `;
    }
    // 2 uncompleted (INSIDE the pause we add later).
    for (const day of [d(-3), d(-2)]) {
      await makeAssignment({ fx, templateId: workoutTemplateId, scheduledForIso: day });
    }
  }

  async function rosterCompliance(fx: Fixture): Promise<number | null> {
    const roster = await fetchAthletesForCoach({ coach_id: fx.coachId, client: sql });
    const row = roster.find((r) => r.athlete_id === String(fx.athleteId));
    expect(row).toBeTruthy();
    return row!.compliance_pct;
  }

  afterEach(async () => {
    for (const fx of fixtures.splice(0)) {
      // executions don't cascade from the fixture's assignment delete; pauses cascade
      // from the athlete delete inside fx.cleanup().
      await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
      await fx.cleanup();
    }
  });

  afterAll(async () => {
    await closeTestSql();
  });

  test('adherence EXCLUDES the paused half (denominator shrinks, not counted as 0%)', async () => {
    const fx = await newAthlete();
    await seedAdherence(fx);

    // Baseline: 4 scheduled, 2 completed → 50%.
    expect(await rosterCompliance(fx)).toBe(50);

    // Open pause from d(-5) → today covers the 2 UNCOMPLETED sessions (d(-3), d(-2))
    // but NOT the 2 completed ones (d(-12), d(-10)). They drop out of BOTH numerator
    // and denominator → 2 scheduled, 2 completed → 100%. (Counting them as 0% would
    // have left 50% — so 100% proves EXCLUSION.)
    await openPause(fx, d(-5));
    expect(await rosterCompliance(fx)).toBe(100);
  });

  test('a fully-paused window → scheduled 0 → adherence null (shown as "—")', async () => {
    const fx = await newAthlete();
    await seedAdherence(fx);
    expect(await rosterCompliance(fx)).toBe(50); // sanity: baseline still 50%

    // Open pause from d(-14) → today covers ALL 4 sessions → scheduled 0 → null.
    await openPause(fx, d(-14));
    expect(await rosterCompliance(fx)).toBeNull();
  });

  test('week payload carries paused=true with the open pause reason + since', async () => {
    const fx = await newAthlete();
    const sinceIso = d(-3);
    await sql`update athletes set lifecycle_status = 'pausado' where id = ${fx.athleteId}`;
    await openPause(fx, sinceIso, 'vacaciones');

    const week = await buildAthleteWeekPlan(fx.athleteId);
    expect(week.paused).toBe(true);
    expect(week.paused_reason).toBe('vacaciones');
    expect(week.paused_since).toBe(sinceIso);
  });

  test('an ACTIVO athlete is never flagged paused (no pause interval)', async () => {
    const fx = await newAthlete();
    const week = await buildAthleteWeekPlan(fx.athleteId);
    expect(week.paused).toBe(false);
    expect(week.paused_since).toBeNull();
    expect(week.paused_reason).toBeNull();
  });
});
