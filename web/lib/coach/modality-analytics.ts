// Run-vs-row(-vs-ski/bike/strength) modality analytics.
//
// Aggregates segment_executions for one athlete, joined via
//   segment_executions → workout_executions (athlete owner)
//                       → template_segments → exercises (modality fallback).
//
// MODALITY resolution (single source of truth, mirrors normalizeModality on the
// ingest side): the explicit `segment_executions.modality` column is PRIMARY;
// when null we derive from the exercise — cardio splits into run/row/ski/bike by
// slug, strength/category map straight through, everything else → 'other'. This
// is expressed once as the SQL `seg_modality` CTE column and reused by all three
// output sections so the breakdown is internally consistent.
//
// Output shape is contract-frozen — consumed verbatim by the UI agents.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

export interface ModalityTotal {
  modality: string;
  distance_meters: number;
  duration_seconds: number;
  sessions: number;
  avg_pace_s_per_km: number | null;
  avg_pace_s_per_500m: number | null;
}

export interface ModalityWeekly {
  week_start: string;
  modality: string;
  distance_meters: number;
  duration_seconds: number;
  sessions: number;
}

export interface RecentExecutionSegment {
  position: number;
  modality: string;
  distance_meters: number | null;
  duration_seconds: number | null;
  avg_pace_s_per_500m: number | null;
  avg_pace_s_per_km: number | null;
  avg_power_w: number | null;
  stroke_rate_spm: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  reps_completed: number | null;
  weight_used_kg: number | null;
}

export interface RecentExecution {
  execution_id: string;
  date: string;
  total_duration_seconds: number | null;
  perceived_exertion: number | null;
  segments: RecentExecutionSegment[];
}

export interface ModalityAnalytics {
  by_modality_totals: ModalityTotal[];
  weekly: ModalityWeekly[];
  recent_executions: RecentExecution[];
}

// How many recent executions to surface with full per-segment detail.
const RECENT_EXECUTIONS_LIMIT = 12;
// Window for the totals/weekly aggregation.
const ANALYTICS_WINDOW_DAYS = 90;

// Shared SQL fragment: resolve the canonical modality for a segment row aliased
// `se`, with exercise aliased `ex`. Explicit column wins; otherwise derive.
// Reused across every query below (DRY).
const SEG_MODALITY_SQL = (sql: Sql) => sql`
  coalesce(
    se.modality,
    case
      when ex.category = 'cardio' and ex.slug ilike '%run%'  then 'run'
      when ex.category = 'cardio' and ex.slug ilike '%row%'  then 'row'
      when ex.category = 'cardio' and (ex.slug ilike '%ski%') then 'ski'
      when ex.category = 'cardio' and (ex.slug ilike '%bike%' or ex.slug ilike '%cycl%') then 'bike'
      when ex.category = 'strength' then 'strength'
      when ex.category is not null then 'other'
      else 'other'
    end
  )
`;

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

