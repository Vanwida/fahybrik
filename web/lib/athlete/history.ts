// =============================================================================
// Athlete HISTORY by month — the read side of the iOS monthly calendar. For a
// natural calendar month it returns the days that have CONTENT: the days on which
// the athlete completed sessions (plotted by the date the work was DONE, not when
// it was scheduled) and the days that were SCHEDULED as rest. Every session row
// carries the id of its existing workout_assignment, so the calendar taps straight
// into the session detail that already renders any past assignment
// (assignment-detail.ts). Empty days (no plan, no work) are omitted — the client
// paints them blank.
//
// Ground rules (honest by design, mirrors the analytics tab):
//   • A "completed" session is a workout_executions row whose assignment reached a
//     DONE state — workout_executions has NO status column; done/pending lives on
//     workout_assignments.status (see lib/sync/assignment-status.ts), so we join and
//     gate on it. The mere existence of an execution row is NOT enough.
//   • Sessions plot by the LOCAL calendar day (Europe/Madrid, the box timezone —
//     BOX_TIMEZONE) the work was done on, the same day convention week-plan.ts uses
//     for the athlete's "today"; a timestamptz bucketed in UTC would drift a late
//     23:30 BCN session onto the next day.
//   • `is_rest` reuses week-plan.ts's SOURCE + LOGIC: the athlete's rest days are
//     the days WITHOUT a scheduled assignment inside a week that IS planned (has ≥1
//     assignment). A month with no plan produces no rest days — never a fabricated
//     grid of rest. A day can be rest with zero sessions; a day the athlete trained
//     is never rest.
//   • Nothing invented: no missed/failed flag, no PRs — only what the execution row
//     really stores.
// =============================================================================

import {
  BOX_TIMEZONE,
  addDays,
  diffDays,
  isoDateString,
  mondayOfWeek,
  parseIsoDate,
} from '@fahybrid/shared/domain/dates';
import { sql } from '@/lib/db';

export interface AthleteHistorySession {
  assignment_id: string;
  /** Session title, resolved from the coach's workout (templates.name) — the SAME
   *  source week-plan.ts and assignment-detail.ts use. Falls back to 'Sesión'. */
  title: string;
  total_duration_seconds: number | null;
  /** For Time / RFT / HYROX-sim final time in seconds; null for non-scored formats. */
  score_time_s: number | null;
  /** perceived_exertion (1–10); null when the athlete didn't log it. */
  rpe: number | null;
  /** True when this execution was logged as a JOINT Dobles session (partner link). */
  with_partner: boolean;
  /** True when an outdoor GPS route (workout_routes) exists for this execution. */
  has_route: boolean;
}

export interface AthleteHistoryDay {
  /** ISO YYYY-MM-DD, box-local. */
  date: string;
  /** A scheduled rest day (no assignment that day, inside a planned week). */
  is_rest: boolean;
  /** Completed executions done on this day, ordered by when they started. Empty on
   *  a rest day. */
  sessions: AthleteHistorySession[];
}

export interface AthleteHistoryMonth {
  /** Echoes the requested YYYY-MM. */
  month: string;
  /** Days WITH content (sessions or rest), chronological. Empty days omitted. */
  days: AthleteHistoryDay[];
}

interface ExecRow {
  done_date: string;
  assignment_id: string;
  title: string;
  total_duration_seconds: number | null;
  score_time_s: number | null;
  rpe: number | null;
  with_partner: boolean;
  has_route: boolean;
}

/**
 * Build one month of the athlete's history. `month` MUST be a validated `YYYY-MM`
 * (the route enforces the regex). Days are natural-calendar, box-local.
 */
