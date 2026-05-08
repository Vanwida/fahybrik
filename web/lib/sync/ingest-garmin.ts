// Garmin Health Activity API webhook ingest pipeline.
//
// Handles the union of summary types Garmin pushes:
//   * dailies         → biometric_streams (steps, hr_resting, calories, body_battery, stress)
//   * sleeps          → biometric_streams (sleep_duration, sleep_score) + sleep_stages payload
//   * activities      → workout_executions (preferred over HK if HK already filed) + biometric_streams (avg HR)
//   * activityDetails → segment_executions lap data when present
//   * stressDetails   → biometric_streams (stress)
//   * bodyComps       → biometric_streams (weight, body_fat)
//   * heartRateVariabilities → biometric_streams (hrv)
//   * userMetrics     → biometric_streams (vo2max)
//
// Authoritative source for workout_executions when both HK and Garmin arrive
// for the same workout: Garmin wins (higher lap fidelity per spec).
//
// Idempotency: every insert is guarded by an existence check on
// (athlete_id, source='garmin', external_id). external_id is summaryId or
// activityId, falling back to startTimeInSeconds when missing.

import type { Sql } from '@/lib/db';

export type GarminSummary = {
  userId?: string;
  userAccessToken?: string;
  summaryId?: string;
  activityId?: string | number;
  activityType?: string;
  startTimeInSeconds?: number;
  startTimeOffsetInSeconds?: number;
  durationInSeconds?: number;
  durationInMillis?: number;
  averageHeartRateInBeatsPerMinute?: number;
  maxHeartRateInBeatsPerMinute?: number;
  restingHeartRateInBeatsPerMinute?: number;
  activeKilocalories?: number;
  steps?: number;
  vo2Max?: number;
  bodyBatteryChargedValue?: number;
  bodyBatteryDrainedValue?: number;
  averageStressLevel?: number;
  weightInGrams?: number;
  bodyFatInPercent?: number;
  lastNightAvg?: number;        // HRV
  laps?: GarminLap[];
  // Sleep stages (Garmin returns durations in seconds per stage).
  deepSleepDurationInSeconds?: number;
  lightSleepDurationInSeconds?: number;
  remSleepInSeconds?: number;
  awakeDurationInSeconds?: number;
  sleepScoreValue?: number;
};

export type GarminLap = {
  startTimeInSeconds?: number;
  totalDistanceInMeters?: number;
  timerDurationInSeconds?: number;
  averageHeartRateInBeatsPerMinute?: number;
  maxHeartRateInBeatsPerMinute?: number;
};

export type GarminPayload = {
  dailies?: GarminSummary[];
  activities?: GarminSummary[];
  activityDetails?: GarminSummary[];
  sleeps?: GarminSummary[];
  stressDetails?: GarminSummary[];
  bodyComps?: GarminSummary[];
  heartRateVariabilities?: GarminSummary[];
  userMetrics?: GarminSummary[];
};

export type GarminIngestResult = {
  inserted_streams: number;
  inserted_activities: number;
  inserted_lap_segments: number;
  skipped_unknown_athlete: number;
  skipped_duplicate: number;
};

