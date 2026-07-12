import 'server-only';

// =============================================================================
// Dobles PAIR-RHYTHM signals — the single source for "how often this pair trains
// together". Derived ONLY from the SELF athlete's JOINT executions
// (workout_executions.partner_athlete_id set = a session logged "juntos", 0074):
// keyed on the athlete's OWN rows, never the partner's, so it is ownership-safe
// and never fabricates the other side.
//
// Shared by:
//   • GET /api/athlete/dobles/plan          → the `streak` block (counts + last)
//   • GET /api/athlete/dobles/joint-summary → joint_this_month / weeks_streak
//
// Calendar buckets are Europe/Madrid (BOX_TIMEZONE), matching every other
// calendar surface in the repo. An execution's bucket is its actual training
// instant — coalesce(started_at, created_at): started_at is the workout start the
// recorder always writes; created_at is the honest fallback for older rows.
// =============================================================================

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeekInBox } from '@fahybrid/shared/domain/dates';

/** The two count signals both surfaces expose. */
export interface DoublesStreakCounts {
  /** Joint executions in the current natural month (Madrid). */
  joint_this_month: number;
  /**
   * Consecutive ISO weeks (Madrid) with ≥1 joint execution, counting back from
   * the current week. Standard streak semantics: the current week not YET having
   * a joint does not break the streak — the count simply begins at the previous
   * week rather than resetting to 0.
   */
  weeks_streak: number;
}

/** The most recent joint session, for the plan's `streak.last_joint`. */
export interface LastJoint {
  /** ISO date (YYYY-MM-DD, Madrid) the joint session fell on. */
  date: string;
  /** Session title (the coach's workout title; 'Sesión' fallback, as the plan). */
  title: string;
  /** My total session time in seconds — honest-null when not recorded. */
  self_time_s: number | null;
  /** The partner's total time for the SAME-day joint — honest-null when the
   *  partner has not logged their side. */
  partner_time_s: number | null;
}

/** The full `streak` block on the connected-plan payload. */
export interface DoublesStreakBlock extends DoublesStreakCounts {
  last_joint: LastJoint | null;
}

/**
 * Consecutive-weeks streak over a set of Madrid ISO-week Monday strings
 * ('YYYY-MM-DD'), counting back from the week containing `now`. Pure + testable.
 * The current week not yet having a joint does NOT break the streak — the count
 * begins at the previous week.
 */
export function consecutiveWeeksStreak(weekMondays: Set<string>, now: Date): number {
  // UTC-midnight Date of the current Madrid week's Monday (mondayOfWeekInBox), so
  // it composes with the UTC calendar helpers (addDays, isoDateString).
  let cursor = mondayOfWeekInBox(now);
  if (!weekMondays.has(isoDateString(cursor))) {
    cursor = addDays(cursor, -7);
  }
  let streak = 0;
  while (weekMondays.has(isoDateString(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

/**
 * The count signals (joint_this_month + weeks_streak) for an athlete's joint
 * executions. One round-trip: the month count in SQL, the distinct Madrid week
 * Mondays returned for the pure JS streak walk.
 */
export async function computeDoublesStreak(
  args: { athleteId: bigint | number; now?: Date },
  client: Sql = defaultSql,
): Promise<DoublesStreakCounts> {
  const athleteId = Number(args.athleteId);
  const now = args.now ?? new Date();

  const rows = await client<{ month_count: number; week_mondays: string[] }[]>`
    with joints as (
      select (coalesce(we.started_at, we.created_at) at time zone 'Europe/Madrid') as local_ts
      from workout_executions we
      where we.athlete_id = ${athleteId}
        and we.partner_athlete_id is not null
    )
    select
      count(*) filter (
        where date_trunc('month', local_ts)
            = date_trunc('month', (${now.toISOString()}::timestamptz at time zone 'Europe/Madrid'))
      )::int as month_count,
      coalesce(
        array_agg(distinct to_char(date_trunc('week', local_ts), 'YYYY-MM-DD')),
        '{}'
      ) as week_mondays
    from joints
  `;

  const r = rows[0];
  const weekMondays = new Set<string>(r?.week_mondays ?? []);
  return {
    joint_this_month: r?.month_count ?? 0,
    weeks_streak: consecutiveWeeksStreak(weekMondays, now),
  };
}

/**
 * The athlete's most recent joint session with the partner's same-day time.
 * Two small point reads: my latest joint execution (+ its assignment title),
 * then the partner's own execution linking back to me on that SAME Madrid day.
 * Null when the athlete has no joint execution yet.
 */
export async function loadLastJoint(
  args: { athleteId: bigint | number; partnerAthleteId: bigint | number },
  client: Sql = defaultSql,
): Promise<LastJoint | null> {
  const athleteId = Number(args.athleteId);
  const partnerAthleteId = Number(args.partnerAthleteId);

  const mine = await client<
    { local_day: string; title: string | null; self_time_s: number | null }[]
  >`
    select
      to_char((coalesce(we.started_at, we.created_at) at time zone 'Europe/Madrid'), 'YYYY-MM-DD') as local_day,
      coalesce(t.name, 'Sesión') as title,
      we.total_duration_seconds as self_time_s
    from workout_executions we
    join workout_assignments wa on wa.id = we.assignment_id
    left join templates t on t.id = wa.template_id
    where we.athlete_id = ${athleteId}
      and we.partner_athlete_id is not null
    order by coalesce(we.started_at, we.created_at) desc
    limit 1
  `;
  const r = mine[0];
  if (!r) return null;

  // The partner's own execution for that same Madrid day linking back to me. The
  // most recent that day when they logged more than once. Honest-null otherwise.
  const partner = await client<{ partner_time_s: number | null }[]>`
    select we.total_duration_seconds as partner_time_s
    from workout_executions we
    where we.athlete_id = ${partnerAthleteId}
      and we.partner_athlete_id = ${athleteId}
      and to_char((coalesce(we.started_at, we.created_at) at time zone 'Europe/Madrid'), 'YYYY-MM-DD') = ${r.local_day}
    order by coalesce(we.started_at, we.created_at) desc
    limit 1
  `;

  return {
    date: r.local_day,
    title: r.title ?? 'Sesión',
    self_time_s: r.self_time_s,
    partner_time_s: partner[0]?.partner_time_s ?? null,
  };
}
