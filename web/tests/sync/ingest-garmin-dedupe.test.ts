/**
 * Real-DB integration tests for the Garmin ingest DE-DUPE / anti-double-count
 * guards in `lib/sync/ingest-garmin.ts` — the Garmin twin of
 * `ingest-healthkit-dedupe.test.ts`.
 *
 * Context (the bug these pin): `workout_executions` is unique on
 * `(assignment_id)`, so re-submitting the SAME assignment is safe. But the
 * Garmin ingest historically had no time-overlap guard and picked the day's
 * assignment with a NON-deterministic `order by wa.scheduled_for desc` (no
 * tiebreak). A session logged manually / phone-only carries
 * `source_workout_ref = NULL`; if the athlete ALSO tracked it on a Garmin
 * device, that activity syncs under a DIFFERENT external id, misses any ref
 * guard, and on a day with >=2 assignments could land on a DIFFERENT
 * assignment -> a PHANTOM second execution + a wrongly-completed assignment ->
 * inflated 7-day volume. Separately, the `on conflict do update` blindly
 * overwrote whatever execution was on the assignment — so a passive Garmin
 * import could OVERWRITE an honest `source='manual'` log's actuals.
 *
 * These tests exercise the real upsert against a Neon test branch (nothing is
 * mocked — project rule). Each test seeds its own coach/athlete/assignments and
 * tears them down via `Fixture.cleanup()` (executions cascade from the
 * assignment delete; biometric_streams cascade from the athlete delete). Skips
 * loudly without TEST_DATABASE_URL.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { ingestGarminPayload, type GarminPayload } from '@/lib/sync/ingest-garmin';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

const ISO = (day: string, hhmmss: string) => `${day}T${hhmmss}.000Z`;
const toUnixSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

// Build a single-activity Garmin payload through the same shape the webhook
// route hands the ingest.
function buildActivityPayload(a: {
  token: string;
  activityId: string;
  startedAtIso: string;
  durationSeconds: number;
}): GarminPayload {
  return {
    activities: [
      {
        userAccessToken: a.token,
        activityId: a.activityId,
        summaryId: a.activityId,
        activityType: 'RUNNING',
        startTimeInSeconds: toUnixSeconds(a.startedAtIso),
        durationInSeconds: a.durationSeconds,
        averageHeartRateInBeatsPerMinute: 150,
      },
    ],
  };
}

describeWithDb('ingestGarminPayload — de-dupe / anti-double-count (real DB)', () => {
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

  // Insert a workout_executions row directly (simulates a prior manual save).
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

  // Resolve the fixture's athlete from the fake access token; anything else is
  // an unknown athlete (skipped by the ingest).
  function resolveAthleteFor(fx: Fixture, token: string) {
    return async (t: string) => (t === token ? BigInt(fx.athleteId) : null);
  }

  // (a) CORE: a ref-less manual execution on assignment A + an incoming Garmin
  // activity overlapping in time, on a day with a SECOND assignment B, must NOT
  // create a phantom execution on B, must NOT flip B to completed, and 7-day
  // volume must stay 1.
  test('overlapping Garmin activity does not phantom-count against a 2nd same-day assignment', async () => {
    const fx = await seed();
    const day = '2026-04-06';
    const token = `tok-${fx.athleteId}-a`;
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
      started_at: ISO(day, '06:00:00'),
      ended_at: ISO(day, '06:45:00'),
      total_duration_seconds: 2700,
      source_workout_ref: null,
    });

    // The same session, tracked on the Garmin device → a DISTINCT external id
    // whose window overlaps the manual log (06:05 → 06:50).
    const payload = buildActivityPayload({
      token,
      activityId: 'garmin-overlap-1',
      startedAtIso: ISO(day, '06:05:00'),
      durationSeconds: 2700,
    });
    const res = await ingestGarminPayload({
      sql,
      payload,
      resolveAthlete: resolveAthleteFor(fx, token),
      rawBody: JSON.stringify(payload),
    });

    // No execution filed (already accounted for by the overlapping manual row).
    expect(res.inserted_activities).toBe(0);

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
        and started_at >= ${ISO(day, '00:00:00')}::timestamptz - interval '7 days'
        and started_at <  ${ISO(day, '00:00:00')}::timestamptz + interval '1 day'
    `;
    expect(vol!.n).toBe(1);
  });

  // (b) ON-CONFLICT: a passive Garmin activity that lands on an assignment
  // already carrying a source='manual' execution must PRESERVE the manual
  // actuals — a human entry is never silently overwritten by a device import.
  // (Times are NON-overlapping here so the time-window guard doesn't fire,
  // forcing the insert to reach the on-conflict branch.)
  test('on-conflict preserves an existing source=manual execution (no overwrite)', async () => {
    const fx = await seed();
    const day = '2026-04-10';
    const token = `tok-${fx.athleteId}-b`;
    const tpl = await makeTemplate({ fx, name: 'sess' });
    const aId = await makeAssignment({ fx, templateId: tpl, scheduledForIso: day, status: 'completed' });

    // Manual log in the morning.
    await insertExecution(fx, aId, {
      source: 'manual',
      started_at: ISO(day, '06:00:00'),
      ended_at: ISO(day, '06:45:00'),
      total_duration_seconds: 2700,
      source_workout_ref: null,
    });

    // Evening Garmin activity (does NOT overlap the morning manual log) on the
    // same day → the (single-assignment) day-pick resolves to A → on-conflict
    // fires on A and must preserve the manual row.
    const payload = buildActivityPayload({
      token,
      activityId: 'garmin-evening-1',
      startedAtIso: ISO(day, '18:00:00'),
      durationSeconds: 2400,
    });
    await ingestGarminPayload({
      sql,
      payload,
      resolveAthlete: resolveAthleteFor(fx, token),
      rawBody: JSON.stringify(payload),
    });

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
    expect(row!.source).toBe('manual'); // NOT overwritten to 'garmin'
    expect(row!.source_workout_ref).toBeNull(); // manual ref preserved
    expect(Number(row!.total_duration_seconds)).toBe(2700); // NOT the Garmin 2400
    expect(row!.start_hour).toBe(6); // morning start preserved, not 18:00
  });
});