export async function ingestGarminPayload(args: {
  sql: Sql;
  payload: GarminPayload;
  resolveAthlete: (userAccessToken: string) => Promise<bigint | null>;
  rawBody: string;
}): Promise<GarminIngestResult> {
  const { sql, payload, resolveAthlete, rawBody } = args;
  const result: GarminIngestResult = {
    inserted_streams: 0,
    inserted_activities: 0,
    inserted_lap_segments: 0,
    skipped_unknown_athlete: 0,
    skipped_duplicate: 0,
  };

  const handle = async (s: GarminSummary, fn: (athlete_id: bigint) => Promise<void>) => {
    if (!s.userAccessToken) {
      result.skipped_unknown_athlete += 1;
      return;
    }
    const athlete_id = await resolveAthlete(s.userAccessToken);
    if (!athlete_id) {
      result.skipped_unknown_athlete += 1;
      return;
    }
    await fn(athlete_id);
  };

  for (const d of payload.dailies ?? []) {
    await handle(d, async (athlete_id) => {
      const ts = secondsToIso(d.startTimeInSeconds);
      if (!ts) return;
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'hr_resting', value: d.restingHeartRateInBeatsPerMinute, unit: 'bpm',
        externalId: d.summaryId, raw: rawBody,
      });
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'steps', value: d.steps, unit: 'count',
        externalId: d.summaryId, raw: rawBody,
      });
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'calories_active', value: d.activeKilocalories, unit: 'kcal',
        externalId: d.summaryId, raw: rawBody,
      });
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'body_battery', value: d.bodyBatteryChargedValue, unit: 'pct',
        externalId: d.summaryId, raw: rawBody,
      });
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'stress', value: d.averageStressLevel, unit: 'pct',
        externalId: d.summaryId, raw: rawBody,
      });
    });
  }

  for (const s of payload.sleeps ?? []) {
    await handle(s, async (athlete_id) => {
      const ts = secondsToIso(s.startTimeInSeconds);
      if (!ts) return;
      const dur = s.durationInMillis ? s.durationInMillis / 1000 : s.durationInSeconds;
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'sleep_duration', value: dur, unit: 'seconds',
        externalId: s.summaryId, raw: rawBody,
      });
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'sleep_score', value: s.sleepScoreValue, unit: 'pct',
        externalId: s.summaryId, raw: rawBody,
      });
    });
  }

  for (const h of payload.heartRateVariabilities ?? []) {
    await handle(h, async (athlete_id) => {
      const ts = secondsToIso(h.startTimeInSeconds);
      if (!ts) return;
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'hrv', value: h.lastNightAvg, unit: 'ms',
        externalId: h.summaryId, raw: rawBody,
      });
    });
  }

  for (const u of payload.userMetrics ?? []) {
    await handle(u, async (athlete_id) => {
      const ts = secondsToIso(u.startTimeInSeconds) ?? new Date().toISOString();
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'vo2max', value: u.vo2Max, unit: 'ml_kg_min',
        externalId: u.summaryId, raw: rawBody,
      });
    });
  }

  for (const b of payload.bodyComps ?? []) {
    await handle(b, async (athlete_id) => {
      const ts = secondsToIso(b.startTimeInSeconds);
      if (!ts) return;
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'weight',
        value: b.weightInGrams ? b.weightInGrams / 1000 : undefined, unit: 'kg',
        externalId: b.summaryId, raw: rawBody,
      });
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'body_fat', value: b.bodyFatInPercent, unit: 'pct',
        externalId: b.summaryId, raw: rawBody,
      });
    });
  }

  for (const st of payload.stressDetails ?? []) {
    await handle(st, async (athlete_id) => {
      const ts = secondsToIso(st.startTimeInSeconds);
      if (!ts) return;
      result.inserted_streams += await insertStream({
        sql, athlete_id, ts, metric: 'stress', value: st.averageStressLevel, unit: 'pct',
        externalId: st.summaryId, raw: rawBody,
      });
    });
  }

  // Activities: prefer Garmin over HK. Insert/update workout_executions
  // when an assignment exists for the day.
  const activities = [...(payload.activities ?? []), ...(payload.activityDetails ?? [])];
  for (const a of activities) {
    await handle(a, async (athlete_id) => {
      const externalId = String(a.activityId ?? a.summaryId ?? a.startTimeInSeconds ?? '');
      const ts = secondsToIso(a.startTimeInSeconds);
      if (!ts || !externalId) return;

      const inserted = await ingestGarminActivity({
        sql, athlete_id, summary: a, externalId, rawBody,
      });
      if (inserted.executionInserted) result.inserted_activities += 1;
      result.inserted_lap_segments += inserted.lapsInserted;
      result.inserted_streams += inserted.streamsInserted;
    });
  }

  return result;
}

