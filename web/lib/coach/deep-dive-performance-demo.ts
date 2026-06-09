// Demo Performance payload — Marc Vidal worked example. Same anchor as the
// Resumen demo (08/05/26, REAL block w1).

import type {
  PerformancePayload,
  ExerciseTimeSeries,
  ExerciseAttempt,
  PolarizationByWindow,
  PolarizationPct,
  RunningEconomyPoint,
  LtPoint,
  AnaerobicPoint,
  HyroxPrediction,
  RaceReadinessPoint,
} from './deep-dive-performance';

const DEMO_GENERATED_AT = '2026-05-08T08:00:00.000Z';

function pseudoRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function buildAttempts(
  baselineSec: number,
  improvementPct: number,
  weeks: number,
  seed: number,
  variability: number,
): ExerciseAttempt[] {
  const rand = pseudoRandom(seed);
  const out: ExerciseAttempt[] = [];
  const today = new Date(DEMO_GENERATED_AT);
  let runningBest = baselineSec * 1.05;
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 7 * 86_400_000);
    const t = (weeks - 1 - i) / (weeks - 1);
    const target = baselineSec * (1 + (1 - t) * improvementPct);
    const drift = (rand() - 0.5) * variability;
    const best = Math.max(baselineSec * 0.8, target + drift);
    const avg = best * (1 + 0.04 + rand() * 0.04);
    const isPr = best < runningBest;
    if (isPr) runningBest = best;
    out.push({
      iso_date: d.toISOString().slice(0, 10),
      best_seconds: Math.round(best),
      avg_seconds: Math.round(avg),
      is_pr: isPr,
      is_test: i % 4 === 0,
    });
  }
  return out;
}

const EXERCISES: ExerciseTimeSeries[] = [
  {
    exercise_slug: 'run-1km-threshold',
    exercise_label: 'Run threshold 1km',
    category: 'running',
    attempts: buildAttempts(238, -0.04, 26, 11, 6),
    best_seconds: 230, median_seconds: 240, variability_cv: 0.04, pr_count: 4,
  },
  {
    exercise_slug: 'run-3min-allout',
    exercise_label: 'Run 3min all-out',
    category: 'running',
    attempts: buildAttempts(180, -0.05, 12, 17, 4),
    best_seconds: 171, median_seconds: 178, variability_cv: 0.03, pr_count: 3,
  },
  {
    exercise_slug: 'wall-ball-9kg-50',
    exercise_label: 'Wall ball 9kg/50',
    category: 'hyrox',
    attempts: buildAttempts(96, -0.06, 24, 23, 8),
    best_seconds: 84, median_seconds: 102, variability_cv: 0.07, pr_count: 5,
  },
  {
    exercise_slug: 'sled-push-50kg-100m',
    exercise_label: 'Sled push 50kg/100m',
    category: 'hyrox',
    attempts: buildAttempts(60, -0.05, 24, 29, 5),
    best_seconds: 53, median_seconds: 58, variability_cv: 0.06, pr_count: 4,
  },
  {
    exercise_slug: 'row-1km',
    exercise_label: 'Row 1km',
    category: 'hyrox',
    attempts: buildAttempts(228, -0.03, 24, 31, 6),
    best_seconds: 222, median_seconds: 228, variability_cv: 0.03, pr_count: 3,
  },
  {
    exercise_slug: 'burpee-bbj-80m',
    exercise_label: 'Burpee BBJ 80m',
    category: 'hyrox',
    attempts: buildAttempts(204, -0.04, 24, 37, 9),
    best_seconds: 190, median_seconds: 204, variability_cv: 0.05, pr_count: 4,
  },
  {
    exercise_slug: 'back-squat-1rm',
    exercise_label: 'Back squat 1RM (kg)',
    category: 'strength',
    attempts: buildSquatAttempts(140, 0.08, 12, 41),
    best_seconds: 140, median_seconds: 132, variability_cv: 0.04, pr_count: 3,
  },
  {
    exercise_slug: 'deadlift-1rm',
    exercise_label: 'Deadlift 1RM (kg)',
    category: 'strength',
    attempts: buildSquatAttempts(180, 0.05, 12, 43),
    best_seconds: 180, median_seconds: 174, variability_cv: 0.03, pr_count: 2,
  },
];

function buildSquatAttempts(top: number, range: number, weeks: number, seed: number): ExerciseAttempt[] {
  const rand = pseudoRandom(seed);
  const out: ExerciseAttempt[] = [];
  const today = new Date(DEMO_GENERATED_AT);
  let runningBest = 0;
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 7 * 86_400_000);
    const t = (weeks - 1 - i) / (weeks - 1);
    const v = top * (1 - range * (1 - t)) + (rand() - 0.5) * 5;
    const isPr = v > runningBest;
    if (isPr) runningBest = v;
    out.push({
      iso_date: d.toISOString().slice(0, 10),
      best_seconds: Math.round(v),
      avg_seconds: Math.round(v * 0.95),
      is_pr: isPr,
      is_test: i % 4 === 0,
    });
  }
  return out;
}

const POLARIZATION_BY_WINDOW: PolarizationByWindow[] = [
  { window: '7d',  pct: { low: 78, mid: 8, high: 14 }, drift_vs_target: 24, trend: 'flat' },
  { window: '14d', pct: { low: 80, mid: 6, high: 14 }, drift_vs_target: 18, trend: 'up' },
  { window: '28d', pct: { low: 82, mid: 5, high: 13 }, drift_vs_target: 16, trend: 'up' },
  { window: '90d', pct: { low: 79, mid: 8, high: 13 }, drift_vs_target: 23, trend: 'flat' },
];

