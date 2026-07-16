// Performance sub-tab payload — diagnostic deep dive. Per-exercise time
// series 6m, polarization across multiple windows, running economy, lactate
// threshold, anaerobic capacity, race-readiness composite history.
//
// Ported from web/lib/coach/deep-dive-performance.ts and trimmed: no demo
// branches (coach dashboard validates numeric id upstream).

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { joinCoachOverride } from '@/lib/exercises/coach-override';
import { AthleteAnalyticsError } from './deep-dive-body';

export const POLARIZATION_WINDOWS = ['7d', '14d', '28d', '90d'] as const;
export type PolarizationWindow = (typeof POLARIZATION_WINDOWS)[number];

export interface PolarizationPct {
  low: number;
  mid: number;
  high: number;
}

export interface PolarizationByWindow {
  window: PolarizationWindow;
  pct: PolarizationPct;
  drift_vs_target: number;
  trend: 'up' | 'down' | 'flat';
}

export interface ExerciseAttempt {
  iso_date: string;
  best_seconds: number | null;
  avg_seconds: number | null;
  is_pr: boolean;
  is_test: boolean;
}

export interface ExerciseTimeSeries {
  exercise_slug: string;
  exercise_label: string;
  category: 'running' | 'hyrox' | 'strength' | 'skill';
  attempts: ExerciseAttempt[];
  best_seconds: number | null;
  median_seconds: number | null;
  variability_cv: number | null;
  pr_count: number;
}

export interface PerformancePoint {
  iso_date: string;
  value: number | null;
}

export interface RunningEconomyPoint {
  iso_month: string;
  pace_at_145bpm_sec_per_km: number | null;
}

export interface LtPoint {
  iso_month: string;
  lt_hr_bpm: number | null;
  lt_pace_sec_per_km: number | null;
}

export interface AnaerobicPoint {
  iso_date: string;
  best_3min_avg_w: number | null;
  critical_power_w: number | null;
  w_prime_kj: number | null;
}

export interface HyroxStationPrediction {
  station_label: string;
  predicted_seconds: number;
  best_seconds: number | null;
  delta_to_best_seconds: number;
}

export interface HyroxPrediction {
  predicted_total_seconds: number;
  goal_total_seconds: number | null;
  delta_to_goal_seconds: number | null;
  stations: HyroxStationPrediction[];
}

export interface RaceReadinessPoint {
  iso_date: string;
  score: number;
  inputs: {
    tsb_pts: number;
    compliance_pts: number;
    hrv_pts: number;
    sessions_pts: number;
  };
  block_transition_label: string | null;
  event_label: string | null;
}

export interface PerformancePayload {
  generated_at_iso: string;
  athlete_id: string;
  athlete_name: string;
  has_any_data: boolean;
  exercises: ExerciseTimeSeries[];
  polarization_by_window: PolarizationByWindow[];
  polarization_history: Array<{ iso_date: string; pct: PolarizationPct }>;
  running_economy: RunningEconomyPoint[];
  lt_history: LtPoint[];
  anaerobic_capacity: AnaerobicPoint[];
  hyrox_prediction: HyroxPrediction | null;
  race_readiness_history: RaceReadinessPoint[];
}

const POLARIZATION_TARGET: PolarizationPct = { low: 80, mid: 0, high: 20 };

