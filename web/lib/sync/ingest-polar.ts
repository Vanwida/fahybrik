// Polar (AccessLink Dynamic API v4) ingest — persistence layer.
//
// Our Polar client is v4 (pull-only, no webhooks): the cron poller
// (lib/cron/polar-sync) fetches v4 entities, lib/polar/normalize maps them to the
// provider-neutral structs below, and THIS module writes them into the same
// tables ingest-garmin writes, with the SAME data-integrity guards. Precedence,
// day-matching and idempotency are deliberately identical to ingest-garmin.ts
// (read it side-by-side): 'garmin'/'manual' rows are authoritative and never
// clobbered; a passive Polar import never files a phantom second execution over a
// session already accounted for; re-running the poller is a no-op.
//
//   * session  → workout_executions (matched to the day's assignment) + one `hr`
//     stream (the session AVERAGE — same single-value fidelity Garmin stores) +
//     segment_executions: the REAL per-lap splits when v4 returned them (v4 laps
//     are first-class, unlike v3), else ONE whole-session segment so a Polar
//     run/erg still lands in the run-vs-row analytics.
//   * sleep    → sleep_duration + sleep_score.
//   * recharge → recovery (recoveryIndicator) + hrv (RMSSD).

import type { Sql } from '@/lib/db';
import { markAssignmentDoneFromDevice } from '@/lib/sync/assignment-status';
import { existsOverlappingExecution } from '@/lib/sync/execution-time-dedupe';
import { deriveLapIntensity } from '@/lib/garmin/lap-mapping';
import type { NormalizedSession, NormalizedSleep, NormalizedRecharge } from '@/lib/polar/normalize';

const POLAR_SOURCE = 'polar';

// ── training session ─────────────────────────────────────────────────────────

export async function ingestPolarSession(args: {
  sql: Sql;
  athlete_id: bigint;
  session: NormalizedSession;
}): Promise<void> {
  const { sql, athlete_id, session } = args;
  const { startedAt, endedAt, externalId, durationSeconds } = session;

  // Average HR as a single stream row (mirrors Garmin/HealthKit fidelity).
  await insertPolarStream({
    sql, athlete_id, ts: startedAt, metric: 'hr', value: session.avgHr, unit: 'bpm',
    sourceId: externalId, raw: session.raw,
  });

  // TIME-WINDOW DE-DUPE: any overlapping execution means the session is already
  // accounted for → no execution, no assignment flip (mirrors ingest-garmin).
  if (await existsOverlappingExecution(sql, athlete_id, startedAt, endedAt)) return;

  // Match the day's assignment; tiebreak id desc (identical to ingest-garmin).
  const day = startedAt.slice(0, 10);
  const rows = await sql<
    { id: string; existing_source: string | null; existing_ref: string | null }[]
  >`
    select wa.id::text as id,
           we.source::text as existing_source,
           we.source_workout_ref as existing_ref
    from workout_assignments wa
    left join workout_executions we on we.assignment_id = wa.id
    where wa.athlete_id = ${athlete_id as unknown as number}
      and wa.scheduled_for = ${day}::date
    order by wa.scheduled_for desc, wa.id desc
    limit 1
  `;
  const assign = rows[0];
  if (!assign) return; // no assignment that day → hr stream stored, no execution (like Garmin)

  // Exact re-delivery of THIS session → no-op.
  if (assign.existing_source === POLAR_SOURCE && assign.existing_ref === externalId) return;

  // UPSERT actuals. Precedence mirrors Garmin: never clobber 'garmin'/'manual';
  // fill over passive 'healthkit'; latest Polar wins over an earlier Polar row.
  await sql`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
      source, source_workout_ref, recorded_via
    ) values (
      ${assign.id}::bigint,
      ${athlete_id as unknown as number},
      ${startedAt},
      ${endedAt},
      ${durationSeconds},
      ${POLAR_SOURCE},
      ${externalId},
      -- HOW the record came to exist. This row exists because a session appeared
      -- in the athlete's Polar account and we pulled it: 'imported'. It is a
      -- DIFFERENT question from source above (WHAT apparatus measured it), and the
      -- two must never be conflated. A session the athlete actually ran inside
      -- FAHYBRID is written 'live' by recordWorkoutExecution and never reaches this
      -- insert: existsOverlappingExecution returns first.
      'imported'::execution_recording_method
    )
    on conflict (assignment_id) do update
      set started_at = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.started_at
            else excluded.started_at
          end,
          ended_at = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.ended_at
            else excluded.ended_at
          end,
          total_duration_seconds = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.total_duration_seconds
            else excluded.total_duration_seconds
          end,
          source = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.source
            else excluded.source
          end,
          source_workout_ref = case
            when workout_executions.source in ('garmin', 'manual') then workout_executions.source_workout_ref
            else excluded.source_workout_ref
          end,
          -- Existing wins: an ingest can only ADD what nobody knew. A session
          -- already stamped 'live' or 'manual' stays that way — a later device
          -- sync of the same session does not turn it into an import.
          recorded_via = coalesce(workout_executions.recorded_via, excluded.recorded_via),
          updated_at = now()
  `;

  await markAssignmentDoneFromDevice(sql, assign.id, athlete_id);

  // Segments only when WE own the execution now (never disturb a garmin/manual one).
  const owned = await sql<{ id: string; source: string | null }[]>`
    select id::text, source::text as source
    from workout_executions where assignment_id = ${assign.id}::bigint
    limit 1
  `;
  const exec = owned[0];
  if (exec && exec.source === POLAR_SOURCE) {
    await writeSegments({ sql, execId: exec.id, session });
  }
}

