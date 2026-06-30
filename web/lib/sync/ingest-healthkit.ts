// HealthKit ingest pipeline.
//
// Inputs come from POST /api/sync/healthkit, validated by hkSyncBatchSchema.
// Output: rows in biometric_streams + (when a workout maps to an assignment)
// a workout_executions row.
//
// Dedupe key for samples:
//   (athlete_id, source='healthkit', metric_type, recorded_at, value_numeric)
// Dedupe key for workouts:
//   (athlete_id, source='healthkit', source_workout_id, started_at±5min)
// We rely on application-level dedupe (no unique index) because Garmin can
// produce a workout for the *same* underlying HKWorkout with a different
// source_workout_id — application dedupe is the only place that can compare
// across sources.

import type { Sql } from '@/lib/db';
import { markAssignmentDoneFromDevice } from './assignment-status';
import { canonicalizeHealthkitMetric } from './metric-map';
import type { HKBiometricSampleDTO, HKSyncBatch, HKWorkoutDTO } from './schema';

export type HealthkitIngestResult = {
  workouts_received: number;
  workouts_inserted: number;
  workouts_skipped_duplicate: number;
  samples_received: number;
  samples_inserted: number;
  samples_skipped_unknown_metric: number;
  samples_skipped_duplicate: number;
  executions_linked: number;
};

const FIVE_MIN_MS = 5 * 60 * 1000;

export async function ingestHealthkitBatch(args: {
  sql: Sql;
  athlete_id: bigint;
  batch: HKSyncBatch;
}): Promise<HealthkitIngestResult> {
  const { sql, athlete_id, batch } = args;
  const result: HealthkitIngestResult = {
    workouts_received: batch.workouts.length,
    workouts_inserted: 0,
    workouts_skipped_duplicate: 0,
    samples_received: batch.samples.length,
    samples_inserted: 0,
    samples_skipped_unknown_metric: 0,
    samples_skipped_duplicate: 0,
    executions_linked: 0,
  };

  for (const w of batch.workouts) {
    const inserted = await ingestWorkout({ sql, athlete_id, workout: w });
    if (inserted.duplicate) result.workouts_skipped_duplicate += 1;
    else result.workouts_inserted += 1;
    if (inserted.linked_execution) result.executions_linked += 1;
  }

  for (const s of batch.samples) {
    const outcome = await ingestSample({ sql, athlete_id, sample: s });
    if (outcome === 'inserted') result.samples_inserted += 1;
    else if (outcome === 'duplicate') result.samples_skipped_duplicate += 1;
    else result.samples_skipped_unknown_metric += 1;
  }

  return result;
}

async function ingestWorkout(args: {
  sql: Sql;
  athlete_id: bigint;
  workout: HKWorkoutDTO;
}): Promise<{ duplicate: boolean; linked_execution: boolean }> {
  const { sql, athlete_id, workout } = args;

  const existing = await sql<{ id: string }[]>`
    select id::text from biometric_streams
    where athlete_id = ${athlete_id as unknown as number}
      and source = 'healthkit'
      and source_workout_id = ${workout.source_workout_id}
      and recorded_at between
        ${new Date(new Date(workout.started_at).getTime() - FIVE_MIN_MS).toISOString()}
        and ${new Date(new Date(workout.started_at).getTime() + FIVE_MIN_MS).toISOString()}
    limit 1
  `;
  if (existing.length > 0) {
    return { duplicate: true, linked_execution: false };
  }

  // Persist a "training_load" marker row carrying the full payload as raw
  // payload — gives downstream consumers a single biometric_streams row to
  // anchor the workout summary to.
  if (Number.isFinite(workout.duration_seconds)) {
    await sql`
      insert into biometric_streams (
        athlete_id, source, source_workout_id, metric_type, recorded_at,
        value_numeric, unit, raw_payload_json
      ) values (
        ${athlete_id as unknown as number},
        'healthkit',
        ${workout.source_workout_id},
        'training_load'::biometric_metric,
        ${workout.started_at},
        ${workout.duration_seconds},
        'seconds',
        ${JSON.stringify(workout)}::jsonb
      )
    `;
  }

  if (Number.isFinite(workout.avg_heart_rate_bpm) && workout.avg_heart_rate_bpm != null) {
    await sql`
      insert into biometric_streams (
        athlete_id, source, source_workout_id, metric_type, recorded_at,
        value_numeric, unit, raw_payload_json
      ) values (
        ${athlete_id as unknown as number},
        'healthkit',
        ${workout.source_workout_id},
        'hr'::biometric_metric,
        ${workout.started_at},
        ${workout.avg_heart_rate_bpm},
        'bpm',
        null
      )
    `;
  }

  if (Number.isFinite(workout.total_energy_burned_kcal) && workout.total_energy_burned_kcal != null) {
    await sql`
      insert into biometric_streams (
        athlete_id, source, source_workout_id, metric_type, recorded_at,
        value_numeric, unit, raw_payload_json
      ) values (
        ${athlete_id as unknown as number},
        'healthkit',
        ${workout.source_workout_id},
        'calories_active'::biometric_metric,
        ${workout.started_at},
        ${workout.total_energy_burned_kcal},
        'kcal',
        null
      )
    `;
  }

  // Try to link to a workout_executions row by nearest scheduled assignment
  // within ±12h on the workout day. We never create the execution from
  // scratch here — only fill in actuals if an assignment exists.
  const linked = await linkExecution({ sql, athlete_id, workout });

  return { duplicate: false, linked_execution: linked };
}