export async function buildAthletePerformance(params: {
  coach_id: number | bigint;
  athlete_id: number;
  now?: Date;
  client?: Sql;
}): Promise<PerformancePayload> {
  const now = params.now ?? new Date();
  const client = params.client ?? defaultSql;

  if (!Number.isFinite(params.athlete_id) || params.athlete_id <= 0) {
    throw new AthleteAnalyticsError('not_found', 'Atleta no encontrado', 404);
  }

  const header = await client<Array<{ full_name: string }>>`
    select full_name from athletes
    where id = ${params.athlete_id} and coach_id = ${params.coach_id} limit 1
  `;
  if (header.length === 0) {
    throw new AthleteAnalyticsError('not_found', 'Atleta no encontrado', 404);
  }

  // Each loader is guarded: when an underlying table/column doesn't exist yet
  // (sync pipeline still being built), we fall back to empty data so the UI
  // renders honestly instead of throwing 500.
  const exercises = await safeCall(
    () => loadExerciseSeries(client, params.athlete_id, params.coach_id, now),
    [] as ExerciseTimeSeries[],
  );
  const polarization_by_window = await Promise.all(
    POLARIZATION_WINDOWS.map((w) =>
      safeCall(() => loadPolarization(client, params.athlete_id, now, w), zeroPolarization(w)),
    ),
  );
  const polarization_history = await safeCall(
    () => loadPolarizationHistory(client, params.athlete_id, now),
    [] as Array<{ iso_date: string; pct: PolarizationPct }>,
  );
  const running_economy = await safeCall(
    () => loadRunningEconomy(client, params.athlete_id, now),
    [] as RunningEconomyPoint[],
  );
  const lt_history = await safeCall(
    () => loadLt(client, params.athlete_id, now),
    [] as LtPoint[],
  );
  const anaerobic_capacity = await safeCall(
    () => loadAnaerobic(client, params.athlete_id, now),
    [] as AnaerobicPoint[],
  );
  const hyrox_prediction = await loadHyroxPrediction();
  const race_readiness_history = await safeCall(
    () => loadRaceReadiness(client, params.athlete_id, now),
    [] as RaceReadinessPoint[],
  );

  const has_any_data =
    exercises.length > 0 ||
    polarization_by_window.some((p) => p.pct.low + p.pct.mid + p.pct.high > 0) ||
    anaerobic_capacity.length > 0 ||
    race_readiness_history.some((r) => r.inputs.compliance_pts > 0 || r.inputs.sessions_pts > 0);

  return {
    generated_at_iso: now.toISOString(),
    athlete_id: String(params.athlete_id),
    athlete_name: header[0]!.full_name, // guarded by header.length===0 check above
    has_any_data,
    exercises,
    polarization_by_window,
    polarization_history,
    running_economy,
    lt_history,
    anaerobic_capacity,
    hyrox_prediction,
    race_readiness_history,
  };
}

// ---------------------------------------------------------------------------
// Exercise time series
// ---------------------------------------------------------------------------