export async function buildAthleteHistoryMonth(
  athlete_id: number | bigint,
  month: string,
): Promise<AthleteHistoryMonth> {
  const [year, mon] = month.split('-').map(Number);
  const monthStart = parseIsoDate(`${month}-01`);
  // First day of the next month, minus one day → last day of THIS month. Date.UTC's
  // month arg is 0-based, so passing `mon` (1-based) already points at next month.
  const monthEnd = addDays(new Date(Date.UTC(year!, mon!, 1)), -1);
  const monthStartIso = isoDateString(monthStart);
  const monthEndIso = isoDateString(monthEnd);

  // For rest-day membership a week can straddle the month edge, so we look at the
  // scheduled assignments of the widened range: Monday of the first week … Sunday of
  // the last week.
  const rangeStartIso = isoDateString(mondayOfWeek(monthStart));
  const rangeEndIso = isoDateString(addDays(mondayOfWeek(monthEnd), 6));

  const [execRows, schedRows] = await Promise.all([
    // Completed executions in the month, dated by the box-local day the work was
    // done on (started_at, falling back to the row's created_at when a legacy sync
    // left started_at null). Gated on the assignment's DONE status.
    sql<ExecRow[]>`
      select
        (coalesce(we.started_at, we.created_at) at time zone ${BOX_TIMEZONE})::date::text as done_date,
        we.assignment_id::text                     as assignment_id,
        coalesce(t.name, 'Sesión')                 as title,
        we.total_duration_seconds                  as total_duration_seconds,
        we.score_time_s                            as score_time_s,
        we.perceived_exertion                      as rpe,
        (we.partner_athlete_id is not null)        as with_partner,
        exists (
          select 1 from workout_routes wr where wr.execution_id = we.id
        )                                          as has_route
      from workout_executions we
      join workout_assignments wa on wa.id = we.assignment_id
      left join templates t on t.id = wa.template_id
      where we.athlete_id = ${athlete_id as number}
        and wa.status::text in ('completed', 'partial')
        and (coalesce(we.started_at, we.created_at) at time zone ${BOX_TIMEZONE})::date >= ${monthStartIso}::date
        and (coalesce(we.started_at, we.created_at) at time zone ${BOX_TIMEZONE})::date <= ${monthEndIso}::date
      order by done_date asc, we.started_at asc nulls last, we.id asc
    `,
    // Scheduled assignment days in the widened range, used only to derive which days
    // are planned (workout) vs scheduled rest. Mirrors week-plan.ts's publish gate:
    // a week the coach saved as DRAFT is not yet the athlete's plan, so its
    // assignments don't count toward planned-ness.
    sql<Array<{ sched_date: string }>>`
      select distinct to_char(wa.scheduled_for, 'YYYY-MM-DD') as sched_date
      from workout_assignments wa
      where wa.athlete_id = ${athlete_id as number}
        and wa.scheduled_for >= ${rangeStartIso}::date
        and wa.scheduled_for <= ${rangeEndIso}::date
        and not exists (
          select 1 from weekly_plans wp
          where wp.athlete_id = ${athlete_id as number}
            and wp.week_start = date_trunc('week', wa.scheduled_for)::date
            and wp.status = 'draft'
        )
    `,
  ]);

  // Group completed sessions by the day they were done (SQL already ordered them by
  // started_at within a day, so pushing in order preserves it).
  const sessionsByDate = new Map<string, AthleteHistorySession[]>();
  for (const r of execRows) {
    const list = sessionsByDate.get(r.done_date) ?? [];
    list.push({
      assignment_id: r.assignment_id,
      title: r.title,
      total_duration_seconds: r.total_duration_seconds,
      score_time_s: r.score_time_s,
      rpe: r.rpe,
      with_partner: r.with_partner,
      has_route: r.has_route,
    });
    sessionsByDate.set(r.done_date, list);
  }

  // Days with a scheduled assignment, and the set of PLANNED weeks (Monday ISO). A
  // rest day = inside a planned week, no assignment that day.
  const scheduledDays = new Set(schedRows.map((r) => r.sched_date));
  const plannedWeeks = new Set(
    schedRows.map((r) => isoDateString(mondayOfWeek(parseIsoDate(r.sched_date)))),
  );

  const restDates = new Set<string>();
  const dayCount = diffDays(monthEnd, monthStart) + 1;
  for (let i = 0; i < dayCount; i++) {
    const day = addDays(monthStart, i);
    const iso = isoDateString(day);
    // A day the athlete trained is never rest.
    if (sessionsByDate.has(iso)) continue;
    const weekMon = isoDateString(mondayOfWeek(day));
    if (!scheduledDays.has(iso) && plannedWeeks.has(weekMon)) restDates.add(iso);
  }

  // Union of "days with sessions" and "rest days" — the two are disjoint (a rest day
  // has no sessions), so is_rest is exactly membership in restDates.
  const dates = [...new Set([...sessionsByDate.keys(), ...restDates])].sort();
  const days: AthleteHistoryDay[] = dates.map((date) => ({
    date,
    is_rest: restDates.has(date),
    sessions: sessionsByDate.get(date) ?? [],
  }));

  return { month, days };
}
