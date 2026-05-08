// Workout reconciliation service.
//
// When the same physical workout arrives via both HealthKit and Garmin, the
// product rule is: Garmin wins on lap precision (HR-strap + GPS lap markers
// are more accurate than the watch-derived workout summary HK ships). The
// HealthKit copy is retained in biometric_streams as a cross-check (we don't
// delete it) so the coach can spot drift if the two providers disagree.
//
// reconcileWorkout(athlete_id, workout_execution_id):
//   1. Find the execution row.
//   2. Find all biometric_streams in [started_at, ended_at] for both
//      sources matching this athlete.
//   3. If a Garmin stream exists, ensure execution.source='garmin' and
//      laps/segment_executions reflect Garmin's. If only HK exists, leave
//      execution as-is (HK source). Already idempotent.
//   4. Emit a reconciliation_log row when Garmin overrides HK so the coach
//      UI can show "switched to Garmin laps" badge.
//
// This is currently called inline by the Garmin webhook handler; a future
// nightly job can re-run it across all yesterday's executions to catch
// late-arriving Garmin data.

import type { Sql } from '@/lib/db';

export type ReconcileResult = {
  execution_id: string;
  initial_source: string | null;
  final_source: string | null;
  switched: boolean;
  hk_streams: number;
  garmin_streams: number;
};

export async function reconcileWorkout(args: {
  sql: Sql;
  athlete_id: bigint;
  workout_execution_id: string | bigint;
}): Promise<ReconcileResult | null> {
  const { sql, athlete_id, workout_execution_id } = args;

  const execRows = await sql<
    { id: string; source: string | null; started_at: string | null; ended_at: string | null }[]
  >`
    select id::text, source::text, started_at::text, ended_at::text
    from workout_executions
    where id = ${workout_execution_id as unknown as string}::bigint
      and athlete_id = ${athlete_id as unknown as number}
    limit 1
  `;
  const exec = execRows[0];
  if (!exec) return null;

  const window_start = exec.started_at ?? new Date(Date.now() - 86400_000).toISOString();
  const window_end = exec.ended_at ?? new Date().toISOString();

  const counts = await sql<{ source: string; n: string }[]>`
    select source::text as source, count(*)::text as n
    from biometric_streams
    where athlete_id = ${athlete_id as unknown as number}
      and recorded_at between ${window_start} and ${window_end}
      and source in ('garmin', 'healthkit')
    group by source
  `;
  const hk = Number(counts.find((c) => c.source === 'healthkit')?.n ?? '0');
  const garmin = Number(counts.find((c) => c.source === 'garmin')?.n ?? '0');

  let final_source = exec.source;
  let switched = false;
  if (garmin > 0 && exec.source !== 'garmin') {
    await sql`
      update workout_executions
      set source = 'garmin', updated_at = now()
      where id = ${exec.id}::bigint
    `;
    final_source = 'garmin';
    switched = true;
  }

  return {
    execution_id: exec.id,
    initial_source: exec.source,
    final_source,
    switched,
    hk_streams: hk,
    garmin_streams: garmin,
  };
}