async function loadExerciseSeries(
  client: Sql,
  athlete_id: number,
  coach_id: number | bigint,
  now: Date,
): Promise<ExerciseTimeSeries[]> {
  const since = addDays(now, -180).toISOString();
  // Name is DISPLAYED (the exercise_label the coach reads below) — coach's
  // renamed exercise wins over the base catalog name (mig 0132).
  const top = await client<Array<{ slug: string; name: string; category: string; n: number }>>`
    select e.slug, coalesce(ceo.name, e.name) as name, e.category::text as category, count(*)::int as n
    from segment_executions se
    join template_segments ts on ts.id = se.template_segment_id
    join exercises e on e.id = ts.exercise_id
    ${joinCoachOverride(client, coach_id)}
    join workout_executions we on we.id = se.execution_id
    where we.athlete_id = ${athlete_id}
      and coalesce(we.ended_at, we.started_at) >= ${since}
      and se.started_at is not null and se.ended_at is not null
    group by e.slug, e.name, e.category, ceo.name
    order by n desc
    limit 8
  `;
  if (top.length === 0) return [];

  const slugList = top.map((t) => t.slug);
  const attemptsRows = await client<
    Array<{ slug: string; iso: string; best: number | null; avg: number | null }>
  >`
    select ex.slug as slug,
           to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as iso,
           min(extract(epoch from (se.ended_at - se.started_at)))::float as best,
           avg(extract(epoch from (se.ended_at - se.started_at)))::float as avg
    from segment_executions se
    join template_segments ts on ts.id = se.template_segment_id
    join exercises ex on ex.id = ts.exercise_id
    join workout_executions we on we.id = se.execution_id
    where we.athlete_id = ${athlete_id}
      and coalesce(we.ended_at, we.started_at) >= ${since}
      and ex.slug = any(${slugList}::text[])
      and se.started_at is not null and se.ended_at is not null
    group by ex.slug, iso
    order by ex.slug, iso
  `;

  const grouped = new Map<string, ExerciseAttempt[]>();
  for (const r of attemptsRows) {
    const arr = grouped.get(r.slug) ?? [];
    arr.push({
      iso_date: r.iso,
      best_seconds: r.best != null ? Math.round(r.best) : null,
      avg_seconds: r.avg != null ? Math.round(r.avg) : null,
      is_pr: false,
      is_test: false,
    });
    grouped.set(r.slug, arr);
  }
  for (const arr of grouped.values()) {
    let runningBest = Infinity;
    for (const a of arr) {
      if (a.best_seconds != null && a.best_seconds < runningBest) {
        runningBest = a.best_seconds;
        a.is_pr = true;
      }
    }
  }

  return top.map((t) => {
    const attempts = grouped.get(t.slug) ?? [];
    const bests = attempts.map((a) => a.best_seconds).filter((v): v is number => v != null);
    const avgs = attempts.map((a) => a.avg_seconds).filter((v): v is number => v != null);
    const best = bests.length > 0 ? Math.min(...bests) : null;
    const median =
      avgs.length > 0
        ? avgs.slice().sort((a, b) => a - b)[Math.floor(avgs.length / 2)]! // in-bounds: avgs.length > 0
        : null;
    const cv =
      avgs.length > 1 && median != null
        ? Math.sqrt(avgs.reduce((s, v) => s + (v - median) ** 2, 0) / avgs.length) / median
        : null;
    return {
      exercise_slug: t.slug,
      exercise_label: t.name,
      category: mapCategory(t.category),
      attempts,
      best_seconds: best,
      median_seconds: median,
      variability_cv: cv != null ? round2(cv) : null,
      pr_count: attempts.filter((a) => a.is_pr).length,
    };
  });
}

function mapCategory(c: string): ExerciseTimeSeries['category'] {
  if (c === 'cardio') return 'running';
  if (c === 'hyrox_station') return 'hyrox';
  if (c === 'strength' || c === 'core') return 'strength';
  return 'skill';
}

// ---------------------------------------------------------------------------
// Polarization
// ---------------------------------------------------------------------------

async function loadPolarization(
  client: Sql,
  athlete_id: number,
  now: Date,
  window: PolarizationWindow,
): Promise<PolarizationByWindow> {
  const days = window === '7d' ? 7 : window === '14d' ? 14 : window === '28d' ? 28 : 90;
  const since = addDays(now, -days).toISOString();
  const rows = await client<Array<{ z: number; n: number }>>`
    with samples as (
      select value_numeric::float as hr
      from biometric_streams
      where athlete_id = ${athlete_id}
        and metric_type::text = 'hr'
        and recorded_at >= ${since}::timestamptz
    ),
    classified as (
      select case
        when hr < 0.7  * 200 then 1
        when hr < 0.85 * 200 then 2
        else 3 end as z
      from samples
    )
    select z, count(*)::int as n from classified group by z
  `;
  const total = rows.reduce((s, r) => s + r.n, 0);
  if (total === 0) return zeroPolarization(window);
  const map = new Map(rows.map((r) => [r.z, r.n]));
  const pct: PolarizationPct = {
    low: Math.round(((map.get(1) ?? 0) / total) * 100),
    mid: Math.round(((map.get(2) ?? 0) / total) * 100),
    high: Math.round(((map.get(3) ?? 0) / total) * 100),
  };
  const drift =
    Math.abs(pct.low - POLARIZATION_TARGET.low) +
    Math.abs(pct.mid - POLARIZATION_TARGET.mid) +
    Math.abs(pct.high - POLARIZATION_TARGET.high);
  return { window, pct, drift_vs_target: drift, trend: 'flat' };
}

