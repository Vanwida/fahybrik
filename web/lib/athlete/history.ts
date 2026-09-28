// =============================================================================
// Athlete HISTORY by month — the read side of the iOS monthly calendar. For a
// natural calendar month it returns the days that have CONTENT: the days on which
// the athlete trained (plotted by the date the work was DONE, not when it was
// scheduled) and the days that were SCHEDULED as rest. Each session row carries
// its `execution_id` (always) and the id of its workout_assignment when it has one,
// so the calendar taps straight into the session detail
// (`/api/athlete/assignments/[id]/detail`, or `/api/athlete/executions/[id]/detail`
// for work that has no assignment). Empty days (no plan, no work) are omitted — the
// client paints them blank.
//
// Ground rules (honest by design, mirrors the analytics tab):
//   • A session from the plan (coach's or the athlete's own libre) counts once its
//     assignment reached a DONE state — workout_executions has NO status column;
//     done/pending lives on workout_assignments.status (see
//     lib/sync/assignment-status.ts). The mere existence of an execution row on an
//     assignment is NOT enough.
//   • Work with NO assignment — an Apple Salud / FIT import that fitted no slot
//     (0191/0192) or a workout kept «fuera del plan» (0270) — IS done work: it only
//     exists because it was recorded. It counts in load, zones and running; it
//     counts here too. Until 2026-09-28 the INNER JOIN on the assignment dropped it
//     (athlete 64 since 1-aug: 133 sessions in load, 70 in the history).
//     COMPATIBILITY: the installed iOS app decodes `assignment_id` as a non-optional
//     string, so these rows are served only when the client opts in
//     (`include_unplanned`). Without it the response is exactly the old one plus
//     additive fields. Docs: docs/pr/lectores-libre-coach.md.
//   • Sessions plot by the ATHLETE's local calendar day the work was done on
//     (`athletes.timezone`, resolved once per request; BOX_TIMEZONE only when it is
//     unset or unknown), the same day convention week-plan.ts uses for the
//     athlete's "today" (docs/DECISIONS.md 2026-09-23 «Qué día es en cada sitio»).
//   • `is_rest` reuses week-plan.ts's SOURCE + LOGIC: the athlete's rest days are
//     the days WITHOUT a scheduled COACH assignment inside a week the coach planned.
//     Only `origin = 'coach'` decides it: a libre the athlete built on a Tuesday
//     does not turn his Wednesday into a «rest day», and a week with only libres is
//     not a planned week. A month with no plan produces no rest days — never a
//     fabricated grid of rest. A day the athlete trained is never rest.
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
import { isValidTimezone } from '@fahybrid/shared/domain/coach/coach-timezone';
import { loadAthleteTimezone } from '@fahybrid/shared/domain/db/athlete-timezone';
import {
  SEGMENT_MODALITY_SESSION_TITLE,
  toSegmentModality,
  type SegmentModality,
} from '@fahybrid/shared/domain/segment-modality';
import { segmentVolumeKg, type VolumeSet } from '@fahybrid/shared/domain/strength';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { SEG_COUNTS_AS_VOLUME, SEG_MODALITY_SQL } from '@/lib/execution/segment-work';

export interface AthleteHistorySession {
  /** The execution — always present. Opens `/api/athlete/executions/[id]/detail`. */
  execution_id: string;
  /** The workout_assignment, or null for work with no assignment (only served with
   *  `include_unplanned`). Opens `/api/athlete/assignments/[id]/detail`. */
  assignment_id: string | null;
  /** Session title, resolved from the workout (templates.name) — the SAME source
   *  week-plan.ts and assignment-detail.ts use. With no template, the name of what
   *  was done most (`SEGMENT_MODALITY_SESSION_TITLE`: «Carrera», «Remo»…). */
  title: string;
  total_duration_seconds: number | null;
  /** For Time / RFT / HYROX-sim final time in seconds; null for non-scored formats. */
  score_time_s: number | null;
  /** AMRAP result: rounds (+ partial reps). Null when not scored that way. */
  score_rounds: number | null;
  score_reps: number | null;
  /** Session distance (`workout_executions.total_distance_m`, card 126): null when
   *  nothing measured distance OR two modalities did (adding run + row metres means
   *  nothing). */
  distance_m: number | null;
  /** What was done MOST (by time, then distance): run | row | ski | bike | strength
   *  | other. Null when the session has no tramos. */
  modality: SegmentModality | null;
  /** Tonnage of the session, kg: Σ of its tramos' `volume_kg` (the ONE rule,
   *  `shared/domain/strength/volume.ts`: reps × kg of the sets done/scaled; a tramo
   *  without sets counts its single line). Equals the sum the detail serves per
   *  tramo. Null when nothing carried load (running, bodyweight) — never a 0. */
  volume_kg: number | null;
  /** perceived_exertion (1–10); null when the athlete didn't log it. */
  rpe: number | null;
  /** True when this execution was logged as a JOINT Dobles session (partner link). */
  with_partner: boolean;
  /** True when an outdoor GPS route (workout_routes) exists for this execution. */
  has_route: boolean;
  /** Who created the assignment — only `self` may be deleted by the athlete. Null
   *  when there is no assignment. */
  origin: 'coach' | 'self' | null;
  /** How the record came to exist: live | manual | imported (null = legacy). */
  recorded_via: string | null;
  /** Why a workout has no assignment (0270): assignment_gone | not_own_assignment |
   *  no_assignment. Null for plan sessions and plain imports. */
  off_plan_reason: string | null;
}

