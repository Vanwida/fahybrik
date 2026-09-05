// COROS MCP ingest — ALWAYS persist historial. Never gate on an assignment.
//
// Polar's ingest-polar.ts returns early when the day has no assignment. That
// gate is forbidden here: a COROS activity without a plan still lands as an
// unassigned execution (mig 0191: assignment_id NULL, recorded_via='imported').
// If that local day HAS a still-scheduled assignment, we enqueue a Sí/No ask
// instead of auto-matching. The webhook leftover below stays a no-op.

import type { Sql } from '@/lib/db';
import { loadAthleteTimezone } from '@fahybrid/shared/domain/db/athlete-timezone';
import { zonedDayString } from '@fahybrid/shared/domain/dates';
import type { SegmentModality } from '@fahybrid/shared/domain/segment-modality';
import type { CorosActivitySummary } from '@/lib/coros/mcp-client';
import { parseFitFile } from '@/lib/import/fit/parse';
import { materializeFitActivity } from '@/lib/import/fit/materialize';
import { sportToModality } from '@/lib/import/fit/mappings';
import { existsOverlappingExecution } from './execution-time-dedupe';
import { enqueueCorosLinkPrompt } from './coros-link';

export const COROS_SOURCE = 'coros' as const;

export type CorosIngestOutcome = 'inserted' | 'exists' | 'skipped';

export type CorosIngestResult = {
  outcome: CorosIngestOutcome;
  execution_id: string | null;
  asked: boolean;
};

export function corosSourceWorkoutRef(activityId: string): string {
  return `coros:${activityId}`;
}

/** True only when a NEW historial row landed AND the day still has a planned session. */
export function shouldOfferLinkPrompt(args: {
  inserted: boolean;
  scheduledAssignmentId: string | null;
}): boolean {
  return args.inserted && args.scheduledAssignmentId != null;
}

/**
 * Partner-webhook leftover. MCP pull is the delivery path — this must not persist.
 */
export async function ingestCorosWorkout(
  athlete_id: bigint,
  payload: unknown,
): Promise<void> {
  void athlete_id;
  void payload;
}

export async function ingestCorosActivity(args: {
  sql: Sql;
  athlete_id: bigint;
  activity: CorosActivitySummary;
  fitBytes?: Uint8Array | null;
  /** Called only after dedupe — so a re-sync does not burn the 50 FIT/day cap. */
  loadFit?: () => Promise<Uint8Array | null>;
}): Promise<CorosIngestResult> {
  const { sql, athlete_id, activity } = args;
  const id = athlete_id as unknown as number;
  const sourceRef = corosSourceWorkoutRef(activity.id);

  const already = await sql<{ id: string }[]>`
    select id::text from workout_executions
    where athlete_id = ${id}
      and source_workout_ref = ${sourceRef}
    limit 1
  `;
  if (already[0]) {
    return { outcome: 'exists', execution_id: already[0].id, asked: false };
  }

  let executionId: string | null = null;
  let inserted = false;
  const fitBytes = args.fitBytes ?? (args.loadFit ? await args.loadFit() : null);

  if (fitBytes && fitBytes.length > 12) {
    const parsed = parseFitFile(fitBytes);
    const fit = parsed.activities[0];
    if (fit) {
      const materialized = await materializeFitActivity({
        sql,
        athlete_id,
        activity: { ...fit, source_ref: sourceRef },
        source: COROS_SOURCE,
      });
      if (materialized.outcome === 'exists' || materialized.outcome === 'skipped_live') {
        return {
          outcome: materialized.outcome === 'exists' ? 'exists' : 'skipped',
          execution_id: materialized.execution_id,
          asked: false,
        };
      }
      executionId = materialized.execution_id;
      inserted = materialized.outcome === 'inserted' || materialized.outcome === 'superseded';
    }
  }

  if (!executionId) {
    const summary = await materializeCorosSummary({ sql, athlete_id, activity, sourceRef });
    executionId = summary.execution_id;
    inserted = summary.outcome === 'inserted';
    if (summary.outcome !== 'inserted') {
      return { outcome: summary.outcome, execution_id: executionId, asked: false };
    }
  }

  const scheduledId = await findScheduledAssignmentThatDay(sql, athlete_id, activity.startedAt);
  const asked =
    shouldOfferLinkPrompt({ inserted, scheduledAssignmentId: scheduledId }) && executionId != null
      ? await enqueueCorosLinkPrompt({
          sql,
          athlete_id,
          sourceWorkoutRef: sourceRef,
          executionId,
          assignmentId: scheduledId!,
        })
      : false;

  return { outcome: 'inserted', execution_id: executionId, asked };
}