async function ingestGarminActivity(args: {
  sql: Sql;
  athlete_id: bigint;
  summary: GarminSummary;
  externalId: string;
  rawBody: string;
}): Promise<{ executionInserted: boolean; lapsInserted: number; streamsInserted: number }> {
  const { sql, athlete_id, summary, externalId, rawBody } = args;
  const startedAt = secondsToIso(summary.startTimeInSeconds)!;
  const endedAt = summary.durationInSeconds
    ? new Date(((summary.startTimeInSeconds ?? 0) + summary.durationInSeconds) * 1000).toISOString()
    : startedAt;

  let streamsInserted = 0;
  streamsInserted += await insertStream({
    sql, athlete_id, ts: startedAt, metric: 'hr',
    value: summary.averageHeartRateInBeatsPerMinute, unit: 'bpm',
    externalId, raw: rawBody, source_workout_id: externalId,
  });

  // Try to map to an assignment for the day; create or override execution.
  const day = startedAt.slice(0, 10);
  const rows = await sql<{ id: string; existing_source: string | null; existing_ref: string | null }[]>`
    select wa.id::text as id,
           we.source::text as existing_source,
           we.source_workout_ref as existing_ref
    from workout_assignments wa
    left join workout_executions we on we.assignment_id = wa.id
    where wa.athlete_id = ${athlete_id as unknown as number}
      and wa.scheduled_for = ${day}::date
    order by wa.scheduled_for desc
    limit 1
  `;
  let executionInserted = false;
  let lapsInserted = 0;

  if (rows[0]) {
    // Idempotency: if Garmin already filed this exact externalId, skip.
    if (rows[0].existing_source === 'garmin' && rows[0].existing_ref === externalId) {
      return { executionInserted: false, lapsInserted: 0, streamsInserted };
    }
    await sql`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
        source, source_workout_ref
      ) values (
        ${rows[0].id}::bigint,
        ${athlete_id as unknown as number},
        ${startedAt},
        ${endedAt},
        ${summary.durationInSeconds ?? 0},
        'garmin',
        ${externalId}
      )
      on conflict (assignment_id) do update
        set started_at = excluded.started_at,
            ended_at = excluded.ended_at,
            total_duration_seconds = excluded.total_duration_seconds,
            source = excluded.source,
            source_workout_ref = excluded.source_workout_ref,
            updated_at = now()
    `;
    executionInserted = true;

    if (summary.laps && summary.laps.length > 0) {
      const exec = await sql<{ id: string }[]>`
        select id::text from workout_executions
        where assignment_id = ${rows[0].id}::bigint
        limit 1
      `;
      const exec_id = exec[0]?.id;
      if (exec_id) {
        // Wipe any existing laps for this execution before re-inserting from
        // Garmin. Garmin is the new source-of-truth for laps.
        await sql`
          delete from segment_executions where execution_id = ${exec_id}::bigint
        `;
        let pos = 0;
        for (const lap of summary.laps) {
          const lapStart = secondsToIso(lap.startTimeInSeconds) ?? startedAt;
          const lapEnd = lap.timerDurationInSeconds
            ? new Date(((lap.startTimeInSeconds ?? 0) + lap.timerDurationInSeconds) * 1000).toISOString()
            : lapStart;
          await sql`
            insert into segment_executions (
              execution_id, position, started_at, ended_at,
              distance_meters, avg_hr, max_hr, raw_lap_data_json
            ) values (
              ${exec_id}::bigint,
              ${pos},
              ${lapStart},
              ${lapEnd},
              ${lap.totalDistanceInMeters ?? null},
              ${lap.averageHeartRateInBeatsPerMinute ?? null},
              ${lap.maxHeartRateInBeatsPerMinute ?? null},
              ${JSON.stringify(lap)}::jsonb
            )
          `;
          pos += 1;
          lapsInserted += 1;
        }
      }
    }
  }

  return { executionInserted, lapsInserted, streamsInserted };
}

async function insertStream(args: {
  sql: Sql;
  athlete_id: bigint;
  ts: string;
  metric: string;
  value: number | null | undefined;
  unit: string;
  externalId: string | undefined;
  raw: string;
  source_workout_id?: string;
}): Promise<number> {
  const { sql, athlete_id, ts, metric, value, unit, externalId, raw } = args;
  if (value == null || !Number.isFinite(value)) return 0;
  const sourceWorkoutId = args.source_workout_id ?? externalId ?? null;

  if (sourceWorkoutId) {
    const dup = await sql<{ id: string }[]>`
      select id::text from biometric_streams
      where athlete_id = ${athlete_id as unknown as number}
        and source = 'garmin'
        and metric_type = ${metric}::biometric_metric
        and source_workout_id = ${sourceWorkoutId}
        and recorded_at = ${ts}
      limit 1
    `;
    if (dup.length > 0) return 0;
  } else {
    const dup = await sql<{ id: string }[]>`
      select id::text from biometric_streams
      where athlete_id = ${athlete_id as unknown as number}
        and source = 'garmin'
        and metric_type = ${metric}::biometric_metric
        and recorded_at = ${ts}
        and value_numeric = ${value}
      limit 1
    `;
    if (dup.length > 0) return 0;
  }

  await sql`
    insert into biometric_streams (
      athlete_id, source, source_workout_id, metric_type, recorded_at,
      value_numeric, unit, raw_payload_json
    ) values (
      ${athlete_id as unknown as number},
      'garmin',
      ${sourceWorkoutId},
      ${metric}::biometric_metric,
      ${ts},
      ${value},
      ${unit},
      ${raw}::jsonb
    )
  `;
  return 1;
}

function secondsToIso(seconds: number | undefined | null): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}