async function linkExecution(args: {
  sql: Sql;
  athlete_id: bigint;
  workout: HKWorkoutDTO;
}): Promise<boolean> {
  const { sql, athlete_id, workout } = args;
  const startedAt = workout.started_at;
  const endedAt = workout.ended_at;
  // Find the most recent assignment scheduled for the workout's local day
  // (we accept the workout's date directly; timezone normalization happens
  // upstream).
  const day = startedAt.slice(0, 10);
  const rows = await sql<{ id: string; existing_source: string | null }[]>`
    select wa.id::text as id,
           we.source::text as existing_source
    from workout_assignments wa
    left join workout_executions we on we.assignment_id = wa.id
    where wa.athlete_id = ${athlete_id as unknown as number}
      and wa.scheduled_for = ${day}::date
    order by wa.scheduled_for desc
    limit 1
  `;
  const assign = rows[0];
  if (!assign) return false;

  // Skip if a Garmin-sourced execution already exists — Garmin wins (better
  // lap precision per spec).
  if (assign.existing_source === 'garmin') return true;

  await sql`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
      source, source_workout_ref
    ) values (
      ${assign.id}::bigint,
      ${athlete_id as unknown as number},
      ${startedAt},
      ${endedAt},
      ${Math.round(workout.duration_seconds)},
      'healthkit',
      ${workout.source_workout_id}
    )
    on conflict (assignment_id) do update
      set started_at = case
            when workout_executions.source = 'garmin' then workout_executions.started_at
            else excluded.started_at
          end,
          ended_at = case
            when workout_executions.source = 'garmin' then workout_executions.ended_at
            else excluded.ended_at
          end,
          total_duration_seconds = case
            when workout_executions.source = 'garmin' then workout_executions.total_duration_seconds
            else excluded.total_duration_seconds
          end,
          source = case
            when workout_executions.source = 'garmin' then workout_executions.source
            else excluded.source
          end,
          source_workout_ref = case
            when workout_executions.source = 'garmin' then workout_executions.source_workout_ref
            else excluded.source_workout_ref
          end,
          updated_at = now()
  `;

  // Close the loop: a synced HealthKit workout proves the session was done, so
  // promote a still-'scheduled' assignment to 'completed'. Never clobbers an
  // explicit manual 'partial'/'completed' or a coach 'skipped'/'missed' (the
  // helper guards on status='scheduled'). This is the fix for the "done workout
  // still shows Empezar" bug — the insert above filed actuals but left status.
  await markAssignmentDoneFromDevice(sql, assign.id, athlete_id);
  return true;
}

async function ingestSample(args: {
  sql: Sql;
  athlete_id: bigint;
  sample: HKBiometricSampleDTO;
}): Promise<'inserted' | 'duplicate' | 'unknown_metric'> {
  const { sql, athlete_id, sample } = args;
  const canonical = canonicalizeHealthkitMetric(sample.metric_type);
  if (!canonical) return 'unknown_metric';

  const dup = await sql<{ id: string }[]>`
    select id::text from biometric_streams
    where athlete_id = ${athlete_id as unknown as number}
      and source = 'healthkit'
      and metric_type = ${canonical}::biometric_metric
      and recorded_at = ${sample.recorded_at}
      and value_numeric = ${sample.value_numeric}
    limit 1
  `;
  if (dup.length > 0) return 'duplicate';

  await sql`
    insert into biometric_streams (
      athlete_id, source, source_workout_id, metric_type, recorded_at,
      value_numeric, unit, raw_payload_json
    ) values (
      ${athlete_id as unknown as number},
      'healthkit',
      ${sample.source_workout_id ?? null},
      ${canonical}::biometric_metric,
      ${sample.recorded_at},
      ${sample.value_numeric},
      ${sample.unit || ''},
      null
    )
  `;
  return 'inserted';
}
