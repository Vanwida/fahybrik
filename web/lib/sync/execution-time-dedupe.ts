// Cross-source, time-window de-dupe for workout EXECUTIONS (not biometric
// samples). Shared by the HealthKit and Garmin ingests so the guard lives in
// ONE place.
//
// A single training session is frequently captured twice: once as a manual /
// phone-only log (source_workout_ref = NULL) and once by a wearable
// (Apple Watch / Strava / Garmin) whose activity syncs under a DIFFERENT id.
// The source_workout_ref / external_id guard cannot catch that pair, so we also
// treat an incoming workout as ALREADY ACCOUNTED FOR when its time window
// overlaps an existing execution. Without this, a day with >=2 assignments could
// land the wearable copy on a DIFFERENT assignment -> a phantom 2nd execution +
// a wrongly-completed assignment -> inflated 7-day volume. 30 min absorbs clock
// skew / delayed auto-start, while overlap (not proximity) is what merges two
// genuinely-present intervals, so back-to-back distinct sessions stay separate.

import type { Sql } from '@/lib/db';

export const DEDUP_WINDOW_MINUTES = 30;
const MS_PER_MINUTE = 60 * 1000;

/**
 * TIME-WINDOW DE-DUPE (core data-integrity guard). Returns `true` when the
 * athlete ALREADY has an execution whose window intersects the incoming
 * workout's `[startedAt, endedAt]` — i.e. the session is already accounted for
 * and a passive import must NOT file a phantom second execution (or flip a
 * second same-day assignment to completed).
 *
 * Overlap rule: when the existing execution has an end, use plain interval
 * intersection; when its end is missing, its `started_at` must fall within
 * ±`windowMinutes` of the incoming workout's window (its start when it has no
 * end of its own).
 */
export async function existsOverlappingExecution(
  client: Sql,
  athleteId: bigint,
  startedAt: Date | string,
  endedAt: Date | string | null,
  windowMinutes: number = DEDUP_WINDOW_MINUTES,
): Promise<boolean> {
  const windowMs = windowMinutes * MS_PER_MINUTE;
  const incomingStartMs = new Date(startedAt).getTime();
  const incomingEndMs = endedAt ? new Date(endedAt).getTime() : incomingStartMs;
  const incomingStartIso = new Date(incomingStartMs).toISOString();
  const incomingEndIso = new Date(incomingEndMs).toISOString();
  const padStartIso = new Date(incomingStartMs - windowMs).toISOString();
  const padEndIso = new Date(incomingEndMs + windowMs).toISOString();
  const overlapping = await client<{ id: string }[]>`
    select we.id::text as id
    from workout_executions we
    where we.athlete_id = ${athleteId as unknown as number}
      and we.started_at is not null
      and (
        (we.ended_at is not null
          and we.started_at <= ${incomingEndIso}::timestamptz
          and we.ended_at   >= ${incomingStartIso}::timestamptz)
        or
        (we.ended_at is null
          and we.started_at >= ${padStartIso}::timestamptz
          and we.started_at <= ${padEndIso}::timestamptz)
      )
    limit 1
  `;
  return overlapping.length > 0;
}