const POLARIZATION_HISTORY: Array<{ iso_date: string; pct: PolarizationPct }> = (() => {
  const today = new Date(DEMO_GENERATED_AT);
  const out: Array<{ iso_date: string; pct: PolarizationPct }> = [];
  const rand = pseudoRandom(53);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 7 * 86_400_000);
    const low = 76 + Math.round(rand() * 8);
    const high = 12 + Math.round(rand() * 6);
    const mid = Math.max(0, 100 - low - high);
    out.push({ iso_date: d.toISOString().slice(0, 10), pct: { low, mid, high } });
  }
  return out;
})();

const RUNNING_ECONOMY: RunningEconomyPoint[] = (() => {
  const today = new Date(DEMO_GENERATED_AT);
  const out: RunningEconomyPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const t = (11 - i) / 11;
    const pace = 360 - t * 24 + (i % 2 === 0 ? 4 : -2);
    out.push({ iso_month: monthKey(m), pace_at_145bpm_sec_per_km: Math.round(pace) });
  }
  return out;
})();

const LT_HISTORY: LtPoint[] = (() => {
  const today = new Date(DEMO_GENERATED_AT);
  const out: LtPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const t = (11 - i) / 11;
    out.push({
      iso_month: monthKey(m),
      lt_hr_bpm: Math.round(168 + t * 4),
      lt_pace_sec_per_km: Math.round(254 - t * 14),
    });
  }
  return out;
})();

const ANAEROBIC: AnaerobicPoint[] = (() => {
  const today = new Date(DEMO_GENERATED_AT);
  const out: AnaerobicPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 60 * 86_400_000);
    out.push({
      iso_date: d.toISOString().slice(0, 10),
      best_3min_avg_w: 380 + (5 - i) * 8,
      critical_power_w: 318 + (5 - i) * 4,
      w_prime_kj: 18 + (5 - i) * 0.6,
    });
  }
  return out;
})();

const HYROX_PREDICTION: HyroxPrediction = {
  predicted_total_seconds: 4002, // 1:06:42
  goal_total_seconds: 3900,      // 1:05:00
  delta_to_goal_seconds: 102,
  stations: [
    { station_label: 'Run 1km',          predicted_seconds: 245, best_seconds: 234, delta_to_best_seconds: 11 },
    { station_label: 'Ski erg 1km',      predicted_seconds: 240, best_seconds: 235, delta_to_best_seconds: 5 },
    { station_label: 'Sled push 50kg',   predicted_seconds: 60,  best_seconds: 53,  delta_to_best_seconds: 7 },
    { station_label: 'Sled pull 50kg',   predicted_seconds: 75,  best_seconds: 68,  delta_to_best_seconds: 7 },
    { station_label: 'Burpee BBJ 80m',   predicted_seconds: 210, best_seconds: 190, delta_to_best_seconds: 20 },
    { station_label: 'Row 1km',          predicted_seconds: 230, best_seconds: 222, delta_to_best_seconds: 8 },
    { station_label: 'Farmers 200m',     predicted_seconds: 75,  best_seconds: 70,  delta_to_best_seconds: 5 },
    { station_label: 'Sandbag lunges',   predicted_seconds: 195, best_seconds: 178, delta_to_best_seconds: 17 },
    { station_label: 'Wall balls 100',   predicted_seconds: 270, best_seconds: 248, delta_to_best_seconds: 22 },
  ],
};

const RACE_READINESS_HISTORY: RaceReadinessPoint[] = (() => {
  const today = new Date(DEMO_GENERATED_AT);
  const out: RaceReadinessPoint[] = [];
  const rand = pseudoRandom(67);
  for (let i = 89; i >= 0; i -= 3) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const t = (89 - i) / 89;
    const score = 60 + t * 18 + (rand() - 0.5) * 6;
    out.push({
      iso_date: d.toISOString().slice(0, 10),
      score: Math.round(Math.max(0, Math.min(100, score))),
      inputs: {
        tsb_pts: Math.round(20 + t * 15),
        compliance_pts: Math.round(22 + t * 5),
        hrv_pts: Math.round(10 + t * 5),
        sessions_pts: Math.round(7 + t * 1),
      },
      block_transition_label: i === 36 ? 'TRANS start' : i === 14 ? 'REAL start' : null,
      event_label: null,
    });
  }
  return out;
})();

const MARC_PERFORMANCE: PerformancePayload = {
  generated_at_iso: DEMO_GENERATED_AT,
  is_demo: true,
  athlete_id: 'demo-1',
  athlete_name: 'Marc Vidal',
  exercises: EXERCISES,
  polarization_by_window: POLARIZATION_BY_WINDOW,
  polarization_history: POLARIZATION_HISTORY,
  running_economy: RUNNING_ECONOMY,
  lt_history: LT_HISTORY,
  anaerobic_capacity: ANAEROBIC,
  hyrox_prediction: HYROX_PREDICTION,
  race_readiness_history: RACE_READINESS_HISTORY,
};

export function getMarcPerformance(athleteId: string): PerformancePayload | null {
  if (athleteId === 'demo-1') return MARC_PERFORMANCE;
  if (athleteId === 'demo-2') return { ...MARC_PERFORMANCE, athlete_id: 'demo-2', athlete_name: 'Sara Puig' };
  if (athleteId.startsWith('demo-')) {
    return { ...MARC_PERFORMANCE, athlete_id: athleteId, athlete_name: 'Atleta demo' };
  }
  return null;
}

export function getDemoPerformanceFallback(athleteId: string, fullName: string): PerformancePayload {
  return { ...MARC_PERFORMANCE, athlete_id: athleteId, athlete_name: fullName, is_demo: true };
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