export interface AthleteHistoryDay {
  /** ISO YYYY-MM-DD, in the athlete's own calendar. */
  date: string;
  /** A scheduled rest day (no coach assignment that day, inside a planned week). */
  is_rest: boolean;
  /** Done work on this day, ordered by when it started. Empty on a rest day. */
  sessions: AthleteHistorySession[];
}

export interface AthleteHistoryMonth {
  /** Echoes the requested YYYY-MM. */
  month: string;
  /** Days WITH content (sessions or rest), chronological. Empty days omitted. */
  days: AthleteHistoryDay[];
}

export interface AthleteHistoryOptions {
  /** Also serve done work with NO assignment (imports, «fuera del plan»), whose
   *  `assignment_id` is null. Off by default: the installed app can't decode it. */
  include_unplanned?: boolean;
}

interface ExecRow {
  done_date: string;
  execution_id: string;
  assignment_id: string | null;
  title: string | null;
  total_duration_seconds: number | null;
  score_time_s: number | null;
  score_rounds: number | null;
  score_reps: number | null;
  distance_m: number | null;
  modality: string | null;
  rpe: number | null;
  with_partner: boolean;
  has_route: boolean;
  origin: 'coach' | 'self' | null;
  recorded_via: string | null;
  off_plan_reason: string | null;
}

/**
 * Build one month of the athlete's history. `month` MUST be a validated `YYYY-MM`
 * (the route enforces the regex). Days are natural-calendar, in the athlete's own
 * time zone. Takes an injectable `client` (defaults to the prod pool) so the
 * real-DB tests exercise the exact SQL against a Neon branch.
 */
