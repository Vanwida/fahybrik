/**
 * Polar v4 cron poller — real-DB integration tests. No SQL mocked (real Neon
 * branch); the v4 CLIENT is injected as a fake returning fixtures shaped from the
 * official v4 OpenAPI spec. Exercises the end-to-end path the poller owns:
 *   • a connected athlete → training session pulled → workout_executions
 *     (source='polar') + assignment 'completed' + hr stream + per-lap segments,
 *     and sleep + nightly recharge → biometric_streams;
 *   • a re-run is idempotent (counts unchanged);
 *   • a connection whose client can't be built is SKIPPED (not errored);
 *   • one athlete throwing does not sink the run (errored++, others still synced).
 *
 * WRITE, do NOT run here (TCP egress blocked; Alex runs the suite against a branch).
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { Buffer } from 'node:buffer';

import { runPolarSync } from '@/lib/cron/polar-sync';
import type {
  PolarV4Client,
  V4TrainingSession,
  V4NightSleep,
  V4NightlyRechargeResult,
  V4Sport,
} from '@/lib/polar/accesslink';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

const DB_TEST_TIMEOUT_MS = 30_000;

// Deterministic "now" so the poller's window + the fixture assignment line up.
const NOW = new Date('2026-07-15T12:00:00.000Z');
const TODAY = '2026-07-15';

const SPORTS: V4Sport[] = [{ id: { id: 'sp-run' }, name: 'RUNNING', parentSport: { id: 'sp-run' } }];

function runSession(): V4TrainingSession {
  return {
    identifier: { id: 'S1' },
    startTime: `${TODAY}T08:00:00.000`,
    timezoneOffsetMinutes: 120, // → 06:00 UTC
    durationMillis: 1_500_000,
    distanceMeters: 5000,
    calories: 400,
    hrAvg: 150,
    hrMax: 175,
    sport: { id: 'sp-run' },
    exercises: [
      {
        startTime: `${TODAY}T08:00:00.000`,
        timezoneOffsetMinutes: 120,
        sport: { id: 'sp-run' },
        laps: {
          laps: [
            { splitTimeMillis: 0, durationMillis: 300_000, distanceMeters: 1000, statistics: { statistics: [{ type: 'STATISTICS_TYPE_HEART_RATE', avg: 145, max: 160 }] } },
            { splitTimeMillis: 300_000, durationMillis: 300_000, distanceMeters: 1000, statistics: { statistics: [{ type: 'STATISTICS_TYPE_HEART_RATE', avg: 150, max: 165 }] } },
          ],
        },
      },
    ],
  };
}

const SLEEP: V4NightSleep = {
  sleepDate: TODAY,
  sleepScore: { sleepScore: 82 },
  sleepEvaluation: { asleepDuration: '27000s' },
};
const RECHARGE: V4NightlyRechargeResult = { date: TODAY, recoveryIndicator: 4, meanNightlyRecoveryRmssd: 68 };

// Fake client: returns the fixtures only for TODAY's window slice.
function fakeClient(): PolarV4Client {
  return {
    listSports: async () => SPORTS,
    listTrainingSessions: async (from) => (from === TODAY ? [runSession()] : []),
    listSleeps: async (from) => (from === TODAY ? [SLEEP] : []),
    listNightlyRecharge: async () => [RECHARGE],
  };
}

describeWithDb('polar v4 poller (real DB)', () => {
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

  async function connectPolar(athleteId: number): Promise<void> {
    // Dummy encrypted token (never decrypted — the client is injected in tests).
    await sql`
      insert into wearable_connections (athlete_id, provider, access_token_encrypted, status)
      values (${athleteId}, 'polar', ${Buffer.from([0])}, 'connected')
    `;
    cleanups.push(async () => {
      await sql`delete from wearable_connections where athlete_id = ${athleteId} and provider = 'polar'`;
    });
  }

  async function setup(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    cleanups.push(async () => {
      await sql`delete from segment_executions where execution_id in (select id from workout_executions where athlete_id = ${fx.athleteId})`;
      await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
      await sql`delete from biometric_streams where athlete_id = ${fx.athleteId}`;
    });
    return fx;
  }

  test(
    'connected athlete → session (execution+segments+hr+done) + sleep + recharge',
    async () => {
      const fx = await setup();
      const templateId = await makeTemplate({ fx, name: 'Run day' });
      const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: TODAY });
      await connectPolar(fx.athleteId);

      // clientFor returns the fake ONLY for our athlete (other stray connected
      // polar rows, if any, resolve null → skipped, keeping the test isolated).
      const clientFor = async (athlete_id: bigint) =>
        athlete_id === BigInt(fx.athleteId) ? fakeClient() : null;

      const res = await runPolarSync({ sql, now: () => NOW, clientFor });
      expect(res.synced).toBeGreaterThanOrEqual(1);

      const exec = await sql<{ source: string; ref: string }[]>`
        select source, source_workout_ref as ref from workout_executions where athlete_id = ${fx.athleteId}
      `;
      expect(exec).toHaveLength(1);
      expect(exec[0]!.source).toBe('polar');
      expect(exec[0]!.ref).toBe('S1');

      const status = await sql<{ status: string }[]>`select status from workout_assignments where id = ${assignmentId}`;
      expect(status[0]!.status).toBe('completed');

      const segs = await sql<{ n: number; modality: string }[]>`
        select count(*)::int as n, min(se.modality) as modality
        from segment_executions se join workout_executions we on se.execution_id = we.id
        where we.athlete_id = ${fx.athleteId}
      `;
      expect(segs[0]!.n).toBe(2);
      expect(segs[0]!.modality).toBe('run');

      const streams = await sql<{ metric: string; v: string }[]>`
        select metric_type::text as metric, value_numeric::text as v
        from biometric_streams where athlete_id = ${fx.athleteId}
      `;
      const byMetric = Object.fromEntries(streams.map((r) => [r.metric, Number(r.v)]));
      expect(byMetric['hr']).toBe(150);
      expect(byMetric['sleep_duration']).toBe(27000);
      expect(byMetric['sleep_score']).toBe(82);
      expect(byMetric['recovery']).toBe(4);
      expect(byMetric['hrv']).toBe(68);

      // Idempotent re-run: same counts.
      await runPolarSync({ sql, now: () => NOW, clientFor });
      const again = await sql<{ execs: number; segs: number; streams: number }[]>`
        select
          (select count(*) from workout_executions where athlete_id = ${fx.athleteId})::int as execs,
          (select count(*) from segment_executions se join workout_executions we on se.execution_id = we.id where we.athlete_id = ${fx.athleteId})::int as segs,
          (select count(*) from biometric_streams where athlete_id = ${fx.athleteId})::int as streams
      `;
      expect(again[0]).toEqual({ execs: 1, segs: 2, streams: 5 });
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'a connection whose client cannot be built is skipped (not errored); a thrower is errored',
    async () => {
      const fx = await setup();
      await connectPolar(fx.athleteId);

      // Null → skipped.
      const nullClientFor = async () => null;
      const skipRes = await runPolarSync({ sql, now: () => NOW, clientFor: nullClientFor });
      expect(skipRes.skipped).toBeGreaterThanOrEqual(1);

      // Throw → errored, run does not crash.
      const throwClientFor = async (athlete_id: bigint) => {
        if (athlete_id === BigInt(fx.athleteId)) throw new Error('boom');
        return null;
      };
      const errRes = await runPolarSync({ sql, now: () => NOW, clientFor: throwClientFor });
      expect(errRes.errored).toBeGreaterThanOrEqual(1);
    },
    DB_TEST_TIMEOUT_MS,
  );
});