// Real per-lap splits when present; otherwise one honest whole-session segment.
// Delete-then-insert scoped to source='polar' keeps re-delivery clean.
async function writeSegments(args: {
  sql: Sql;
  execId: string;
  session: NormalizedSession;
}): Promise<void> {
  const { sql, execId, session } = args;

  const segments =
    session.segments.length > 0
      ? session.segments
      : session.modality
        ? [wholeSessionSegment(session)]
        : [];
  if (segments.length === 0) return;

  await sql`delete from segment_executions where execution_id = ${execId}::bigint and source = ${POLAR_SOURCE}`;
  for (const seg of segments) {
    const intensity = deriveLapIntensity({
      modality: seg.modality,
      distance_meters: seg.distanceMeters,
      duration_seconds: seg.durationSeconds,
      power_w: seg.powerW,
      // deriveLapIntensity gates by modality: stroke_rate only for erg, run_cadence
      // only for run — so passing the single v4 cadence to both slots is safe.
      stroke_rate_spm: seg.cadenceRpm,
      run_cadence_spm: seg.cadenceRpm,
    });
    await sql`
      insert into segment_executions (
        execution_id, position, started_at, ended_at,
        distance_meters, avg_hr, max_hr,
        modality, avg_pace_s_per_km, avg_pace_s_per_500m,
        avg_power_w, stroke_rate_spm, run_cadence_spm, source,
        raw_lap_data_json
      ) values (
        ${execId}::bigint, ${seg.position}, ${seg.startedAt}, ${seg.endedAt},
        ${seg.distanceMeters}, ${seg.avgHr}, ${seg.maxHr},
        ${seg.modality}, ${intensity.avg_pace_s_per_km}, ${intensity.avg_pace_s_per_500m},
        ${intensity.avg_power_w}, ${intensity.stroke_rate_spm}, ${intensity.run_cadence_spm},
        ${POLAR_SOURCE},
        ${JSON.stringify(seg.raw)}::jsonb
      )
    `;
  }
}

function wholeSessionSegment(session: NormalizedSession): NormalizedSession['segments'][number] {
  return {
    position: 0,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    distanceMeters: session.distanceMeters,
    durationSeconds: session.durationSeconds,
    avgHr: session.avgHr,
    maxHr: session.maxHr,
    modality: session.modality,
    powerW: null,
    cadenceRpm: null,
    raw: session.raw,
  };
}

// ── sleep + nightly recharge ─────────────────────────────────────────────────

export async function ingestPolarSleep(args: {
  sql: Sql;
  athlete_id: bigint;
  sleep: NormalizedSleep;
}): Promise<void> {
  const { sql, athlete_id, sleep } = args;
  const sourceId = `sleep:${sleep.date}`;
  await insertPolarStream({
    sql, athlete_id, ts: sleep.recordedAt, metric: 'sleep_duration',
    value: sleep.totalSleepSeconds, unit: 'seconds', sourceId, raw: sleep.raw,
  });
  await insertPolarStream({
    sql, athlete_id, ts: sleep.recordedAt, metric: 'sleep_score',
    value: sleep.sleepScore, unit: 'score', sourceId, raw: sleep.raw,
  });
}

export async function ingestPolarRecharge(args: {
  sql: Sql;
  athlete_id: bigint;
  recharge: NormalizedRecharge;
}): Promise<void> {
  const { sql, athlete_id, recharge } = args;
  const sourceId = `recharge:${recharge.date}`;
  await insertPolarStream({
    sql, athlete_id, ts: recharge.recordedAt, metric: 'recovery',
    value: recharge.recovery, unit: 'score', sourceId, raw: recharge.raw,
  });
  await insertPolarStream({
    sql, athlete_id, ts: recharge.recordedAt, metric: 'hrv',
    value: recharge.hrvMs, unit: 'ms', sourceId, raw: recharge.raw,
  });
}

// ── biometric_streams insert (source='polar') ───────────────────────────────
// Mirrors ingest-garmin insertStream: app-level dedupe (no unique index) keyed on
// the stable source id + recorded_at.
async function insertPolarStream(args: {
  sql: Sql;
  athlete_id: bigint;
  ts: string;
  metric: string;
  value: number | null | undefined;
  unit: string;
  sourceId: string;
  raw: unknown;
}): Promise<void> {
  const { sql, athlete_id, ts, metric, value, unit, sourceId, raw } = args;
  if (value == null || !Number.isFinite(value)) return;

  const dup = await sql<{ id: string }[]>`
    select id::text from biometric_streams
    where athlete_id = ${athlete_id as unknown as number}
      and source = ${POLAR_SOURCE}
      and metric_type = ${metric}::biometric_metric
      and source_workout_id = ${sourceId}
      and recorded_at = ${ts}
    limit 1
  `;
  if (dup.length > 0) return;

  await sql`
    insert into biometric_streams (
      athlete_id, source, source_workout_id, metric_type, recorded_at,
      value_numeric, unit, raw_payload_json
    ) values (
      ${athlete_id as unknown as number},
      ${POLAR_SOURCE},
      ${sourceId},
      ${metric}::biometric_metric,
      ${ts},
      ${value},
      ${unit},
      ${JSON.stringify(raw)}::jsonb
    )
  `;
}