export async function buildAthleteHistoryMonth(
  athlete_id: number | bigint,
  month: string,
  client: Sql = defaultSql,
  opts: AthleteHistoryOptions = {},
): Promise<AthleteHistoryMonth> {
  const includeUnplanned = opts.include_unplanned === true;
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

  // The athlete's zone, resolved ONCE and bound as a parameter. A stored zone the
  // date engine doesn't know falls back to the default here. The query checks it
  // again against Postgres's own list (`pg_timezone_names`): the two tz databases
  // differ (Intl accepts 'US/Pacific-New', Postgres rejects it), and an unknown
  // zone in `at time zone` would fail the whole query.
  const storedTz = await loadAthleteTimezone(client, athlete_id);
  const tz = isValidTimezone(storedTz) ? storedTz : BOX_TIMEZONE;

  const [execRows, schedRows] = await Promise.all([
    // Done work in the month, dated by the athlete's local day it was done on
    // (started_at, falling back to the row's created_at when a legacy sync left
    // started_at null). A plan session is gated on its assignment's DONE status;
    // work with no assignment is done by definition (opt-in, see header).
    // tenancy: athlete-session — athlete_id sale del bearer del atleta (GET /api/athlete/history).
    client<ExecRow[]>`
      with tz as (
        select coalesce(
          (select n.name from pg_timezone_names n where n.name = ${tz}),
          ${BOX_TIMEZONE}
        ) as name
      )
      select
        (coalesce(we.started_at, we.created_at) at time zone tz.name)::date::text as done_date,
        we.id::text                                as execution_id,
        we.assignment_id::text                     as assignment_id,
        t.name                                     as title,
        we.total_duration_seconds                  as total_duration_seconds,
        we.score_time_s                            as score_time_s,
        we.score_rounds                            as score_rounds,
        we.score_reps                              as score_reps,
        we.total_distance_m::float8                as distance_m,
        pm.modality                                as modality,
        we.perceived_exertion                      as rpe,
        (we.partner_athlete_id is not null)        as with_partner,
        exists (
          select 1 from workout_routes wr where wr.execution_id = we.id
        )                                          as has_route,
        wa.origin::text                            as origin,
        we.recorded_via::text                      as recorded_via,
        we.off_plan_reason                         as off_plan_reason
      from workout_executions we
      cross join tz
      left join workout_assignments wa on wa.id = we.assignment_id
      left join templates t on t.id = wa.template_id
      -- Lo que MÁS se hizo: la modalidad con más tiempo (y, a igualdad, más metros)
      -- entre los tramos que cuentan como volumen. Canónica (SEG_MODALITY_SQL).
      left join lateral (
        select ${SEG_MODALITY_SQL(client)} as modality
        from segment_executions se
        left join template_segments ts on ts.id = se.template_segment_id
        left join exercises ex on ex.id = coalesce(se.exercise_id, ts.exercise_id)
        where se.execution_id = we.id
          and ${SEG_COUNTS_AS_VOLUME(client)}
        group by 1
        order by sum(coalesce(extract(epoch from (se.ended_at - se.started_at)), 0)) desc,
                 sum(coalesce(se.distance_meters, 0)) desc,
                 min(se.position) asc
        limit 1
      ) pm on true
      where we.athlete_id = ${athlete_id as number}
        and (
          wa.status::text in ('completed', 'partial')
          or (${includeUnplanned} and we.assignment_id is null)
        )
        and (coalesce(we.started_at, we.created_at) at time zone tz.name)::date >= ${monthStartIso}::date
        and (coalesce(we.started_at, we.created_at) at time zone tz.name)::date <= ${monthEndIso}::date
      order by done_date asc, we.started_at asc nulls last, we.id asc
    `,
    // Scheduled COACH assignment days in the widened range, used only to derive
    // which days are planned (workout) vs scheduled rest. Mirrors week-plan.ts's
    // publish gate: a week the coach saved as DRAFT is not yet the athlete's plan,
    // so its assignments don't count toward planned-ness. A libre is never plan.
    // tenancy: athlete-session — athlete_id sale del bearer del atleta (GET /api/athlete/history).
    client<Array<{ sched_date: string }>>`
      select distinct to_char(wa.scheduled_for, 'YYYY-MM-DD') as sched_date
      from workout_assignments wa
      where wa.athlete_id = ${athlete_id as number}
        and wa.origin = 'coach'
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

  const volumeByExecution = await loadVolumeKgByExecution(
    client,
    execRows.map((r) => r.execution_id),
  );

  // Group done sessions by the day they were done (SQL already ordered them by
  // started_at within a day, so pushing in order preserves it).
  const sessionsByDate = new Map<string, AthleteHistorySession[]>();
  for (const r of execRows) {
    const list = sessionsByDate.get(r.done_date) ?? [];
    const modality = r.modality != null ? toSegmentModality(r.modality) : null;
    list.push({
      execution_id: r.execution_id,
      assignment_id: r.assignment_id,
      title: r.title ?? (modality ? SEGMENT_MODALITY_SESSION_TITLE[modality] : SEGMENT_MODALITY_SESSION_TITLE.other),
      total_duration_seconds: r.total_duration_seconds,
      score_time_s: r.score_time_s,
      score_rounds: r.score_rounds,
      score_reps: r.score_reps,
      distance_m: r.distance_m != null ? Math.round(r.distance_m) : null,
      modality,
      volume_kg: volumeByExecution.get(r.execution_id) ?? null,
      rpe: r.rpe,
      with_partner: r.with_partner,
      has_route: r.has_route,
      origin: r.origin,
      recorded_via: r.recorded_via,
      off_plan_reason: r.off_plan_reason,
    });
    sessionsByDate.set(r.done_date, list);
  }

  // Days with a scheduled coach assignment, and the set of PLANNED weeks (Monday
  // ISO). A rest day = inside a planned week, no coach assignment that day.
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

/**
 * Tonnage per execution (kg), with the SAME rule and the same tramos the detail
 * uses (`session-actuals.ts` › `segmentVolumeKg`), so the history row and the sum
 * of its detail never disagree. Executions with no load are absent from the map.
 */
async function loadVolumeKgByExecution(client: Sql, executionIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (executionIds.length === 0) return out;
  const ids = executionIds.map(Number);
  const [segs, sets] = await Promise.all([
    // tenancy: verified-owner — ids de ejecuciones del atleta del bearer (consulta de arriba).
    client<Array<{ id: string; execution_id: string; reps_completed: number | null; weight_used_kg: string | null }>>`
      select se.id::text as id, se.execution_id::text as execution_id,
             se.reps_completed, se.weight_used_kg::text as weight_used_kg
      from segment_executions se
      where se.execution_id = any(${ids}::bigint[])
    `,
    // tenancy: verified-owner — series de esas mismas ejecuciones.
    client<Array<{ segment_execution_id: string; reps: number | null; kg: string | null; status: string }>>`
      select st.segment_execution_id::text as segment_execution_id,
             st.reps_actual as reps, st.load_actual_kg::text as kg, st.status
      from set_executions st
      join segment_executions se on se.id = st.segment_execution_id
      where se.execution_id = any(${ids}::bigint[])
    `,
  ]);
  const setsBySegment = new Map<string, VolumeSet[]>();
  for (const st of sets) {
    const list = setsBySegment.get(st.segment_execution_id) ?? [];
    list.push({ reps: st.reps, kg: st.kg != null ? Number(st.kg) : null, status: st.status });
    setsBySegment.set(st.segment_execution_id, list);
  }
  for (const seg of segs) {
    const v = segmentVolumeKg({
      sets: setsBySegment.get(seg.id) ?? [],
      reps_completed: seg.reps_completed,
      weight_used_kg: seg.weight_used_kg != null ? Number(seg.weight_used_kg) : null,
    });
    if (v == null) continue;
    out.set(seg.execution_id, Math.round(((out.get(seg.execution_id) ?? 0) + v) * 100) / 100);
  }
  return out;
}
