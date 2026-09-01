// Performance sub-tab payload — diagnostic deep dive. Per-exercise time series
// 6m, polarization across multiple windows, running economy in the athlete's own
// Z2, the HR they hold on prescribed threshold work, anaerobic capacity, and the
// 90-day race-readiness trend.
//
// No demo branches (the coach dashboard validates the numeric id upstream).
//
// EVERY series here can be EMPTY or hold NULLS, and that is the designed answer,
// not a degraded one (docs/CONTRATO-UI.md §7). Nothing in this file may turn a
// missing reading into a number: no `?? 20` points, no 0 % that means "unknown",
// no band measured against a heart rate borrowed from another athlete. Where a
// reading cannot be given, the payload carries WHY and what the coach can do
// (`race_readiness_gap`).

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { joinCoachOverride } from '@/lib/exercises/coach-override';
import { SEG_IS_WORK_EFFORT } from '@/lib/execution/segment-work';
import { loadAthleteHrZones } from '@/lib/athlete/hr-zones';
import { resolveCoachHrMethod } from '@/lib/coach/hr-method';
import { loadDailyAssignmentCounts } from '@/lib/coach/compliance-window';
import { getDailyTssSeries } from '@/lib/training-load';
import { loadPolarizationHistory, loadPolarizationWindow } from '@/lib/zones/polarization';
import {
  defaultCoachHrMethod,
  type CoachHrMethod,
} from '@fahybrid/shared/domain/coach/hr-method';
import {
  hrBandFor,
  type AthleteHrZones,
} from '@fahybrid/shared/domain/methodology';
import {
  HRV_BASELINE_FROM_DAYS,
  type HrvSample,
} from '@fahybrid/shared/domain/biometrics/hrv-baseline';
import {
  buildRaceReadinessHistory,
  READINESS_COMPLIANCE_DAYS,
  READINESS_LOAD_WINDOW_DAYS,
  type RaceReadinessGap,
  type RaceReadinessPoint,
  type RaceReadinessSample,
} from '@fahybrid/shared/domain/coach/race-readiness';
import { AthleteAnalyticsError } from './deep-dive-body';
import {
  loadDataCoverage,
  type DataCoverage,
} from '@/lib/coach/data-coverage';

export const POLARIZATION_WINDOWS = ['7d', '14d', '28d', '90d'] as const;
export type PolarizationWindow = (typeof POLARIZATION_WINDOWS)[number];

export interface PolarizationPct {
  low: number;
  mid: number;
  high: number;
}

export interface PolarizationByWindow {
  window: PolarizationWindow;
  /** Null when the athlete has no HR anchor, or no samples in the window. */
  pct: PolarizationPct | null;
  /** Σ|actual − objetivo| across the three bands. Null exactly when `pct` is. */
  drift_vs_target: number | null;
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
  /**
   * Mean pace of that month's easy running, measured inside the athlete's OWN
   * Z2 band. Null when the month had none — or when the athlete has no anchor,
   * in which case the whole series is empty rather than measured against a
   * number picked for somebody else.
   */
  pace_in_z2_sec_per_km: number | null;
}

