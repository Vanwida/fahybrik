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
// WHOSE CALENDAR: a doubles pair belongs to the CLUB (`doubles_pairs.coach_id`),
// so its days — "this month", the week streak, "the same day" — are counted in
// the pair coach's time zone (`coaches.timezone`; DECISIONS 2026-09-23, «Qué día
// es en cada sitio»). `loadDoublesPairTimezone` resolves it ONCE per call; the
// SQL receives it as a parameter. An execution's bucket is its actual training
// instant — coalesce(started_at, created_at): started_at is the workout start the
// recorder always writes; created_at is the honest fallback for older rows.
// =============================================================================

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, BOX_TIMEZONE, isoDateString } from '@fahybrid/shared/domain/dates';
import {
  effectiveCoachTimezone,
  mondayOfWeekInTz,
} from '@fahybrid/shared/domain/coach/coach-timezone';

/** The two count signals both surfaces expose. */
export interface DoublesStreakCounts {
  /** Joint executions in the current natural month (the pair's club calendar). */
  joint_this_month: number;
  /**
   * Consecutive ISO weeks (the pair's club calendar) with ≥1 joint execution,
   * counting back from the current week. Standard streak semantics: the current
   * week not YET having a joint does not break the streak — the count simply
   * begins at the previous week rather than resetting to 0.
   */
  weeks_streak: number;
}

/** The most recent joint session, for the plan's `streak.last_joint`. */
export interface LastJoint {
  /** ISO date (YYYY-MM-DD, the pair's club calendar) the joint session fell on. */
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
 * The pair's time zone: the coach of the athlete's pair (`doubles_pairs.coach_id`)
 * — the ACTIVE one, else the latest (joint history outlives a dissolved pair),
 * else the athlete's own coach (a pair only joins two athletes of one club). One
 * query. The stored zone must be one Postgres knows (`pg_timezone_names`, checked
 * only when a zone is stored) AND one the date engine knows
 * (`effectiveCoachTimezone`); otherwise the product default `BOX_TIMEZONE`. So
 * the value returned is safe to hand to `at time zone`: an unknown stored zone
 * never crashes the query. (The browser list the club settings offer includes
 * legacy names, e.g. 'Europe/Kiev', that a Postgres built on a trimmed tzdata
 * rejects.)
 */
export async function loadDoublesPairTimezone(
  athleteId: bigint | number,
  client: Sql = defaultSql,
): Promise<string> {
  const id = Number(athleteId);
  const rows = await client<{ tz: string | null }[]>`
    with club as (
      select coalesce(
        (select dp.coach_id from doubles_pairs dp
          where dp.athlete_a_id = ${id} or dp.athlete_b_id = ${id}
          order by (dp.status = 'active') desc, dp.id desc limit 1),
        (select a.coach_id from athletes a where a.id = ${id})
      ) as coach_id
    ),
    stored as (
      -- to_jsonb: tolera un entorno sin la columna (mig 0241) → defecto.
      select to_jsonb(c) ->> 'timezone' as tz
      from coaches c join club on club.coach_id = c.id
    )
    select case
             when s.tz is null then null
             else (select v.name from pg_timezone_names v where v.name = s.tz)
           end as tz
    from stored s
  `;
  return effectiveCoachTimezone(rows[0]?.tz ?? null);
}

/**
 * Consecutive-weeks streak over a set of ISO-week Monday strings ('YYYY-MM-DD')
 * bucketed in `tz`, counting back from the week containing `now` in that same
 * zone. Pure + testable. The current week not yet having a joint does NOT break
 * the streak — the count begins at the previous week. `tz` is the pair's zone;
 * `BOX_TIMEZONE` only as the fallback when a caller has none.
 */
export function consecutiveWeeksStreak(
  weekMondays: Set<string>,
  now: Date,
  tz: string = BOX_TIMEZONE,
): number {
  // UTC-midnight Date of the current week's Monday in `tz`, so it composes with
  // the UTC calendar helpers (addDays, isoDateString).
  let cursor = mondayOfWeekInTz(now, tz);
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
 * executions. One round-trip: the month count in SQL, the distinct week Mondays
 * (in the pair's calendar) returned for the pure JS streak walk. `tz` is a zone
 * already resolved by `loadDoublesPairTimezone`; without it, it is resolved here.
 */
export async function computeDoublesStreak(
  args: { athleteId: bigint | number; now?: Date; tz?: string },
  client: Sql = defaultSql,
): Promise<DoublesStreakCounts> {
  const athleteId = Number(args.athleteId);
  const now = args.now ?? new Date();
  const tz = args.tz ?? (await loadDoublesPairTimezone(athleteId, client));

  const rows = await client<{ month_count: number; week_mondays: string[] }[]>`
    with joints as (
      select (coalesce(we.started_at, we.created_at) at time zone ${tz}) as local_ts
      from workout_executions we
      where we.athlete_id = ${athleteId}
        and we.partner_athlete_id is not null
    )
    select
      count(*) filter (
        where date_trunc('month', local_ts)
            = date_trunc('month', (${now.toISOString()}::timestamptz at time zone ${tz}))
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
    weeks_streak: consecutiveWeeksStreak(weekMondays, now, tz),
  };
}

/**
 * The athlete's most recent joint session with the partner's same-day time.
 * Two small point reads: my latest joint execution (+ its assignment title),
 * then the partner's own execution linking back to me on that SAME day of the
 * pair's club calendar. Null when the athlete has no joint execution yet. `tz`
 * as in `computeDoublesStreak`.
 */
export async function loadLastJoint(
  args: { athleteId: bigint | number; partnerAthleteId: bigint | number; tz?: string },
  client: Sql = defaultSql,
): Promise<LastJoint | null> {
  const athleteId = Number(args.athleteId);
  const partnerAthleteId = Number(args.partnerAthleteId);
  const tz = args.tz ?? (await loadDoublesPairTimezone(athleteId, client));

  const mine = await client<
    { local_day: string; title: string | null; self_time_s: number | null }[]
  >`
    select
      to_char((coalesce(we.started_at, we.created_at) at time zone ${tz}), 'YYYY-MM-DD') as local_day,
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

  // The partner's own execution for that same club day linking back to me. The
  // most recent that day when they logged more than once. Honest-null otherwise.
  const partner = await client<{ partner_time_s: number | null }[]>`
    select we.total_duration_seconds as partner_time_s
    from workout_executions we
    where we.athlete_id = ${partnerAthleteId}
      and we.partner_athlete_id = ${athleteId}
      and to_char((coalesce(we.started_at, we.created_at) at time zone ${tz}), 'YYYY-MM-DD') = ${r.local_day}
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
