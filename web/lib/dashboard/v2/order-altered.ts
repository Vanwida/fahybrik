import 'server-only';

import type { Sql } from '@/lib/db';
import { sql } from '@/lib/db';
import {
  isOrderAltered,
  type CompletedSessionOrder,
} from '@fahybrid/shared/domain/adherence';

// order_altered — a SOFT, derived INFO signal for the coach: did the athlete
// complete THIS week's sessions OUT of their planned order? `true` reads as
// "cumplió pero cambió el orden / los días". It carries NO adherence penalty —
// adherencia counts WHETHER a due session got done, never WHEN within the week —
// so this is purely informational and never gates a lane or a number.
//
// The judgement itself is single-sourced in the pure domain function
// `isOrderAltered` (@fahybrid/shared/domain/adherence, migration 0086): an athlete
// is altered only when they FINISH an earlier-planned session AFTER a later-planned
// one; merely moving a session to another day is NOT a violation. This module only
// supplies the DB read that feeds that function.
//
// "Current week" = the microcycle whose dated window contains today
// (`current_date between start_date and end_date`). The baseline rank is the frozen
// `planned_sequence`; when absent we fall back to the ORIGINAL `(scheduled_for, id)`
// order, which equals the plan for a never-moved week. Completion time =
// `coalesce(ended_at, started_at)` (existence of a workout_executions row = done).

type OrderRow = {
  athlete_id: number;
  seq: number;
  completed_at: number;
};

/**
 * BATCH read for the coach /hoy roster. ONE query over EVERY given athlete's
 * CURRENT-week COMPLETED sessions, bucketed by athlete in JS and judged with the
 * shared `isOrderAltered`. Every requested id is PRESENT in the returned Map
 * (default `false`) so callers can read it without an existence check. Athletes
 * with fewer than 2 completions can never be altered → `false`. Empty input →
 * empty Map (no query). Optional `client` so callers inside a test branch / tx
 * read the same connection they were handed (defaults to the shared pool).
 */
export async function getOrderAlteredByAthlete(
  athleteIds: number[],
  client: Sql = sql,
): Promise<Map<number, boolean>> {
  const result = new Map<number, boolean>();
  for (const id of athleteIds) result.set(id, false);
  if (athleteIds.length === 0) return result;

  const rows = await client<OrderRow[]>`
    select wa.athlete_id::int as athlete_id,
           coalesce(
             wa.planned_sequence,
             row_number() over (
               partition by wa.microcycle_id
               order by wa.scheduled_for asc, wa.id asc
             )
           )::int as seq,
           extract(epoch from coalesce(we.ended_at, we.started_at))::float8 as completed_at
    from workout_assignments wa
    join microcycles m
      on m.id = wa.microcycle_id
     and current_date between m.start_date and m.end_date
    join workout_executions we on we.assignment_id = wa.id
    where wa.athlete_id = any(${athleteIds}::bigint[])
    order by wa.athlete_id, completed_at
  `;

  const buckets = new Map<number, CompletedSessionOrder[]>();
  for (const r of rows) {
    const bucket = buckets.get(r.athlete_id);
    const item: CompletedSessionOrder = {
      planned_sequence: r.seq,
      completed_at: r.completed_at,
    };
    if (bucket) bucket.push(item);
    else buckets.set(r.athlete_id, [item]);
  }

  for (const [id, bucket] of buckets) {
    result.set(id, isOrderAltered(bucket));
  }
  return result;
}

/**
 * Single-athlete convenience for the ficha. Delegates to the batch read so the
 * SQL + judgement stay single-sourced. Optional `client` mirrors the batch one.
 */
export async function getOrderAlteredForAthlete(
  athleteId: number,
  client: Sql = sql,
): Promise<boolean> {
  const map = await getOrderAlteredByAthlete([athleteId], client);
  return map.get(athleteId) ?? false;
}