export async function buildModalityAnalytics(
  args: { athlete_id: number | bigint },
  client: Sql = defaultSql,
): Promise<ModalityAnalytics> {
  const athleteId = Number(args.athlete_id);
  const mod = SEG_MODALITY_SQL(client);

  // ---- by_modality_totals ----------------------------------------------------
  // distance + active duration + distinct sessions per modality, plus a
  // volume-weighted-ish average pace (avg of segment paces where present).
  const totalsRows = await client<
    Array<{
      modality: string;
      distance_meters: string | null;
      duration_seconds: string | null;
      sessions: string;
      avg_pace_s_per_km: string | null;
      avg_pace_s_per_500m: string | null;
    }>
  >`
    select
      ${mod} as modality,
      sum(coalesce(se.distance_meters, 0))::float as distance_meters,
      sum(
        coalesce(
          extract(epoch from (se.ended_at - se.started_at)),
          0
        )
      )::float as duration_seconds,
      count(distinct se.execution_id)::int as sessions,
      avg(se.avg_pace_s_per_km) as avg_pace_s_per_km,
      avg(se.avg_pace_s_per_500m) as avg_pace_s_per_500m
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    left join template_segments ts on ts.id = se.template_segment_id
    left join exercises ex on ex.id = ts.exercise_id
    where we.athlete_id = ${athleteId}
      and coalesce(we.ended_at, we.started_at) >= now() - (${ANALYTICS_WINDOW_DAYS} || ' days')::interval
    group by 1
    order by distance_meters desc, duration_seconds desc
  `;

  const by_modality_totals: ModalityTotal[] = totalsRows.map((r) => ({
    modality: r.modality,
    distance_meters: Math.round(num(r.distance_meters)),
    duration_seconds: Math.round(num(r.duration_seconds)),
    sessions: num(r.sessions),
    avg_pace_s_per_km: r.avg_pace_s_per_km != null ? Math.round(num(r.avg_pace_s_per_km)) : null,
    avg_pace_s_per_500m:
      r.avg_pace_s_per_500m != null ? Math.round(num(r.avg_pace_s_per_500m)) : null,
  }));

  // ---- weekly ----------------------------------------------------------------
  // ISO week buckets (Monday start) × modality.
  const weeklyRows = await client<
    Array<{
      week_start: string;
      modality: string;
      distance_meters: string | null;
      duration_seconds: string | null;
      sessions: string;
    }>
  >`
    select
      to_char(date_trunc('week', coalesce(we.ended_at, we.started_at))::date, 'YYYY-MM-DD') as week_start,
      ${mod} as modality,
      sum(coalesce(se.distance_meters, 0))::float as distance_meters,
      sum(
        coalesce(extract(epoch from (se.ended_at - se.started_at)), 0)
      )::float as duration_seconds,
      count(distinct se.execution_id)::int as sessions
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    left join template_segments ts on ts.id = se.template_segment_id
    left join exercises ex on ex.id = ts.exercise_id
    where we.athlete_id = ${athleteId}
      and coalesce(we.ended_at, we.started_at) >= now() - (${ANALYTICS_WINDOW_DAYS} || ' days')::interval
    group by 1, 2
    order by 1 asc, distance_meters desc
  `;

  const weekly: ModalityWeekly[] = weeklyRows.map((r) => ({
    week_start: r.week_start,
    modality: r.modality,
    distance_meters: Math.round(num(r.distance_meters)),
    duration_seconds: Math.round(num(r.duration_seconds)),
    sessions: num(r.sessions),
  }));

  // ---- recent_executions (with per-segment detail) ---------------------------
  const recentExecRows = await client<
    Array<{
      execution_id: string;
      date: string;
      total_duration_seconds: number | null;
      perceived_exertion: number | null;
    }>
  >`
    select
      we.id::text as execution_id,
      to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as date,
      we.total_duration_seconds,
      we.perceived_exertion
    from workout_executions we
    where we.athlete_id = ${athleteId}
      and exists (select 1 from segment_executions se where se.execution_id = we.id)
    order by coalesce(we.ended_at, we.started_at) desc
    limit ${RECENT_EXECUTIONS_LIMIT}
  `;

  const execIds = recentExecRows.map((r) => Number(r.execution_id));

  const segRows =
    execIds.length === 0
      ? []
      : await client<
          Array<{
            execution_id: string;
            position: number;
            modality: string;
            distance_meters: string | null;
            duration_seconds: string | null;
            avg_pace_s_per_500m: string | null;
            avg_pace_s_per_km: string | null;
            avg_power_w: string | null;
            stroke_rate_spm: string | null;
            avg_hr: number | null;
            max_hr: number | null;
            calories: string | null;
            reps_completed: number | null;
            weight_used_kg: string | null;
          }>
        >`
          select
            se.execution_id::text as execution_id,
            se.position,
            ${mod} as modality,
            se.distance_meters,
            extract(epoch from (se.ended_at - se.started_at))::float as duration_seconds,
            se.avg_pace_s_per_500m,
            se.avg_pace_s_per_km,
            se.avg_power_w,
            se.stroke_rate_spm,
            se.avg_hr,
            se.max_hr,
            se.calories,
            se.reps_completed,
            se.weight_used_kg
          from segment_executions se
          join workout_executions we on we.id = se.execution_id
          left join template_segments ts on ts.id = se.template_segment_id
          left join exercises ex on ex.id = ts.exercise_id
          where se.execution_id = any(${execIds}::bigint[])
          order by se.execution_id, se.position
        `;

  const segsByExec = new Map<string, RecentExecutionSegment[]>();
  for (const s of segRows) {
    const arr = segsByExec.get(s.execution_id) ?? [];
    arr.push({
      position: s.position,
      modality: s.modality,
      distance_meters: numOrNull(s.distance_meters),
      duration_seconds: s.duration_seconds != null ? Math.round(num(s.duration_seconds)) : null,
      avg_pace_s_per_500m:
        s.avg_pace_s_per_500m != null ? Math.round(num(s.avg_pace_s_per_500m)) : null,
      avg_pace_s_per_km: s.avg_pace_s_per_km != null ? Math.round(num(s.avg_pace_s_per_km)) : null,
      avg_power_w: numOrNull(s.avg_power_w),
      stroke_rate_spm: numOrNull(s.stroke_rate_spm),
      avg_hr: s.avg_hr ?? null,
      max_hr: s.max_hr ?? null,
      calories: s.calories != null ? Math.round(num(s.calories)) : null,
      reps_completed: s.reps_completed ?? null,
      weight_used_kg: numOrNull(s.weight_used_kg),
    });
    segsByExec.set(s.execution_id, arr);
  }

  const recent_executions: RecentExecution[] = recentExecRows.map((r) => ({
    execution_id: r.execution_id,
    date: r.date,
    total_duration_seconds: r.total_duration_seconds ?? null,
    perceived_exertion: r.perceived_exertion ?? null,
    segments: segsByExec.get(r.execution_id) ?? [],
  }));

  return { by_modality_totals, weekly, recent_executions };
}