export interface ThresholdWorkPoint {
  iso_month: string;
  /**
   * Mean HR the athlete actually held during the THRESHOLD WORK THEY WERE
   * PRESCRIBED that month. It is NOT their lactate-threshold HR: that anchor is
   * `athlete_benchmarks` (the threshold test) and is what the zone model uses.
   * Two different numbers, and this one used to be labelled with the other's
   * name — so the coach's screen and the athlete's zones disagreed about what
   * "umbral" meant.
   */
  work_hr_bpm: number | null;
  work_pace_sec_per_km: number | null;
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

export type { RaceReadinessGap, RaceReadinessPoint };

export interface PerformancePayload {
  generated_at_iso: string;
  athlete_id: string;
  athlete_name: string;
  has_any_data: boolean;
  exercises: ExerciseTimeSeries[];
  polarization_by_window: PolarizationByWindow[];
  polarization_history: Array<{ iso_date: string; pct: PolarizationPct | null }>;
  running_economy: RunningEconomyPoint[];
  threshold_work: ThresholdWorkPoint[];
  anaerobic_capacity: AnaerobicPoint[];
  hyrox_prediction: HyroxPrediction | null;
  /** One entry per sampled day; each carries a reading OR the reason it has none. */
  race_readiness_history: RaceReadinessPoint[];
  /** Why the NEWEST point has no reading, with a way out. Null when it has one. */
  race_readiness_gap: RaceReadinessGap | null;
  /**
   * Qué fuentes tienen dato y desde cuándo — el «antes» de la comparativa.
   * Null solo si el loader falló; vacío de verdad es `sources: []`.
   */
  data_coverage: DataCoverage | null;
}

/** How far back each named window reaches. */
const POLARIZATION_WINDOW_DAYS: Record<PolarizationWindow, number> = {
  '7d': 7,
  '14d': 14,
  '28d': 28,
  '90d': 90,
};

/** Trend span, and the cadence it is sampled at — 30 points over 90 days. */
const READINESS_TREND_DAYS = 90;
const READINESS_TREND_STEP_DAYS = 3;

/** The aerobic-base sparkline: one point per week, twelve weeks back. */
const POLARIZATION_HISTORY_WEEKS = 12;

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
  // The athlete's own HR bands, resolved ONCE and shared by every polarization
  // read below — the same five the phone paints. Null when nothing anchors them.
  const hrZones = await safeCall(
    () => loadAthleteHrZones(params.athlete_id, client),
    null as AthleteHrZones | null,
  );
  // Dónde cortan las tres bandas y qué reparto se persigue son MÉTODO del coach
  // (mig 0168). Se resuelve UNA vez por payload: cinco lecturas de polarización
  // preguntando cada una por su cuenta podrían llegar a discrepar.
  const hrMethod = await safeCall(
    () => resolveCoachHrMethod(params.coach_id, client),
    defaultCoachHrMethod(),
  );
  const polarization_by_window = await Promise.all(
    POLARIZATION_WINDOWS.map((w) =>
      safeCall(() => loadPolarization(client, params.athlete_id, now, w, hrMethod), noPolarization(w)),
    ),
  );
  const polarization_history = await safeCall(
    () =>
      loadPolarizationHistory({
        athlete_id: params.athlete_id,
        weeks: POLARIZATION_HISTORY_WEEKS,
        method: hrMethod,
        now,
        client,
      }),
    [] as Array<{ iso_date: string; pct: PolarizationPct | null }>,
  );
  const running_economy = await safeCall(
    () => loadRunningEconomy(client, params.athlete_id, now, hrZones),
    [] as RunningEconomyPoint[],
  );
  const threshold_work = await safeCall(
    () => loadThresholdWork(client, params.athlete_id, now),
    [] as ThresholdWorkPoint[],
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
  const latestReadiness = race_readiness_history[race_readiness_history.length - 1];
  const data_coverage = await safeCall(
    () => loadDataCoverage({ athlete_id: params.athlete_id, client }),
    null as DataCoverage | null,
  );

  const has_any_data =
    exercises.length > 0 ||
    polarization_by_window.some((p) => p.pct != null) ||
    anaerobic_capacity.length > 0 ||
    race_readiness_history.some((r) => r.reading != null) ||
    (data_coverage != null && data_coverage.sources.length > 0);

  return {
    generated_at_iso: now.toISOString(),
    athlete_id: String(params.athlete_id),
    athlete_name: header[0]!.full_name, // guarded by header.length===0 check above
    has_any_data,
    exercises,
    polarization_by_window,
    polarization_history,
    running_economy,
    threshold_work,
    anaerobic_capacity,
    hyrox_prediction,
    race_readiness_history,
    race_readiness_gap: latestReadiness?.gap ?? null,
    data_coverage,
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
  //
  // El `count(*)` que ordena este top-8 y el `min`/`avg` por día de la consulta
  // siguiente cuentan INTENTOS. Desde 0146 una recuperación de una sesión de
  // series llega con el mismo `template_segment_id` que las series, así que sin
  // filtro un 5x1000 pesaría el doble en el ranking y su mejor tiempo sería el
  // del trote de vuelta.
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
      and ${SEG_IS_WORK_EFFORT(client)}
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
      and ${SEG_IS_WORK_EFFORT(client)}
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
    // Coefficient of variation = σ / μ, and BOTH halves are the mean. It used to
    // take the spread about the MEDIAN and divide by the median, which is a
    // different statistic wearing the label "CV" on the coach's screen.
    const cv = coefficientOfVariation(avgs);
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

/** σ / μ over a sample. Null below two points — one attempt has no spread. */
function coefficientOfVariation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / mean;
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

/**
 * The three-band polarization split — now read from `segment_zone_seconds`, the
 * table the zone engine writes (mig 0168).
 *
 * WHAT THIS REPLACED, and why every line of it had to go:
 *
 *  · It asked `biometric_streams` for EVERY heart-rate reading of the last N
 *    days with nothing tying them to a workout. Measured on 10-ago-2026: of the
 *    106.880 stored readings, 105.894 fall outside any executed segment — 99 %.
 *    The coach's "aerobic base" was the athlete's pulse while asleep, and since
 *    a resting pulse lands in Z1, the more they rested the more polarized their
 *    training looked.
 *  · It COUNTED ROWS. A row is not a second: the same table holds 106.880
 *    readings at only 46.366 distinct instants, so a re-synced stretch weighed
 *    twice as much as a live one.
 *  · It brought every row into the process and the history repeated the query
 *    twelve times, once per week.
 *
 * WHERE the three bands cut, and the target they are compared against, are the
 * COACH's (mig 0168) — resolved once per payload and passed down.
 */
async function loadPolarization(
  client: Sql,
  athlete_id: number,
  now: Date,
  window: PolarizationWindow,
  method: CoachHrMethod,
): Promise<PolarizationByWindow> {
  const days = POLARIZATION_WINDOW_DAYS[window];
  const { pct, drift_vs_target } = await loadPolarizationWindow({
    athlete_id,
    days,
    method,
    now,
    client,
  });
  // No anchor → no zones → no classified second → no split, and no drift either.
  // It used to return a 0/0/0 split carrying `drift_vs_target: 100` — a
  // fabricated "maximum deviation" for an athlete nobody had measured.
  return { window, pct, drift_vs_target };
}

function noPolarization(window: PolarizationWindow): PolarizationByWindow {
  return { window, pct: null, drift_vs_target: null };
}

// ---------------------------------------------------------------------------
// Running economy / LT / anaerobic / HYROX prediction / race readiness
// ---------------------------------------------------------------------------

/** A run has to be this long to say anything about pace at a steady effort. */
const ECONOMY_MIN_DISTANCE_M = 1000;
/** …and this long to be a threshold rep rather than a surge. */
const THRESHOLD_MIN_DISTANCE_M = 800;
/** Twelve monthly buckets, the span both physiology series are read over. */
const MONTHLY_SERIES_MONTHS = 12;

/**
 * Pace of the athlete's easy running, month by month, measured inside THEIR Z2.
 *
 * The band used to be `se.avg_hr between 140 and 150`, hardcoded, for everybody
 * — the same class of bug as the `0.7 * 200` that the zone unification pulled
 * out of the polarization query on 28-jul. 145 ppm is comfortable aerobic work
 * for one athlete and over threshold for another, so a single "economía Z2"
 * curve was comparing each athlete against a stranger.
 *
 * No anchor → no Z2 → EMPTY series. The screen says what is missing; it does not
 * fall back to somebody else's heart rate.
 *
 * Y solo RODAJE, nunca la recuperación de una sesión de series (0146). Este es el
 * peor caso del repo para ese filtro: la consulta selecciona por «carrera con el
 * pulso dentro de Z2», que es la definición literal de un trote de vuelta. Sin
 * excluirlo, cuanto más duro entrena el atleta más trotes suaves entran en la
 * media y la curva dice que su economía empeora — justo al revés.
 */
async function loadRunningEconomy(
  client: Sql,
  athlete_id: number,
  now: Date,
  zones: AthleteHrZones | null,
): Promise<RunningEconomyPoint[]> {
  if (!zones) return [];
  const z2 = hrBandFor(2, zones);
  if (!z2 || z2.min_bpm == null) return [];

  const out: RunningEconomyPoint[] = [];
  for (let i = MONTHLY_SERIES_MONTHS - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const next = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    const rows = await client<Array<{ pace: number | null }>>`
      select avg(extract(epoch from (se.ended_at - se.started_at)) / nullif(se.distance_meters / 1000.0, 0))::float as pace
      from segment_executions se
      join workout_executions we on we.id = se.execution_id
      where we.athlete_id = ${athlete_id}
        and coalesce(we.ended_at, we.started_at) >= ${m.toISOString()}::timestamptz
        and coalesce(we.ended_at, we.started_at) <  ${next.toISOString()}::timestamptz
        and se.avg_hr between ${z2.min_bpm} and ${z2.max_bpm}
        and se.distance_meters > ${ECONOMY_MIN_DISTANCE_M}
        and ${SEG_IS_WORK_EFFORT(client)}
    `;
    out.push({
      iso_month: monthKey(m),
      pace_in_z2_sec_per_km: rows[0]?.pace != null ? Math.round(rows[0].pace) : null,
    });
  }
  return out;
}

/**
 * What the athlete actually held during the threshold work they were prescribed.
 *
 * Renamed from `loadLt` / `lt_hr_bpm`: this never was a lactate threshold. It is
 * the mean HR and pace of segments whose exercise slug starts `run-threshold`,
 * i.e. of the sessions the coach CALLED threshold. The athlete's real threshold
 * anchor is the benchmark that `shared/domain/methodology/hr-zones.ts` resolves
 * zones from, and having a second, different number on screen under the name
 * "FC de umbral" is precisely the collision the zone unification just undid.
 */
async function loadThresholdWork(
  client: Sql,
  athlete_id: number,
  now: Date,
): Promise<ThresholdWorkPoint[]> {
  const out: ThresholdWorkPoint[] = [];
  for (let i = MONTHLY_SERIES_MONTHS - 1; i >= 0; i--) {
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
        and se.distance_meters > ${THRESHOLD_MIN_DISTANCE_M}
        -- El umbral es lo que sostuvo EN las series, no lo que trotó entre ellas
        -- (0146): la recuperación cuelga del mismo bloque de umbral, y metida en
        -- estas dos medias baja el pulso y ralentiza el ritmo del mismo mes.
        and ${SEG_IS_WORK_EFFORT(client)}
    `;
    out.push({
      iso_month: monthKey(m),
      work_hr_bpm: rows[0]?.hr != null ? Math.round(rows[0].hr) : null,
      work_pace_sec_per_km: rows[0]?.pace != null ? Math.round(rows[0].pace) : null,
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
      -- Un max no lo puede ganar una recuperación, así que aquí el filtro no
      -- corrige nada: está por coherencia, para que las cinco lecturas de este
      -- fichero pregunten lo mismo y nadie tenga que averiguar por qué una no.
      and ${SEG_IS_WORK_EFFORT(client)}
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

/**
 * The 90-day disposition trend, from three bulk reads and ONE formula.
 *
 * What it replaces, and why every line of it was wrong:
 *
 *  · It selected `(select tss from daily_load) as tsb` — a column named for the
 *    BALANCE holding a single day's LOAD. The two are not the same magnitude:
 *    fed through a scale built for TSB ∈ [−10, +10], any day with 10 TSS or more
 *    pinned the freshness band at its 40-point maximum, so the more an athlete
 *    trained the fresher the bar said they were.
 *  · It read that from a table called `training_load`, which does not exist in
 *    this database and never has. Every one of the thirty queries threw, and
 *    `safeCall` swallowed it, so the panel had been silently empty in production
 *    rather than wrong — the failure mode that hides for months.
 *  · It handed out 20 / 20 / 12 / 5 points when a reading was missing, and the
 *    HRV band unconditionally: `hrvPts = 12`, with the HRV row selected and then
 *    ignored. 12 of a maximum of 12.
 *  · Its four ceilings summed to 92, under a headline reading "/ 100".
 *
 * Now: `shared/domain/coach/race-readiness.ts` scores it, the same function the
 * roster and the ficha call, so the newest point of this trend IS the number on
 * the athlete's other screens.
 */
async function loadRaceReadiness(
  client: Sql,
  athlete_id: number,
  now: Date,
): Promise<RaceReadinessPoint[]> {
  const samples: RaceReadinessSample[] = [];
  for (let i = READINESS_TREND_DAYS - 1; i >= 0; i -= READINESS_TREND_STEP_DAYS) {
    const at = addDays(now, -i);
    samples.push({ iso_date: at.toISOString().slice(0, 10), at });
  }
  const oldest = samples[0];
  if (!oldest) return [];

  // Each point is read over its OWN trailing 90-day load window, so the series
  // must reach a further 90 days back than the oldest point — otherwise the old
  // end of the trend is computed off a colder EWMA than the new end and the
  // curve slopes for a reason that has nothing to do with the athlete.
  const [series, assignments, hrv] = await Promise.all([
    getDailyTssSeries({
      athlete_id,
      end_date: now,
      days: READINESS_TREND_DAYS + READINESS_LOAD_WINDOW_DAYS,
      client,
    }),
    loadDailyAssignmentCounts({
      athlete_id,
      on_date: now,
      days: READINESS_TREND_DAYS + READINESS_COMPLIANCE_DAYS,
      client,
    }),
    loadHrvSamples(client, athlete_id, now, READINESS_TREND_DAYS + HRV_BASELINE_FROM_DAYS),
  ]);

  return buildRaceReadinessHistory({ series, assignments, hrv, samples });
}

/** Raw HRV readings over the span. Raw, because the baseline windows are instants. */
async function loadHrvSamples(
  client: Sql,
  athlete_id: number,
  now: Date,
  days: number,
): Promise<HrvSample[]> {
  const rows = await client<Array<{ at: Date; v: number }>>`
    select recorded_at as at, value_numeric::float as v
    from biometric_streams
    where athlete_id = ${athlete_id}
      and metric_type::text = 'hrv'
      and recorded_at >= ${addDays(now, -days).toISOString()}::timestamptz
      and value_numeric is not null
    order by recorded_at
  `;
  return rows.map((r) => ({ at: r.at, value: r.v }));
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
