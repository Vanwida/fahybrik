import type { Sql } from 'postgres';
import {
  addDays,
  diffDays,
  isoDateString,
  mondayOfWeek,
  parseIsoDate,
  startOfDayInBox,
} from '../dates';

/**
 * AGNOSTIC "current microciclo" reader — the periodization-free replacement for the
 * legacy periodization "current block" reader. A microciclo is the coach's own DATA: the
 * materialization receipt `athlete_month_assignments` (name via
 * `program_month_templates`, dated window, `microcycle_ids[]` = its weeks). There is
 * NO ATR block, NO ACC/TRANS/REAL, NO macrocycle — the ORDER of the coach's
 * microciclos IS the periodization. The athlete/coach see the coach's NAME +
 * "semana N de M", never periodization jargon.
 *
 * Resolution: the assignment whose [start_date, end_date] window contains `on_date`
 * (most recent wins). `week_index` = which Mon–Sun week within that window today
 * falls in (1-based); `week_count` = the assignment's week count (its
 * `microcycle_ids[]`, with a date-span fallback). Returns null when today is outside
 * any materialized microciclo (free-planned / between plans).
 */
export type CurrentMicrociclo = {
  /** athlete_month_assignments.id — the coach "microciclo" (assignment receipt) id. */
  assignment_id: bigint;
  month_template_id: bigint;
  /** program_month_templates.name — THE agnostic label (replaces ATR block_type). */
  name: string;
  /** athlete_levels.name for the assignment's template, or '' when unleveled. */
  level: string;
  /** 1-based week within the assignment window (semana N). */
  week_index: number;
  /** Total weeks M in the assignment (microcycle_ids length, span fallback). */
  week_count: number;
  assignment_start: string;
  assignment_end: string;
  /** Monday / Sunday ISO of the current week. */
  week_start: string;
  week_end: string;
  /** Days until the athlete's A event (>= 0), null when none scheduled. */
  a_event_days: number | null;
  /** Whole weeks until the A event (ceil), null when no A event. */
  weeks_to_event: number | null;
};

export async function getCurrentMicrociclo(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<CurrentMicrociclo | null> {
  const client = params.client;
  const today = startOfDayInBox(params.on_date ?? new Date());
  const todayIso = isoDateString(today);

  const rows = await client<
    Array<{
      assignment_id: bigint;
      month_template_id: bigint;
      name: string | null;
      level: string;
      start_date: string;
      end_date: string;
      week_count: number;
    }>
  >`
    select
      ama.id                                                 as assignment_id,
      ama.month_template_id                                  as month_template_id,
      m.name                                                 as name,
      coalesce(al.name, '')                                  as level,
      to_char(ama.start_date, 'YYYY-MM-DD')                  as start_date,
      to_char(ama.end_date,   'YYYY-MM-DD')                  as end_date,
      coalesce(array_length(ama.microcycle_ids, 1), 0)::int  as week_count
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    left join athlete_levels al on al.id = m.level_id
    where ama.athlete_id = ${params.athlete_id as number}
      and ama.start_date <= ${todayIso}::date
      and ama.end_date   >= ${todayIso}::date
    order by ama.start_date desc
    limit 1
  `;
  const r = rows[0];
  if (!r || !r.name) return null;

  const startMonday = mondayOfWeek(parseIsoDate(r.start_date));
  const spanWeeks =
    Math.floor(diffDays(mondayOfWeek(parseIsoDate(r.end_date)), startMonday) / 7) + 1;
  const week_count = r.week_count > 0 ? r.week_count : Math.max(1, spanWeeks);
  const idx = Math.floor(diffDays(mondayOfWeek(today), startMonday) / 7) + 1;
  const week_index = Math.min(Math.max(idx, 1), week_count);

  const weekStart = mondayOfWeek(today);

  const aEventRows = await client<Array<{ days: number }>>`
    select (e.start_date - ${todayIso}::date)::int as days
    from athlete_target_events ate
    join events e on e.id = ate.event_id
    where ate.athlete_id = ${params.athlete_id as number}
      and ate.priority = 'A'
      and e.start_date >= ${todayIso}::date
    order by e.start_date asc limit 1
  `;
  const a_event_days = aEventRows[0]?.days ?? null;
  const weeks_to_event = a_event_days == null ? null : Math.max(0, Math.ceil(a_event_days / 7));

  return {
    assignment_id: r.assignment_id,
    month_template_id: r.month_template_id,
    name: r.name,
    level: r.level,
    week_index,
    week_count,
    assignment_start: r.start_date,
    assignment_end: r.end_date,
    week_start: isoDateString(weekStart),
    week_end: isoDateString(addDays(weekStart, 6)),
    a_event_days,
    weeks_to_event,
  };
}