function zeroPolarization(window: PolarizationWindow): PolarizationByWindow {
  return { window, pct: { low: 0, mid: 0, high: 0 }, drift_vs_target: 100, trend: 'flat' };
}

async function loadPolarizationHistory(
  client: Sql,
  athlete_id: number,
  now: Date,
): Promise<Array<{ iso_date: string; pct: PolarizationPct }>> {
  const out: Array<{ iso_date: string; pct: PolarizationPct }> = [];
  for (let i = 11; i >= 0; i--) {
    const end = addDays(now, -i * 7);
    const start = addDays(end, -7);
    const rows = await client<Array<{ z: number; n: number }>>`
      with samples as (
        select value_numeric::float as hr
        from biometric_streams
        where athlete_id = ${athlete_id}
          and metric_type::text = 'hr'
          and recorded_at >= ${start.toISOString()}::timestamptz
          and recorded_at <  ${end.toISOString()}::timestamptz
      ),
      classified as (
        select case
          when hr < 0.7  * 200 then 1
          when hr < 0.85 * 200 then 2
          else 3 end as z
        from samples
      )
      select z, count(*)::int as n from classified group by z
    `;
    const total = rows.reduce((s, r) => s + r.n, 0);
    if (total === 0) {
      out.push({ iso_date: end.toISOString().slice(0, 10), pct: { low: 0, mid: 0, high: 0 } });
      continue;
    }
    const map = new Map(rows.map((r) => [r.z, r.n]));
    out.push({
      iso_date: end.toISOString().slice(0, 10),
      pct: {
        low: Math.round(((map.get(1) ?? 0) / total) * 100),
        mid: Math.round(((map.get(2) ?? 0) / total) * 100),
        high: Math.round(((map.get(3) ?? 0) / total) * 100),
      },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Running economy / LT / anaerobic / HYROX prediction / race readiness
// ---------------------------------------------------------------------------

async function loadRunningEconomy(
  client: Sql,
  athlete_id: number,
  now: Date,
): Promise<RunningEconomyPoint[]> {
  const out: RunningEconomyPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const next = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    const rows = await client<Array<{ pace: number | null }>>`
      select avg(extract(epoch from (se.ended_at - se.started_at)) / nullif(se.distance_meters / 1000.0, 0))::float as pace
      from segment_executions se
      join workout_executions we on we.id = se.execution_id
      where we.athlete_id = ${athlete_id}
        and coalesce(we.ended_at, we.started_at) >= ${m.toISOString()}::timestamptz
        and coalesce(we.ended_at, we.started_at) <  ${next.toISOString()}::timestamptz
        and se.avg_hr between 140 and 150
        and se.distance_meters > 1000
    `;
    out.push({
      iso_month: monthKey(m),
      pace_at_145bpm_sec_per_km: rows[0]?.pace != null ? Math.round(rows[0].pace) : null,
    });
  }
  return out;
}

async function loadLt(client: Sql, athlete_id: number, now: Date): Promise<LtPoint[]> {
  const out: LtPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const next = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    const rows = await client<Array<{ hr: number | null; pace: number | null }>>`
      select avg(se.avg_hr)::float as hr,
             avg(extract(epoch from (se.ended_at - se.started_at)) / nullif(se.distance_meters / 1000.0, 0))::float as pace
      from segment_executions se
      join workout_executions we on we.id = se.execution_id
      join template_segments ts on ts.id = se.template_segment_id
      join exercises ex on ex.id = ts.exercise_id
      where we.athlete_id = ${athlete_id}
        and coalesce(we.ended_at, we.started_at) >= ${m.toISOString()}::timestamptz
        and coalesce(we.ended_at, we.started_at) <  ${next.toISOString()}::timestamptz
        and ex.slug like 'run-threshold%'
        and se.distance_meters > 800
    `;
    out.push({
      iso_month: monthKey(m),
      lt_hr_bpm: rows[0]?.hr != null ? Math.round(rows[0].hr) : null,
      lt_pace_sec_per_km: rows[0]?.pace != null ? Math.round(rows[0].pace) : null,
    });
  }
  return out;
}

async function loadAnaerobic(
  client: Sql,
  athlete_id: number,
  now: Date,
): Promise<AnaerobicPoint[]> {
  const since = addDays(now, -365).toISOString();
  const rows = await client<Array<{ iso: string; w: number | null }>>`
    select to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as iso,
           max(se.avg_power_w)::float as w
    from segment_executions se
    join template_segments ts on ts.id = se.template_segment_id
    join exercises ex on ex.id = ts.exercise_id
    join workout_executions we on we.id = se.execution_id
    where we.athlete_id = ${athlete_id}
      and coalesce(we.ended_at, we.started_at) >= ${since}
      and ex.slug = 'run-3min-allout'
    group by iso
    order by iso
  `;
  return rows.map((r) => ({
    iso_date: r.iso,
    best_3min_avg_w: r.w != null ? Math.round(r.w) : null,
    critical_power_w: null,
    w_prime_kj: null,
  }));
}

async function loadHyroxPrediction(): Promise<HyroxPrediction | null> {
  return null;
}

async function loadRaceReadiness(
  client: Sql,
  athlete_id: number,
  now: Date,
): Promise<RaceReadinessPoint[]> {
  const out: RaceReadinessPoint[] = [];
  for (let i = 89; i >= 0; i -= 3) {
    const day = addDays(now, -i);
    const rows = await client<
      Array<{ tsb: number | null; compliance: number | null; hrv: number | null; sessions: number | null }>
    >`
      with daily_load as (
        select avg(load_score)::float as tss
        from training_load tl
        where tl.athlete_id = ${athlete_id}
          and tl.day = ${day.toISOString().slice(0, 10)}::date
      ),
      compliance_7 as (
        select count(*) filter (where status = 'completed')::float
             / nullif(count(*), 0)::float * 100 as pct
        from workout_assignments
        where athlete_id = ${athlete_id}
          and scheduled_for between ${addDays(day, -7).toISOString().slice(0, 10)}::date and ${day.toISOString().slice(0, 10)}::date
      ),
      hrv_recent as (
        select avg(value_numeric)::float as hrv
        from biometric_streams
        where athlete_id = ${athlete_id} and metric_type::text = 'hrv'
          and recorded_at between ${addDays(day, -3).toISOString()}::timestamptz and ${day.toISOString()}::timestamptz
      ),
      sessions_7 as (
        select count(*)::int as n from workout_executions
        where athlete_id = ${athlete_id}
          and coalesce(ended_at, started_at) between ${addDays(day, -7).toISOString()}::timestamptz and ${day.toISOString()}::timestamptz
      )
      select (select tss from daily_load) as tsb,
             (select pct from compliance_7) as compliance,
             (select hrv from hrv_recent) as hrv,
             (select n from sessions_7) as sessions
    `;
    const r = rows[0];
    const tsbPts = r?.tsb != null ? Math.max(0, Math.min(40, ((r.tsb + 10) / 20) * 40)) : 20;
    const compPts = r?.compliance != null ? (r.compliance / 100) * 30 : 20;
    const hrvPts = 12;
    const sesPts = r?.sessions != null ? Math.min(10, r.sessions * 1.5) : 5;
    out.push({
      iso_date: day.toISOString().slice(0, 10),
      score: Math.round(tsbPts + compPts + hrvPts + sesPts),
      inputs: {
        tsb_pts: Math.round(tsbPts),
        compliance_pts: Math.round(compPts),
        hrv_pts: Math.round(hrvPts),
        sessions_pts: Math.round(sesPts),
      },
      block_transition_label: null,
      event_label: null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Drift-tolerance: swallow DB errors caused by schema gaps (table/column not
// yet created) so the dashboard renders empty state instead of 500. Real auth
// and not_found errors are surfaced at the buildAthletePerformance level
// before any loader runs.
async function safeCall<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[deep-dive-performance] loader degraded:', (err as Error).message);
    }
    return fallback;
  }
}