async function materializeCorosSummary(args: {
  sql: Sql;
  athlete_id: bigint;
  activity: CorosActivitySummary;
  sourceRef: string;
}): Promise<{ outcome: CorosIngestOutcome; execution_id: string | null }> {
  const { sql, athlete_id, activity, sourceRef } = args;
  if (await existsOverlappingExecution(sql, athlete_id, activity.startedAt, activity.endedAt)) {
    return { outcome: 'skipped', execution_id: null };
  }
  const id = athlete_id as unknown as number;
  const duration =
    activity.durationSeconds != null && Number.isFinite(activity.durationSeconds)
      ? Math.round(activity.durationSeconds)
      : Math.max(1, Math.round((activity.endedAt.getTime() - activity.startedAt.getTime()) / 1000));
  const avgHr = intOrNull(activity.avgHr, 30, 260);
  const maxHr = intOrNull(activity.maxHr, 30, 260);
  const distance = numOrNull(activity.distanceMeters);
  const calories = numOrNull(activity.calories);
  const modality = corosSportToModality(activity.sport);
  const paceKm =
    modality === 'run' && distance != null && duration > 0 && distance > 0
      ? duration / (distance / 1000)
      : null;

  const inserted = await sql<{ id: string }[]>`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
      source, source_workout_ref, recorded_via,
      avg_hr, max_hr, total_distance_m, total_calories
    ) values (
      null,
      ${id},
      ${activity.startedAt.toISOString()},
      ${activity.endedAt.toISOString()},
      ${duration},
      ${COROS_SOURCE}::biometric_source,
      ${sourceRef},
      'imported'::execution_recording_method,
      ${avgHr},
      ${maxHr},
      ${distance},
      ${calories}
    )
    returning id::text
  `;
  const executionId = inserted[0]?.id;
  if (!executionId) return { outcome: 'exists', execution_id: null };

  await sql`
    insert into segment_executions (
      execution_id, position, started_at, ended_at,
      distance_meters, calories, avg_hr, max_hr,
      modality, avg_pace_s_per_km, source, context_source
    ) values (
      ${executionId}::bigint,
      0,
      ${activity.startedAt.toISOString()},
      ${activity.endedAt.toISOString()},
      ${distance},
      ${calories},
      ${avgHr},
      ${maxHr},
      ${modality},
      ${paceKm},
      ${COROS_SOURCE},
      'session'
    )
  `;

  return { outcome: 'inserted', execution_id: executionId };
}

export async function findScheduledAssignmentThatDay(
  sql: Sql,
  athlete_id: bigint,
  startedAt: Date,
): Promise<string | null> {
  const tz = await loadAthleteTimezone(sql, athlete_id);
  const day = zonedDayString(startedAt, tz);
  const rows = await sql<{ id: string }[]>`
    select wa.id::text as id
    from workout_assignments wa
    where wa.athlete_id = ${athlete_id as unknown as number}
      and wa.scheduled_for = ${day}::date
      and wa.status = 'scheduled'::assignment_status
    order by wa.id desc
    limit 1
  `;
  return rows[0]?.id ?? null;
}

export function corosSportToModality(sport: string | null | undefined): SegmentModality {
  if (!sport) return 'other';
  const s = sport.toLowerCase();
  if (s.includes('run') || s.includes('jog') || s.includes('trail')) return 'run';
  if (s.includes('row') || s.includes('erg')) return 'row';
  if (s.includes('ski')) return 'ski';
  if (s.includes('bike') || s.includes('cycl')) return 'bike';
  if (s.includes('strength') || s.includes('gym') || s.includes('weight')) return 'strength';
  return sportToModality(sport);
}

function intOrNull(n: number | null | undefined, min: number, max: number): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}

function numOrNull(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  return n;
}
