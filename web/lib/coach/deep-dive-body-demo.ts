// Body demo data — Marc Vidal, REAL block w1. Deterministic seeded series
// so the screen looks the same each demo. Spec /docs/ux/13-deep-dive-sub-tabs.md.

import type { BodyPayload, BodyPoint, SleepNight, Vo2MaxPoint, WellnessMetric, CompositionSnapshot } from './deep-dive-body';

const DEMO_GENERATED_AT = '2026-05-08T08:00:00.000Z';

function pseudoRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function seededSeries(opts: {
  days: number;
  baseline: number;
  amplitude: number;
  drift?: number;
  seed: number;
  decimals?: number;
}): BodyPoint[] {
  const rand = pseudoRandom(opts.seed);
  const today = new Date(DEMO_GENERATED_AT);
  const out: BodyPoint[] = [];
  for (let i = opts.days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const t = (opts.days - 1 - i) / (opts.days - 1);
    const drift = (opts.drift ?? 0) * t;
    const v = opts.baseline + drift + (rand() - 0.5) * opts.amplitude;
    out.push({
      iso_date: d.toISOString().slice(0, 10),
      value: Math.round(v * Math.pow(10, opts.decimals ?? 1)) / Math.pow(10, opts.decimals ?? 1),
    });
  }
  return out;
}

function rollingAverage(points: ReadonlyArray<BodyPoint>, window: number): BodyPoint[] {
  const out: BodyPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1);
    const vals = slice.map((p) => p.value).filter((v): v is number => v != null);
    out.push({
      iso_date: points[i].iso_date,
      value: vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null,
    });
  }
  return out;
}

const HRV_DAILY = seededSeries({ days: 90, baseline: 64, amplitude: 14, drift: -2, seed: 23, decimals: 0 });
const HRV_BASE = rollingAverage(HRV_DAILY, 28);
const RHR_DAILY = seededSeries({ days: 90, baseline: 48, amplitude: 5, drift: 0, seed: 31, decimals: 0 });
const RHR_BASE = rollingAverage(RHR_DAILY, 30);
const WEIGHT_DAILY = seededSeries({ days: 90, baseline: 78.4, amplitude: 0.6, drift: -0.3, seed: 47, decimals: 1 });
const WEIGHT_WEEKLY = (() => {
  const out: BodyPoint[] = [];
  for (let i = 0; i < 12; i++) {
    const slice = WEIGHT_DAILY.slice(WEIGHT_DAILY.length - (i + 1) * 7, WEIGHT_DAILY.length - i * 7);
    const vals = slice.map((p) => p.value).filter((v): v is number => v != null);
    out.unshift({
      iso_date: slice[0]?.iso_date ?? '',
      value: vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null,
    });
  }
  return out;
})();
const FAT_DAILY = seededSeries({ days: 90, baseline: 11.4, amplitude: 0.4, drift: -0.4, seed: 53, decimals: 1 });

function buildSleep(seed: number): SleepNight[] {
  const rand = pseudoRandom(seed);
  const today = new Date(DEMO_GENERATED_AT);
  const out: SleepNight[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const total = 6.4 + rand() * 1.6;
    const deep = total * (0.18 + rand() * 0.06);
    const rem = total * (0.20 + rand() * 0.08);
    const light = Math.max(0, total - deep - rem);
    const eff = 84 + rand() * 12;
    const wakeups = Math.round(rand() * 3);
    const bedM = 22 * 60 + 50 + Math.round((rand() - 0.5) * 70);
    const wakeM = bedM + Math.round(total * 60);
    out.push({
      iso_date: d.toISOString().slice(0, 10),
      total_hours: round1(total),
      deep_hours: round1(deep),
      rem_hours: round1(rem),
      light_hours: round1(light),
      efficiency_pct: Math.round(eff),
      wakeups,
      bedtime_iso: timeFromMin(bedM),
      waketime_iso: timeFromMin(wakeM % (24 * 60)),
    });
  }
  return out;
}
const SLEEP_NIGHTS = buildSleep(67);

function buildVo2(): Vo2MaxPoint[] {
  const today = new Date(DEMO_GENERATED_AT);
  const out: Vo2MaxPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const ym = `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`;
    const t = (11 - i) / 11;
    const v = 56.4 + t * 4.8;
    let annotation: string | null = null;
    // Anotaciones de DEMO: marcan cambios de microciclo, sin nombrar ninguna
    // escuela de periodización (el nombre real lo pone el coach).
    if (i === 6 || i === 2 || i === 0) annotation = 'Cambio de microciclo';
    out.push({ iso_month: ym, value_ml_kg_min: round1(v), source: 'garmin', annotation });
  }
  return out;
}
const VO2 = buildVo2();

const DEXA: CompositionSnapshot[] = [
  { iso_date: '2026-04-22', weight_kg: 78.1, body_fat_pct: 11.4, source: 'dexa' },
  { iso_date: '2026-01-12', weight_kg: 79.0, body_fat_pct: 12.6, source: 'dexa' },
  { iso_date: '2025-10-08', weight_kg: 80.3, body_fat_pct: 13.5, source: 'dexa' },
];

