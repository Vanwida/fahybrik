/**
 * Polar AccessLink ingest — real-DB integration tests. No SQL mocked (real Neon
 * branch); the AccessLink READ client is mocked with realistic fixtures shaped
 * from the official v3 OpenAPI spec. Mirrors the guarantees ingest-garmin gives:
 *   • EXERCISE with a same-day assignment → workout_executions (source='polar') +
 *     the assignment flips to 'completed' + an hr biometric_streams row + ONE
 *     whole-session segment_executions row (modality + native pace);
 *   • re-delivery of the same webhook is idempotent (one execution, one hr, one
 *     segment);
 *   • EXERCISE with NO assignment that day → hr stream stored, NO execution
 *     (calques ingest-garmin);
 *   • a pre-existing 'manual' execution is NEVER clobbered (precedence);
 *   • SLEEP → sleep_duration + sleep_score, and the same night's nightly recharge
 *     → recovery + hrv + hr_resting.
 *
 * WRITE, do NOT run here (TCP egress is blocked; Alex runs the suite against a
 * branch with TEST_DATABASE_URL).
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

import { ingestPolar } from '@/lib/sync/ingest-polar';
import type {
  PolarReadClient,
  PolarExercise,
  PolarSleep,
  PolarNightlyRecharge,
} from '@/lib/polar/accesslink';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

const DB_TEST_TIMEOUT_MS = 30_000;

// A fake AccessLink client returning canned entities (or null).
function fakeClient(entities: {
  exercises?: Record<string, PolarExercise>;
  sleeps?: Record<string, PolarSleep>;
  recharges?: Record<string, PolarNightlyRecharge>;
}): PolarReadClient {
  return {
    getExercise: async (id) => entities.exercises?.[id] ?? null,
    getSleep: async (date) => entities.sleeps?.[date] ?? null,
    getNightlyRecharge: async (date) => entities.recharges?.[date] ?? null,
  };
}

// Today (UTC) — the day the assignment is scheduled for and the exercise starts.
const TODAY = new Date().toISOString().slice(0, 10);

function runningExercise(overrides?: Partial<PolarExercise>): PolarExercise {
  return {
    id: 'EX1',
    start_time: `${TODAY}T08:00:00`,
    start_time_utc_offset: 0,
    duration: 'PT25M', // 1500 s
    calories: 400,
    distance: 5000, // 5 km → pace 300 s/km
    heart_rate: { average: 150, maximum: 175 },
    sport: 'RUNNING',
    detailed_sport_info: 'RUNNING',
    ...overrides,
  };
}

describeWithDb('polar ingest — exercise + sleep (real DB)', () => {
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

  /** Fresh fixture whose written rows (executions/segments/streams) are cleaned. */
  async function setup(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    // Delete our writes BEFORE the fixture tears down coach/templates/athlete.
    cleanups.push(fx.cleanup);
    cleanups.push(async () => {
      await sql`delete from segment_executions where execution_id in (select id from workout_executions where athlete_id = ${fx.athleteId})`;
      await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
      await sql`delete from biometric_streams where athlete_id = ${fx.athleteId}`;
    });
    return fx;
  }

  test(
    'EXERCISE with same-day assignment → execution + done + hr stream + segment',
    async () => {
      const fx = await setup();
      const templateId = await makeTemplate({ fx, name: 'Run day' });
      const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: TODAY });

      const client = fakeClient({ exercises: { EX1: runningExercise() } });
      await ingestPolar(BigInt(fx.athleteId), { event: 'EXERCISE', entity_id: 'EX1' }, { sql, client });

      const exec = await sql<
        { assignment_id: string; source: string; ref: string; dur: number }[]
      >`
        select assignment_id::text as assignment_id, source, source_workout_ref as ref,
               total_duration_seconds as dur
        from workout_executions where athlete_id = ${fx.athleteId}
      `;
      expect(exec).toHaveLength(1);
      expect(exec[0]!.source).toBe('polar');
      expect(exec[0]!.ref).toBe('EX1');
      expect(Number(exec[0]!.assignment_id)).toBe(assignmentId);
      expect(exec[0]!.dur).toBe(1500);

      const status = await sql<{ status: string }[]>`
        select status from workout_assignments where id = ${assignmentId}
      `;
      expect(status[0]!.status).toBe('completed');

      const hr = await sql<{ v: string; unit: string; source: string }[]>`
        select value_numeric::text as v, unit, source::text as source
        from biometric_streams
        where athlete_id = ${fx.athleteId} and metric_type = 'hr'
      `;
      expect(hr).toHaveLength(1);
      expect(Number(hr[0]!.v)).toBe(150);
      expect(hr[0]!.source).toBe('polar');

      const seg = await sql<
        { modality: string; dist: string; pace_km: string; avg_hr: number; max_hr: number; source: string }[]
      >`
        select se.modality, se.distance_meters::text as dist,
               se.avg_pace_s_per_km::text as pace_km, se.avg_hr, se.max_hr, se.source
        from segment_executions se
        join workout_executions we on se.execution_id = we.id
        where we.athlete_id = ${fx.athleteId}
      `;
      expect(seg).toHaveLength(1);
      expect(seg[0]!.modality).toBe('run');
      expect(Number(seg[0]!.dist)).toBe(5000);
      expect(Number(seg[0]!.pace_km)).toBe(300);
      expect(seg[0]!.avg_hr).toBe(150);
      expect(seg[0]!.max_hr).toBe(175);
      expect(seg[0]!.source).toBe('polar');
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    're-delivery is idempotent — one execution, one hr, one segment',
    async () => {
      const fx = await setup();
      const templateId = await makeTemplate({ fx, name: 'Run day' });
      await makeAssignment({ fx, templateId, scheduledForIso: TODAY });

      const client = fakeClient({ exercises: { EX1: runningExercise() } });
      const payload = { event: 'EXERCISE', entity_id: 'EX1' };
      await ingestPolar(BigInt(fx.athleteId), payload, { sql, client });
      await ingestPolar(BigInt(fx.athleteId), payload, { sql, client });

      const counts = await sql<{ execs: number; hrs: number; segs: number }[]>`
        select
          (select count(*) from workout_executions where athlete_id = ${fx.athleteId})::int as execs,
          (select count(*) from biometric_streams where athlete_id = ${fx.athleteId} and metric_type = 'hr')::int as hrs,
          (select count(*) from segment_executions se join workout_executions we on se.execution_id = we.id where we.athlete_id = ${fx.athleteId})::int as segs
      `;
      expect(counts[0]).toEqual({ execs: 1, hrs: 1, segs: 1 });
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'EXERCISE with NO assignment that day → hr stream only, no execution',
    async () => {
      const fx = await setup();
      // Exercise dated a day with no assignment.
      const client = fakeClient({
        exercises: { EX1: runningExercise({ start_time: '2001-01-02T08:00:00' }) },
      });
      await ingestPolar(BigInt(fx.athleteId), { event: 'EXERCISE', entity_id: 'EX1' }, { sql, client });

      const execs = await sql<{ n: number }[]>`
        select count(*)::int as n from workout_executions where athlete_id = ${fx.athleteId}
      `;
      expect(execs[0]!.n).toBe(0);
      const hr = await sql<{ n: number }[]>`
        select count(*)::int as n from biometric_streams where athlete_id = ${fx.athleteId} and metric_type = 'hr'
      `;
      expect(hr[0]!.n).toBe(1);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'never clobbers a pre-existing manual execution (precedence)',
    async () => {
      const fx = await setup();
      const templateId = await makeTemplate({ fx, name: 'Run day' });
      const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: TODAY });
      // A manual execution EARLIER in the day (non-overlapping with the 08:00 Polar
      // window, so the time-dedupe guard doesn't fire — this isolates UPSERT precedence).
      await sql`
        insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source, source_workout_ref)
        values (${assignmentId}, ${fx.athleteId}, ${`${TODAY}T06:00:00Z`}, ${`${TODAY}T06:30:00Z`}, 1800, 'manual', null)
      `;

      const client = fakeClient({ exercises: { EX1: runningExercise() } });
      await ingestPolar(BigInt(fx.athleteId), { event: 'EXERCISE', entity_id: 'EX1' }, { sql, client });

      const exec = await sql<{ source: string; ref: string | null }[]>`
        select source, source_workout_ref as ref from workout_executions where assignment_id = ${assignmentId}
      `;
      expect(exec).toHaveLength(1);
      expect(exec[0]!.source).toBe('manual');
      expect(exec[0]!.ref).toBeNull();
      // No polar segment written onto the manual-owned execution.
      const segs = await sql<{ n: number }[]>`
        select count(*)::int as n from segment_executions se
        join workout_executions we on se.execution_id = we.id
        where we.athlete_id = ${fx.athleteId}
      `;
      expect(segs[0]!.n).toBe(0);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'SLEEP → sleep_duration + sleep_score, plus nightly recharge → recovery/hrv/hr_resting',
    async () => {
      const fx = await setup();
      const date = '2026-07-10';
      const client = fakeClient({
        sleeps: {
          [date]: {
            date,
            sleep_start_time: `${date}T23:30:00+02:00`,
            light_sleep: 10000,
            deep_sleep: 6000,
            rem_sleep: 5000,
            unrecognized_sleep_stage: 1000,
            sleep_score: 82,
          },
        },
        recharges: {
          [date]: {
            date,
            heart_rate_avg: 52,
            heart_rate_variability_avg: 68,
            nightly_recharge_status: 4,
          },
        },
      });

      await ingestPolar(BigInt(fx.athleteId), { event: 'SLEEP', date }, { sql, client });

      const rows = await sql<{ metric: string; v: string; unit: string; source: string }[]>`
        select metric_type::text as metric, value_numeric::text as v, unit, source::text as source
        from biometric_streams where athlete_id = ${fx.athleteId}
        order by metric_type
      `;
      const byMetric = Object.fromEntries(rows.map((r) => [r.metric, r]));
      expect(Number(byMetric['sleep_duration']!.v)).toBe(22000); // 10000+6000+5000+1000
      expect(Number(byMetric['sleep_score']!.v)).toBe(82);
      expect(Number(byMetric['recovery']!.v)).toBe(4);
      expect(Number(byMetric['hrv']!.v)).toBe(68);
      expect(Number(byMetric['hr_resting']!.v)).toBe(52);
      for (const r of rows) expect(r.source).toBe('polar');
    },
    DB_TEST_TIMEOUT_MS,
  );
});
