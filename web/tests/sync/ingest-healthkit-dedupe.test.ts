/**
 * Real-DB integration tests for the HealthKit ingest DE-DUPE / anti-double-count
 * guards in `lib/sync/ingest-healthkit.ts`.
 *
 * Context (the bug these pin): `workout_executions` is unique on
 * `(assignment_id)`, so re-submitting the SAME assignment is safe. But the
 * HealthKit ingest historically deduped ONLY by `source_workout_ref` (the
 * incoming HKWorkout UUID). A session logged manually / phone-only carries
 * `source_workout_ref = NULL`; if the athlete ALSO tracked it on a native Apple
 * Watch / Strava / Garmin, that HKWorkout syncs under a DIFFERENT UUID, misses
 * the ref guard, and on a day with ≥2 assignments could land on a DIFFERENT
 * assignment → a PHANTOM second execution + a wrongly-completed assignment →
 * inflated 7-day volume. Separately, an `on conflict do update` that only
 * preserved `source='garmin'` rows would let a passive HK import OVERWRITE an
 * honest `source='manual'` log's actuals.
 *
 * These tests exercise the real upsert against a Neon test branch (nothing is
 * mocked — project rule). Each test seeds its own coach/athlete/assignments and
 * tears them down via `Fixture.cleanup()` (executions cascade from the
 * assignment delete; biometric_streams cascade from the athlete delete). Skips
 * loudly without TEST_DATABASE_URL.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { ingestHealthkitBatch } from '@/lib/sync/ingest-healthkit';
import { healthkitSyncRequestSchema, type HKSyncBatch } from '@/lib/sync/schema';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

// Build a single-workout, no-samples HK batch through the real wire schema so
// the shape is identical to what the API route hands the ingest.
function buildBatch(w: {
  source_workout_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
}): HKSyncBatch {
  const parsed = healthkitSyncRequestSchema.safeParse({
    batch: {
      athlete_id: '0',
      sent_at: w.started_at,
      workouts: [
        {
          source_workout_id: w.source_workout_id,
          workout_activity_type: 37,
          started_at: w.started_at,
          ended_at: w.ended_at,
          duration_seconds: w.duration_seconds,
          total_energy_burned_kcal: 400,
          total_distance_meters: 8000,
          avg_heart_rate_bpm: 160,
          max_heart_rate_bpm: 180,
          lap_markers: [],
          source: 'healthkit',
        },
      ],
      samples: [],
    },
  });
  if (!parsed.success) throw new Error('fixture HK batch failed schema');
  return parsed.data.batch;
}

describeWithDb('ingestHealthkitBatch — de-dupe / anti-double-count (real DB)', () => {
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

  async function seed(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    return fx;
  }

  // Insert a workout_executions row directly (simulates a prior manual / wearable
  // save). Returns nothing — callers key on the assignment.
  async function insertExecution(
    fx: Fixture,
    assignmentId: number,
    e: {
      source: 'manual' | 'healthkit' | 'garmin';
      started_at: string;
      ended_at: string | null;
      total_duration_seconds: number | null;
      source_workout_ref: string | null;
    },
  ): Promise<void> {
    await fx.sql`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
        source, source_workout_ref
      ) values (
        ${assignmentId}, ${fx.athleteId},
        ${e.started_at}::timestamptz,
        ${e.ended_at}::timestamptz,
        ${e.total_duration_seconds},
        ${e.source}::biometric_source,
        ${e.source_workout_ref}
      )
    `;
  }

  async function executionCount(fx: Fixture): Promise<number> {
    const [row] = await fx.sql<Array<{ n: number }>>`
      select count(*)::int as n from workout_executions where athlete_id = ${fx.athleteId}
    `;
    return row!.n;
  }

  // (a) CORE: a ref-less manual execution on assignment A + an incoming ref-less
  // HKWorkout overlapping in time, on a day with a SECOND assignment B, must NOT
  // create a phantom execution on B, must NOT flip B to completed, and 7-day
  // volume must stay 1.
  test('ref-less overlapping HKWorkout does not phantom-count against a 2nd same-day assignment', async () => {
    const fx = await seed();
    const day = '2026-04-06';
    const tplA = await makeTemplate({ fx, name: 'am-session' });
    const tplB = await makeTemplate({ fx, name: 'pm-session' });
    const aId = await makeAssignment({ fx, templateId: tplA, scheduledForIso: day, status: 'completed' });
    // B is inserted AFTER A → higher id → the deterministic day-pick
    // (scheduled_for desc, id desc) targets B, which has no execution. Without
    // the time-overlap guard the ingest would file a phantom execution on B.
    const bId = await makeAssignment({ fx, templateId: tplB, scheduledForIso: day, status: 'scheduled' });

    // Honest human log on A, ref-less, morning window.
    await insertExecution(fx, aId, {
      source: 'manual',
      started_at: `${day}T06:00:00.000Z`,
      ended_at: `${day}T06:45:00.000Z`,
      total_duration_seconds: 2700,
      source_workout_ref: null,
    });

    // The same session, tracked passively on the Watch → a DISTINCT UUID whose
    // window overlaps the manual log.
    const batch = buildBatch({
      source_workout_id: 'wk-watch-overlap',
      started_at: `${day}T06:05:00.000Z`,
      ended_at: `${day}T06:50:00.000Z`,
      duration_seconds: 2700,
    });
    const res = await ingestHealthkitBatch({ sql, athlete_id: BigInt(fx.athleteId), batch });

    // No link happened (already accounted for by the overlapping manual row).
    expect(res.executions_linked).toBe(0);

    // Exactly ONE execution for the athlete — no phantom on B.
    expect(await executionCount(fx)).toBe(1);

    // That execution is still the manual one on A.
    const [only] = await sql<Array<{ assignment_id: string; source: string | null }>>`
      select assignment_id::text as assignment_id, source::text as source
      from workout_executions where athlete_id = ${fx.athleteId}
    `;
    expect(Number(only!.assignment_id)).toBe(aId);
    expect(only!.source).toBe('manual');

    // B was NOT flipped to completed.
    const [b] = await sql<Array<{ status: string }>>`
      select status::text as status from workout_assignments where id = ${bId}
    `;
    expect(b!.status).toBe('scheduled');

    // 7-day volume (executions in the trailing week of the workout day) stays 1.
    const [vol] = await sql<Array<{ n: number }>>`
      select count(*)::int as n from workout_executions
      where athlete_id = ${fx.athleteId}
        and started_at >= ${`${day}T00:00:00.000Z`}::timestamptz - interval '7 days'
        and started_at <  ${`${day}T00:00:00.000Z`}::timestamptz + interval '1 day'
    `;
    expect(vol!.n).toBe(1);
  });

  // (b) An HKWorkout that DOES match by source_workout_ref (the same workout
  // re-synced) is still deduped — unchanged behavior. First sync links; second
  // sync of the identical workout is a no-op.
  test('re-synced identical HKWorkout (source_workout_ref match) is deduped', async () => {
    const fx = await seed();
    const day = '2026-04-08';
    const tpl = await makeTemplate({ fx, name: 'sess' });
    const aId = await makeAssignment({ fx, templateId: tpl, scheduledForIso: day, status: 'scheduled' });

    const batch = buildBatch({
      source_workout_id: 'wk-known-ref',
      started_at: `${day}T07:00:00.000Z`,
      ended_at: `${day}T07:40:00.000Z`,
      duration_seconds: 2400,
    });

    const r1 = await ingestHealthkitBatch({ sql, athlete_id: BigInt(fx.athleteId), batch });
    expect(r1.workouts_inserted).toBe(1);
    expect(r1.workouts_skipped_duplicate).toBe(0);
    expect(r1.executions_linked).toBe(1);

    // First sync linked + flipped A to completed.
    expect(await executionCount(fx)).toBe(1);
    const [a1] = await sql<Array<{ status: string }>>`
      select status::text as status from workout_assignments where id = ${aId}
    `;
    expect(a1!.status).toBe('completed');

    // Re-send the SAME workout → the source_workout_id/ref guard short-circuits.
    const r2 = await ingestHealthkitBatch({ sql, athlete_id: BigInt(fx.athleteId), batch });
    expect(r2.workouts_skipped_duplicate).toBe(1);
    expect(r2.workouts_inserted).toBe(0);
    expect(r2.executions_linked).toBe(0);

    // Still exactly one execution and one training_load marker — no duplicates.
    expect(await executionCount(fx)).toBe(1);
    const [marker] = await sql<Array<{ n: number }>>`
      select count(*)::int as n from biometric_streams
      where athlete_id = ${fx.athleteId}
        and source = 'healthkit'
        and metric_type = 'training_load'::biometric_metric
        and source_workout_id = 'wk-known-ref'
    `;
    expect(marker!.n).toBe(1);
  });

  // (c) ON-CONFLICT: a passive HKWorkout that lands on an assignment already
  // carrying a source='manual' execution must PRESERVE the manual actuals — a
  // human entry is never silently overwritten by a device import. (Times are
  // NON-overlapping here so the time-window guard doesn't fire, forcing the
  // insert to reach the on-conflict branch.)
  test('on-conflict preserves an existing source=manual execution (no overwrite)', async () => {
    const fx = await seed();
    const day = '2026-04-10';
    const tpl = await makeTemplate({ fx, name: 'sess' });
    const aId = await makeAssignment({ fx, templateId: tpl, scheduledForIso: day, status: 'completed' });

    // Manual log in the morning.
    await insertExecution(fx, aId, {
      source: 'manual',
      started_at: `${day}T06:00:00.000Z`,
      ended_at: `${day}T06:45:00.000Z`,
      total_duration_seconds: 2700,
      source_workout_ref: null,
    });

    // Evening HKWorkout (does NOT overlap the morning manual log) on the same
    // day → the day-pick resolves to A → on-conflict fires on A.
    const batch = buildBatch({
      source_workout_id: 'wk-evening',
      started_at: `${day}T18:00:00.000Z`,
      ended_at: `${day}T18:40:00.000Z`,
      duration_seconds: 2400,
    });
    await ingestHealthkitBatch({ sql, athlete_id: BigInt(fx.athleteId), batch });

    // Still exactly one execution — no phantom, and the manual actuals stand.
    expect(await executionCount(fx)).toBe(1);
    const [row] = await sql<
      Array<{
        assignment_id: string;
        source: string | null;
        source_workout_ref: string | null;
        total_duration_seconds: number | null;
        start_hour: number;
      }>
    >`
      select assignment_id::text as assignment_id,
             source::text as source,
             source_workout_ref,
             total_duration_seconds,
             extract(hour from started_at at time zone 'UTC')::int as start_hour
      from workout_executions where athlete_id = ${fx.athleteId}
    `;
    expect(Number(row!.assignment_id)).toBe(aId);
    expect(row!.source).toBe('manual'); // NOT overwritten to 'healthkit'
    expect(row!.source_workout_ref).toBeNull(); // manual ref preserved
    expect(Number(row!.total_duration_seconds)).toBe(2700); // NOT the HK 2400
    expect(row!.start_hour).toBe(6); // morning start preserved, not 18:00
  });
});