const WELLNESS: WellnessMetric[] = (['soreness', 'mood', 'motivation', 'fatigue', 'sleep_quality'] as const).map((key, idx) => {
  const labels: Record<WellnessMetric['key'], string> = {
    soreness: 'Soreness', mood: 'Ánimo', motivation: 'Motivación', fatigue: 'Fatiga', sleep_quality: 'Calidad sueño',
  };
  const baselines: Record<WellnessMetric['key'], number> = {
    soreness: 2.6, mood: 4.0, motivation: 4.2, fatigue: 2.8, sleep_quality: 3.8,
  };
  const series = seededSeries({ days: 30, baseline: baselines[key], amplitude: 1.2, seed: 71 + idx * 13, decimals: 1 })
    .map((p) => ({ ...p, value: p.value == null ? null : Math.max(1, Math.min(5, p.value)) }));
  const vals = series.map((p) => p.value).filter((v): v is number => v != null);
  const avg = vals.length > 0 ? round1(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  const recent = vals.slice(-7).reduce((s, v) => s + v, 0) / Math.max(1, vals.slice(-7).length);
  const earlier = vals.slice(0, -7).reduce((s, v) => s + v, 0) / Math.max(1, vals.slice(0, -7).length);
  const trend: WellnessMetric['trend'] =
    recent > earlier + 0.15 ? 'up' : recent < earlier - 0.15 ? 'down' : 'flat';
  return { key, label: labels[key], series, avg, trend };
});

const MARC_BODY: BodyPayload = {
  generated_at_iso: DEMO_GENERATED_AT,
  is_demo: true,
  athlete_id: 'demo-1',
  athlete_name: 'Marc Vidal',
  hrv: {
    daily: HRV_DAILY,
    baseline_28d: HRV_BASE,
    current_baseline_ms: lastNonNull(HRV_BASE),
    drops_count: countCrossings(HRV_DAILY, HRV_BASE, -10),
    spikes_count: countCrossings(HRV_DAILY, HRV_BASE, +10),
    last_value_ms: lastNonNull(HRV_DAILY),
    last_delta_ms: ((): number | null => {
      const a = lastNonNull(HRV_DAILY);
      const b = lastNonNull(HRV_BASE);
      return a != null && b != null ? Math.round(a - b) : null;
    })(),
    rmssd_avg_ms: 58,
    sdnn_avg_ms: 72,
  },
  sleep: {
    nights: SLEEP_NIGHTS,
    avg_total_hours: 7.2,
    avg_efficiency_pct: 90,
    avg_wakeups: 1,
    bedtime_variance_min: 22,
    waketime_variance_min: 18,
  },
  rhr: {
    daily: RHR_DAILY,
    baseline_30d: lastNonNull(RHR_BASE),
    trend_30d: 'flat',
    delta_30d_bpm: 1,
    last_bpm: lastNonNull(RHR_DAILY),
  },
  vo2max: {
    monthly: VO2,
    current_value: VO2[VO2.length - 1].value_ml_kg_min ?? null,
    delta_3m: round1((VO2[VO2.length - 1].value_ml_kg_min ?? 0) - (VO2[VO2.length - 4].value_ml_kg_min ?? 0)),
  },
  composition: {
    weight_daily: WEIGHT_DAILY,
    weight_weekly_avg: WEIGHT_WEEKLY,
    current_weight_kg: lastNonNull(WEIGHT_DAILY),
    weight_delta_30d_kg: round1((lastNonNull(WEIGHT_DAILY) ?? 0) - (WEIGHT_DAILY[WEIGHT_DAILY.length - 30]?.value ?? 0)),
    body_fat_pct: lastNonNull(FAT_DAILY),
    body_fat_delta_30d_pct: round1((lastNonNull(FAT_DAILY) ?? 0) - (FAT_DAILY[FAT_DAILY.length - 30]?.value ?? 0)),
    dexa_snapshots: DEXA,
    hydration_avg_l: 3,
  },
  wellness: {
    metrics: WELLNESS,
    checkins_done_30d: 26,
    checkins_total_30d: 30,
  },
};

export function getMarcBody(athleteId: string): BodyPayload | null {
  if (athleteId === 'demo-1') return MARC_BODY;
  if (athleteId === 'demo-2') return { ...MARC_BODY, athlete_id: 'demo-2', athlete_name: 'Sara Puig' };
  if (athleteId.startsWith('demo-')) {
    return { ...MARC_BODY, athlete_id: athleteId, athlete_name: 'Atleta demo' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lastNonNull(points: ReadonlyArray<BodyPoint>): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const v = points[i].value;
    if (v != null) return Math.round(v);
  }
  return null;
}
function countCrossings(daily: ReadonlyArray<BodyPoint>, baseline: ReadonlyArray<BodyPoint>, threshold: number): number {
  let n = 0;
  for (let i = 0; i < daily.length; i++) {
    const d = daily[i].value;
    const b = baseline[i].value;
    if (d == null || b == null) continue;
    const diff = d - b;
    if (threshold < 0 && diff <= threshold) n += 1;
    if (threshold > 0 && diff >= threshold) n += 1;
  }
  return n;
}
function round1(n: number): number { return Math.round(n * 10) / 10; }
function timeFromMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
