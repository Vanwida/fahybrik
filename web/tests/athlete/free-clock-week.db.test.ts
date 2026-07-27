/**
 * THE BOX CLOCK, READ BACK — real-DB integration between the entreno-libre save
 * (`createFreeWorkout`, kind 'clock') and the week the athlete and their coach
 * then look at (`buildAthleteWeekPlan`). No SQL mocked (Neon branch).
 *
 * Why this suite exists: a clock has NO template_segments, and every derived
 * field on the week used to come from segments alone. A session with none fell
 * through to `template_format`, so the week reported `modality: 'emom'` — a
 * FORMAT sitting in the modality field. It is not a modality: the day dot had to
 * guess a colour from it and the session read as a shapeless, timeless row.
 * The clock states its real modality and its own duration, and this asserts the
 * week serves both.
 *
 * WIRING: both modules build their client from DATABASE_URL at IMPORT time (the
 * writer takes an injectable `sql`, the reader does not), so we bridge
 * DATABASE_URL → the test branch and dynamic-import BOTH after. A static import
 * of either would freeze the dummy URL from tests/setup/env.ts.
 *
 * WRITE, do NOT run here (TCP egress is blocked; Alex runs the suite against a
 * branch). Skips automatically when TEST_DATABASE_URL is unset (describeWithDb).
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import type { createFreeWorkout as CreateFreeWorkout } from '@/lib/athlete/create-free-workout';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, type Fixture } from '../utils/db-fixtures';
import type { AthleteWeekDaySession, AthleteWeekPlan } from '@/lib/athlete/week-plan';

// Cold Neon branch endpoints exceed the 5s default on the first txn.
const DB_TIMEOUT = 30_000;

/** Typed prescription builder — contextual typing narrows the literal unions. */
const p = (pres: Prescription): Prescription => pres;

describeWithDb('entreno libre — a bare clock read back from the week (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  let buildAthleteWeekPlan: (
    athleteId: number | bigint,
    weekOffset?: number,
  ) => Promise<AthleteWeekPlan>;
  let createFreeWorkout: typeof CreateFreeWorkout;

  beforeAll(async () => {
    // Point the production client at the SAME branch, THEN import both modules.
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    ({ buildAthleteWeekPlan } = await import('@/lib/athlete/week-plan'));
    ({ createFreeWorkout } = await import('@/lib/athlete/create-free-workout'));
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

  /** The one session this athlete has this week (they are freshly seeded). */
  async function todaysSession(athleteId: number): Promise<AthleteWeekDaySession> {
    const week = await buildAthleteWeekPlan(athleteId);
    const sessions = week.days.flatMap((d) => d.sessions);
    expect(sessions).toHaveLength(1);
    return sessions[0]!;
  }

  test('an AMRAP clock reads as FUNCIONAL and carries its window as the duration', async () => {
    const fx = await newFixture();

    const result = await createFreeWorkout({
      athleteId: fx.athleteId,
      coachId: fx.coachId,
      title: 'AMRAP · 12:00',
      scheme: 'amrap',
      metrics: { perceived_exertion: 9, total_duration_seconds: 720 },
      kind: 'clock',
      prescription: p({ scheme: 'amrap', modality: 'functional', total_s: 720 }),
      sql,
    });

    const session = await todaysSession(fx.athleteId);
    expect(session.assignment_id).toBe(result.assignment_id);
    // The session's own title survives — a clock is named by its shape.
    expect(session.title).toBe('AMRAP · 12:00');
    expect(session.origin).toBe('self');
    // THE REGRESSION THIS SUITE EXISTS FOR: a real modality, never the format.
    expect(session.modality).toBe('functional');
    // The AMRAP window IS the session's duration — stated, not estimated.
    expect(session.est_duration_minutes).toBe(12);
  }, DB_TIMEOUT);

  test('an EMOM clock times itself by its cycle (work + change) × rounds', async () => {
    const fx = await newFixture();

    await createFreeWorkout({
      athleteId: fx.athleteId,
      coachId: fx.coachId,
      title: 'EMOM 10 · 45/15',
      scheme: 'emom',
      metrics: { perceived_exertion: 8 },
      kind: 'clock',
      prescription: p({
        scheme: 'emom',
        modality: 'functional',
        rounds: 10,
        work_s: 45,
        rest_s: 15,
      }),
      sql,
    });

    const session = await todaysSession(fx.athleteId);
    expect(session.modality).toBe('functional');
    expect(session.est_duration_minutes).toBe(10); // 10 × (45 + 15) s
  }, DB_TIMEOUT);

  test('an open-ended clock (For Time) states NO duration rather than inventing one', async () => {
    const fx = await newFixture();

    await createFreeWorkout({
      athleteId: fx.athleteId,
      coachId: fx.coachId,
      title: 'For Time · 5 rondas',
      scheme: 'for_time',
      metrics: { perceived_exertion: 9, score_time_s: 843 },
      kind: 'clock',
      prescription: p({ scheme: 'for_time', modality: 'functional', rounds: 5 }),
      sql,
    });

    const session = await todaysSession(fx.athleteId);
    expect(session.modality).toBe('functional');
    // You finish a For Time when you finish it. There is no duration to state.
    expect(session.est_duration_minutes).toBeNull();
  }, DB_TIMEOUT);

  test('a libre WITH movements is unchanged — its modality still comes from its exercises', async () => {
    const fx = await newFixture();
    const burpee = await makeExercise({
      fx,
      name: 'Burpee',
      modality: 'functional',
      category: 'plyometric',
    });

    await createFreeWorkout({
      athleteId: fx.athleteId,
      coachId: fx.coachId,
      title: 'AMRAP 12',
      scheme: 'amrap',
      metrics: { perceived_exertion: 9 },
      kind: 'items',
      items: [
        {
          exerciseId: burpee,
          prescription: p({
            scheme: 'amrap',
            total_s: 720,
            sets: [{ measure: { kind: 'reps', value: 12 } }],
          }),
        },
      ],
      sql,
    });

    const session = await todaysSession(fx.athleteId);
    // Derived from the segment's exercise (mig 0053), exactly as before.
    expect(session.modality).toBe('functional');
    expect(session.blocks_count).toBe(1);
  }, DB_TIMEOUT);
});
