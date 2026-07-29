import 'server-only';

// COMPLIANCE OVER A TRAILING WINDOW — completed / scheduled, pauses excluded.
//
// THE single reader. It existed twice, byte for byte: `computeCompliance` in
// cohort.ts (the roster) and `loadCompliancePct` in athlete-deep-dive.ts (the
// ficha) were the same query, the same pause exclusion and the same rounding,
// written out in full in both files. Nothing had drifted yet — which is the only
// reason this is a tidy-up and not another incident report.
//
// The rounding is NOT inlined here either: `adherencePct` in
// shared/domain/adherence/completion.ts owns "completed / scheduled → 0…100 or
// null", so the roster, /hoy and this window round the same way. Nothing due in
// the window is NULL, never 0 % (docs/DECISIONS.md, 28-jul).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { adherencePct } from '@fahybrid/shared/domain/adherence';
import type { DailyAssignmentCount } from '@fahybrid/shared/domain/coach/race-readiness';
import { adherenceExclusionSql } from './adherence-pause-filter';

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Scheduled and completed assignments per day over `[on_date - days, on_date]`,
 * with paused days and injury-rest days already dropped from the row source.
 *
 * Read once and rolled in memory by callers that need a MOVING window (the
 * 90-day readiness trend would otherwise be thirty round-trips of the same
 * query). One day per row, so any trailing window is a sum.
 */
export async function loadDailyAssignmentCounts(params: {
  athlete_id: number | bigint;
  on_date: Date;
  days: number;
  client?: Sql;
}): Promise<DailyAssignmentCount[]> {
  const client = params.client ?? defaultSql;
  const startIso = isoDay(shiftDays(params.on_date, -params.days));
  const endIso = isoDay(params.on_date);

  const rows = await client<Array<{ day: string; scheduled: number; completed: number }>>`
    select
      to_char(wa.scheduled_for, 'YYYY-MM-DD') as day,
      count(*)::int as scheduled,
      count(*) filter (where wa.status = 'completed')::int as completed
    from workout_assignments wa
    where wa.athlete_id = ${Number(params.athlete_id)}
      and wa.scheduled_for >= ${startIso}::date
      and wa.scheduled_for <= ${endIso}::date
      ${adherenceExclusionSql(client, client`wa.athlete_id`, client`wa.scheduled_for`, client`wa.injury_adaptation`)}
    group by 1
    order by 1
  `;
  return rows.map((r) => ({ date: r.day, scheduled: r.scheduled, completed: r.completed }));
}

/**
 * Completion adherence over `[on_date - days, on_date]` as an integer 0…100, or
 * null when nothing was due — which is not the same as 0 %.
 */
export async function loadCompliancePct(params: {
  athlete_id: number | bigint;
  on_date: Date;
  days: number;
  client?: Sql;
}): Promise<number | null> {
  const daily = await loadDailyAssignmentCounts(params);
  const scheduled = daily.reduce((s, d) => s + d.scheduled, 0);
  const completed = daily.reduce((s, d) => s + d.completed, 0);
  return adherencePct(scheduled, completed);
}
