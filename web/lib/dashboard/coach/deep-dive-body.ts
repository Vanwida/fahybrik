// Body sub-tab payload — deep biometric history for a single athlete.
// HRV, sleep architecture, RHR, VO2max trend, body composition, subjective
// wellness check-ins. Pre-formatted server-side so the client component is
// purely visual.
//
// Ported from web/lib/coach/deep-dive-body.ts and trimmed: no demo branches
// (coach dashboard route validates numeric id upstream).

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

const HRV_DAYS = 90;
const SLEEP_DAYS = 30;
const RHR_DAYS = 90;
const VO2MAX_MONTHS = 12;
const WEIGHT_DAYS = 90;
const WELLNESS_DAYS = 30;

export class AthleteAnalyticsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AthleteAnalyticsError';
  }
}

export interface BodyPoint {
  iso_date: string;
  value: number | null;
}

export interface HrvSection {
  daily: BodyPoint[];
  baseline_28d: BodyPoint[];
  current_baseline_ms: number | null;
  drops_count: number;
  spikes_count: number;
  last_value_ms: number | null;
  last_delta_ms: number | null;
  rmssd_avg_ms: number | null;
  sdnn_avg_ms: number | null;
}

export interface SleepNight {
  iso_date: string;
  total_hours: number | null;
  deep_hours: number | null;
  rem_hours: number | null;
  light_hours: number | null;
  efficiency_pct: number | null;
  wakeups: number | null;
  bedtime_iso: string | null;
  waketime_iso: string | null;
}

export interface SleepSection {
  nights: SleepNight[];
  avg_total_hours: number | null;
  avg_efficiency_pct: number | null;
  avg_wakeups: number | null;
  bedtime_variance_min: number | null;
  waketime_variance_min: number | null;
}

export interface RhrSection {
  daily: BodyPoint[];
  baseline_30d: number | null;
  trend_30d: 'up' | 'down' | 'flat' | null;
  delta_30d_bpm: number | null;
  last_bpm: number | null;
}

export interface Vo2MaxPoint {
  iso_month: string;
  value_ml_kg_min: number | null;
  source: 'garmin' | 'apple' | 'estimate' | null;
  annotation: string | null;
}

export interface Vo2MaxSection {
  monthly: Vo2MaxPoint[];
  current_value: number | null;
  delta_3m: number | null;
}

export interface CompositionSnapshot {
  iso_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  source: 'scale' | 'dexa' | 'self_report';
}

export interface CompositionSection {
  weight_daily: BodyPoint[];
  weight_weekly_avg: BodyPoint[];
  current_weight_kg: number | null;
  weight_delta_30d_kg: number | null;
  body_fat_pct: number | null;
  body_fat_delta_30d_pct: number | null;
  dexa_snapshots: CompositionSnapshot[];
  hydration_avg_l: number | null;
}

export interface WellnessMetric {
  key: 'soreness' | 'mood' | 'motivation' | 'fatigue' | 'sleep_quality';
  label: string;
  series: BodyPoint[];
  avg: number | null;
  trend: 'up' | 'down' | 'flat' | null;
}

export interface WellnessSection {
  metrics: WellnessMetric[];
  checkins_done_30d: number;
  checkins_total_30d: number;
}

export interface BodyPayload {
  generated_at_iso: string;
  athlete_id: string;
  athlete_name: string;
  has_any_data: boolean;
  hrv: HrvSection;
  sleep: SleepSection;
  rhr: RhrSection;
  vo2max: Vo2MaxSection;
  composition: CompositionSection;
  wellness: WellnessSection;
}

export async function buildAthleteBody(params: {
  coach_id: number | bigint;
  athlete_id: number;
  now?: Date;
  client?: Sql;
}): Promise<BodyPayload> {
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

  const emptyDailyHrv = buildEmptyDaily(now, HRV_DAYS);
  const hrvDaily = await safeCall(
    () => loadDailyMetric(client, params.athlete_id, 'hrv', now, HRV_DAYS),
    emptyDailyHrv,
  );
  const baseline28 = rollingAverage(hrvDaily, 28);
  const drops = countCrossings(hrvDaily, baseline28, -10);
  const spikes = countCrossings(hrvDaily, baseline28, +10);
  const lastValue = lastNonNull(hrvDaily);
  const lastBaseline = lastNonNull(baseline28);
  const rmssd = await safeCall(
    () => loadAvg(client, params.athlete_id, 'hrv_rmssd', now, 30),
    null as number | null,
  );
  const sdnn = await safeCall(
    () => loadAvg(client, params.athlete_id, 'hrv_sdnn', now, 30),
    null as number | null,
  );

  const hrv: HrvSection = {
    daily: hrvDaily,
    baseline_28d: baseline28,
    current_baseline_ms: lastBaseline,
    drops_count: drops,
    spikes_count: spikes,
    last_value_ms: lastValue,
    last_delta_ms:
      lastValue != null && lastBaseline != null ? Math.round(lastValue - lastBaseline) : null,
    rmssd_avg_ms: rmssd,
    sdnn_avg_ms: sdnn,
  };

  const sleep = await safeCall(
    () => loadSleep(client, params.athlete_id, now, SLEEP_DAYS),
    emptySleep(now, SLEEP_DAYS),
  );
  const rhrDaily = await safeCall(
    () => loadDailyMetric(client, params.athlete_id, 'hr_resting', now, RHR_DAYS),
    buildEmptyDaily(now, RHR_DAYS),
  );
  const baseline30 = rollingAverage(rhrDaily, 30);
  const lastRhr = lastNonNull(rhrDaily);
  const baselineNow = lastNonNull(baseline30);
  const trend =
    baselineNow != null && lastRhr != null
      ? lastRhr > baselineNow + 1
        ? 'up'
        : lastRhr < baselineNow - 1
          ? 'down'
          : 'flat'
      : null;
  const rhr: RhrSection = {
    daily: rhrDaily,
    baseline_30d: baselineNow,
    trend_30d: trend,
    delta_30d_bpm:
      baselineNow != null && lastRhr != null ? Math.round(lastRhr - baselineNow) : null,
    last_bpm: lastRhr,
  };

  const vo2max = await safeCall(
    () => loadVo2Max(client, params.athlete_id, now, VO2MAX_MONTHS),
    emptyVo2Max(now, VO2MAX_MONTHS),
  );
  const composition = await safeCall(
    () => loadComposition(client, params.athlete_id, now, WEIGHT_DAYS),
    emptyComposition(now, WEIGHT_DAYS),
  );
  const wellness = await safeCall(
    () => loadWellness(client, params.athlete_id, now, WELLNESS_DAYS),
    emptyWellness(now, WELLNESS_DAYS),
  );

  const has_any_data =
    hrv.last_value_ms != null ||
    sleep.avg_total_hours != null ||
    rhr.last_bpm != null ||
    vo2max.current_value != null ||
    composition.current_weight_kg != null ||
    wellness.checkins_done_30d > 0;

  return {
    generated_at_iso: now.toISOString(),
    athlete_id: String(params.athlete_id),
    athlete_name: header[0]!.full_name, // guarded by header.length===0 check above
    has_any_data,
    hrv,
    sleep,
    rhr,
    vo2max,
    composition,
    wellness,
  };
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

async function loadDailyMetric(
  client: Sql,
  athlete_id: number,
  metric: string,
  now: Date,
  days: number,
): Promise<BodyPoint[]> {
  const startIso = addDays(now, -(days - 1)).toISOString();
  // Cast metric_type to text so we can query by string without hitting enum
  // validation. Keeps the lib drift-tolerant when the enum gains new values
  // before this code is updated.
  const rows = await client<Array<{ d: string; v: number | null }>>`
    select to_char(date_trunc('day', recorded_at)::date, 'YYYY-MM-DD') as d,
           avg(value_numeric)::float as v
    from biometric_streams
    where athlete_id = ${athlete_id}
      and metric_type::text = ${metric}
      and recorded_at >= ${startIso}::timestamptz
    group by 1
    order by 1
  `;
  const byDate = new Map(rows.map((r) => [r.d, r.v]));
  const out: BodyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(now, -i);
    const key = isoDate(day);
    out.push({ iso_date: key, value: byDate.get(key) ?? null });
  }
  return out;
}

async function loadAvg(
  client: Sql,
  athlete_id: number,
  metric: string,
  now: Date,
  days: number,
): Promise<number | null> {
  const rows = await client<Array<{ v: number | null }>>`
    select avg(value_numeric)::float as v from biometric_streams
    where athlete_id = ${athlete_id} and metric_type::text = ${metric}
      and recorded_at >= ${addDays(now, -days).toISOString()}::timestamptz
  `;
  const v = rows[0]?.v;
  return v == null ? null : Math.round(v);
}

async function loadSleep(
  client: Sql,
  athlete_id: number,
  now: Date,
  days: number,
): Promise<SleepSection> {
  const startIso = addDays(now, -(days - 1)).toISOString();
  // Note: biometric_streams stores only value_numeric. Bedtime/waketime, if
  // ever recorded, would arrive via raw_payload_json. We read them as JSON
  // text to stay forward-compatible while keeping the query schema-safe.
  const rows = await client<
    Array<{
      d: string;
      total_s: number | null;
      deep_s: number | null;
      rem_s: number | null;
      light_s: number | null;
      eff: number | null;
      wakeups: number | null;
      bedtime: string | null;
      waketime: string | null;
    }>
  >`
    select to_char(date_trunc('day', recorded_at)::date, 'YYYY-MM-DD') as d,
           max(case when metric_type = 'sleep_duration'   then value_numeric end)::float as total_s,
           max(case when metric_type = 'sleep_deep'       then value_numeric end)::float as deep_s,
           max(case when metric_type = 'sleep_rem'        then value_numeric end)::float as rem_s,
           max(case when metric_type = 'sleep_light'      then value_numeric end)::float as light_s,
           max(case when metric_type = 'sleep_efficiency' then value_numeric end)::float as eff,
           max(case when metric_type = 'sleep_wakeups'    then value_numeric end)::float as wakeups,
           max(case when metric_type = 'sleep_bedtime'    then raw_payload_json ->> 'time' end) as bedtime,
           max(case when metric_type = 'sleep_waketime'   then raw_payload_json ->> 'time' end) as waketime
    from biometric_streams
    where athlete_id = ${athlete_id}
      and metric_type::text in (
        'sleep_duration','sleep_deep','sleep_rem','sleep_light',
        'sleep_efficiency','sleep_wakeups','sleep_bedtime','sleep_waketime')
      and recorded_at >= ${startIso}::timestamptz
    group by 1
    order by 1
  `;

  const byDate = new Map(rows.map((r) => [r.d, r]));
  const nights: SleepNight[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(now, -i);
    const key = isoDate(day);
    const r = byDate.get(key);
    nights.push({
      iso_date: key,
      total_hours: r?.total_s != null ? round1(r.total_s / 3600) : null,
      deep_hours: r?.deep_s != null ? round1(r.deep_s / 3600) : null,
      rem_hours: r?.rem_s != null ? round1(r.rem_s / 3600) : null,
      light_hours: r?.light_s != null ? round1(r.light_s / 3600) : null,
      efficiency_pct: r?.eff != null ? Math.round(r.eff) : null,
      wakeups: r?.wakeups != null ? Math.round(r.wakeups) : null,
      bedtime_iso: r?.bedtime ?? null,
      waketime_iso: r?.waketime ?? null,
    });
  }

  const avg = (k: keyof SleepNight) => {
    const arr = nights.map((n) => n[k]).filter((v): v is number => typeof v === 'number');
    if (arr.length === 0) return null;
    return round1(arr.reduce((s, v) => s + v, 0) / arr.length);
  };
  const sd = (key: 'bedtime_iso' | 'waketime_iso'): number | null => {
    const minutes = nights
      .map((n) => parseTimeMin(n[key]))
      .filter((v): v is number => v != null);
    if (minutes.length < 2) return null;
    const m = minutes.reduce((s, v) => s + v, 0) / minutes.length;
    const variance = minutes.reduce((s, v) => s + (v - m) ** 2, 0) / minutes.length;
    return Math.round(Math.sqrt(variance));
  };

  return {
    nights,
    avg_total_hours: avg('total_hours'),
    avg_efficiency_pct: avg('efficiency_pct'),
    avg_wakeups: avg('wakeups'),
    bedtime_variance_min: sd('bedtime_iso'),
    waketime_variance_min: sd('waketime_iso'),
  };
}

async function loadVo2Max(
  client: Sql,
  athlete_id: number,
  now: Date,
  months: number,
): Promise<Vo2MaxSection> {
  const sinceIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1),
  ).toISOString();
  const rows = await client<Array<{ m: string; v: number | null }>>`
    select to_char(date_trunc('month', recorded_at)::date, 'YYYY-MM') as m,
           avg(value_numeric)::float as v
    from biometric_streams
    where athlete_id = ${athlete_id} and metric_type::text = 'vo2max'
      and recorded_at >= ${sinceIso}::timestamptz
    group by 1 order by 1
  `;
  const byMonth = new Map(rows.map((r) => [r.m, r.v]));
  const monthly: Vo2MaxPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const ym = monthKey(addMonths(now, -i));
    const v = byMonth.get(ym) ?? null;
    monthly.push({
      iso_month: ym,
      value_ml_kg_min: v != null ? round1(v) : null,
      source: v != null ? 'garmin' : null,
      annotation: null,
    });
  }
  const last = monthly[monthly.length - 1]?.value_ml_kg_min ?? null;
  const threeAgo = monthly[monthly.length - 4]?.value_ml_kg_min ?? null;
  return {
    monthly,
    current_value: last,
    delta_3m: last != null && threeAgo != null ? round1(last - threeAgo) : null,
  };
}

async function loadComposition(
  client: Sql,
  athlete_id: number,
  now: Date,
  days: number,
): Promise<CompositionSection> {
  const weight = await loadDailyMetric(client, athlete_id, 'weight_kg', now, days);
  const fat = await loadDailyMetric(client, athlete_id, 'body_fat_pct', now, days);
  const weeklyAvg: BodyPoint[] = [];
  for (let i = 0; i < 12; i++) {
    const slice = weight.slice(weight.length - (i + 1) * 7, weight.length - i * 7);
    const vals = slice.map((p) => p.value).filter((v): v is number => v != null);
    weeklyAvg.unshift({
      iso_date: slice[0]?.iso_date ?? '',
      value: vals.length > 0 ? round1(vals.reduce((s, v) => s + v, 0) / vals.length) : null,
    });
  }
  const lastW = lastNonNull(weight);
  const w30 = weight[weight.length - 30]?.value ?? null;
  const lastFat = lastNonNull(fat);
  const fat30 = fat[fat.length - 30]?.value ?? null;

  const dexa = await client<Array<{ d: string; w: number | null; bf: number | null }>>`
    select to_char(recorded_at::date, 'YYYY-MM-DD') as d,
           max(case when metric_type::text = 'weight_kg' then value_numeric end)::float as w,
           max(case when metric_type::text = 'body_fat_pct' then value_numeric end)::float as bf
    from biometric_streams
    where athlete_id = ${athlete_id}
      and source::text = 'manual_dexa'
    group by 1 order by 1 desc limit 6
  `;
  const dexaSnapshots: CompositionSnapshot[] = dexa.map((r) => ({
    iso_date: r.d,
    weight_kg: r.w != null ? round1(r.w) : null,
    body_fat_pct: r.bf != null ? round1(r.bf) : null,
    source: 'dexa',
  }));

  const hydration = await loadAvg(client, athlete_id, 'hydration_l', now, 7);

  return {
    weight_daily: weight,
    weight_weekly_avg: weeklyAvg,
    current_weight_kg: lastW,
    weight_delta_30d_kg: lastW != null && w30 != null ? round1(lastW - w30) : null,
    body_fat_pct: lastFat,
    body_fat_delta_30d_pct: lastFat != null && fat30 != null ? round1(lastFat - fat30) : null,
    dexa_snapshots: dexaSnapshots,
    hydration_avg_l: hydration,
  };
}

async function loadWellness(
  client: Sql,
  athlete_id: number,
  now: Date,
  days: number,
): Promise<WellnessSection> {
  const startIso = addDays(now, -(days - 1)).toISOString();
  const rows = await client<
    Array<{
      d: string;
      soreness: number | null;
      mood: number | null;
      motivation: number | null;
      fatigue: number | null;
      sleep: number | null;
    }>
  >`
    select to_char((n.created_at)::date, 'YYYY-MM-DD') as d,
           avg((n.payload_json -> 'metrics' ->> 'soreness')::float)   as soreness,
           avg((n.payload_json -> 'metrics' ->> 'mood')::float)       as mood,
           avg((n.payload_json -> 'metrics' ->> 'motivation')::float) as motivation,
           avg((n.payload_json -> 'metrics' ->> 'fatigue')::float)    as fatigue,
           avg((n.payload_json -> 'metrics' ->> 'sleep_quality')::float) as sleep
    from notifications n
    where n.type = 'system'
      and n.payload_json ->> 'kind' = 'daily_checkin'
      and (n.payload_json ->> 'athlete_id')::bigint = ${athlete_id}
      and n.created_at >= ${startIso}::timestamptz
    group by 1
    order by 1
  `;
  const byDate = new Map(rows.map((r) => [r.d, r]));

  const series = (
    key: 'soreness' | 'mood' | 'motivation' | 'fatigue' | 'sleep',
  ): BodyPoint[] => {
    const out: BodyPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = addDays(now, -i);
      const k = isoDate(day);
      const r = byDate.get(k);
      out.push({ iso_date: k, value: r?.[key] != null ? round1(r[key] as number) : null });
    }
    return out;
  };

  const labels: Record<WellnessMetric['key'], string> = {
    soreness: 'Soreness',
    mood: 'Ánimo',
    motivation: 'Motivación',
    fatigue: 'Fatiga',
    sleep_quality: 'Calidad sueño',
  };

  const metrics: WellnessMetric[] = (
    ['soreness', 'mood', 'motivation', 'fatigue', 'sleep_quality'] as const
  ).map((k) => {
    const seriesKey = k === 'sleep_quality' ? 'sleep' : k;
    const s = series(seriesKey);
    const vals = s.map((p) => p.value).filter((v): v is number => v != null);
    const avg = vals.length > 0 ? round1(vals.reduce((sum, v) => sum + v, 0) / vals.length) : null;
    const recent = vals.slice(-7);
    const earlier = vals.slice(0, Math.max(1, vals.length - 7));
    const recentAvg =
      recent.length > 0 ? recent.reduce((sum, v) => sum + v, 0) / recent.length : null;
    const earlierAvg =
      earlier.length > 0 ? earlier.reduce((sum, v) => sum + v, 0) / earlier.length : null;
    let trend: WellnessMetric['trend'] = null;
    if (recentAvg != null && earlierAvg != null) {
      trend =
        recentAvg > earlierAvg + 0.2 ? 'up' : recentAvg < earlierAvg - 0.2 ? 'down' : 'flat';
    }
    return { key: k, label: labels[k], series: s, avg, trend };
  });

  return {
    metrics,
    checkins_done_30d: rows.length,
    checkins_total_30d: days,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rollingAverage(points: ReadonlyArray<BodyPoint>, window: number): BodyPoint[] {
  const out: BodyPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1);
    const vals = slice.map((p) => p.value).filter((v): v is number => v != null);
    out.push({
      iso_date: points[i]!.iso_date, // i < points.length
      value: vals.length > 0 ? round1(vals.reduce((s, v) => s + v, 0) / vals.length) : null,
    });
  }
  return out;
}

function countCrossings(
  daily: ReadonlyArray<BodyPoint>,
  baseline: ReadonlyArray<BodyPoint>,
  threshold: number,
): number {
  let n = 0;
  // baseline is produced by rollingAverage(daily, _) so baseline.length === daily.length.
  for (let i = 0; i < daily.length; i++) {
    const d = daily[i]!.value;
    const b = baseline[i]!.value;
    if (d == null || b == null) continue;
    const diff = d - b;
    if (threshold < 0 && diff <= threshold) n += 1;
    if (threshold > 0 && diff >= threshold) n += 1;
  }
  return n;
}

function lastNonNull(points: ReadonlyArray<BodyPoint>): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const v = points[i]!.value; // i within [0, points.length)
    if (v != null) return Math.round(v);
  }
  return null;
}

function parseTimeMin(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  return h * 60 + mn;
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}
function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Drift-tolerance: swallow DB errors caused by schema gaps (table/column not
// yet created) so the dashboard renders empty state instead of 500.
async function safeCall<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[deep-dive-body] loader degraded:', (err as Error).message);
    }
    return fallback;
  }
}

function buildEmptyDaily(now: Date, days: number): BodyPoint[] {
  const out: BodyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(now, -i);
    out.push({ iso_date: isoDate(day), value: null });
  }
  return out;
}

function emptySleep(now: Date, days: number): SleepSection {
  const nights: SleepNight[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(now, -i);
    nights.push({
      iso_date: isoDate(day),
      total_hours: null,
      deep_hours: null,
      rem_hours: null,
      light_hours: null,
      efficiency_pct: null,
      wakeups: null,
      bedtime_iso: null,
      waketime_iso: null,
    });
  }
  return {
    nights,
    avg_total_hours: null,
    avg_efficiency_pct: null,
    avg_wakeups: null,
    bedtime_variance_min: null,
    waketime_variance_min: null,
  };
}

function emptyVo2Max(now: Date, months: number): Vo2MaxSection {
  const monthly: Vo2MaxPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    monthly.push({
      iso_month: monthKey(addMonths(now, -i)),
      value_ml_kg_min: null,
      source: null,
      annotation: null,
    });
  }
  return { monthly, current_value: null, delta_3m: null };
}

function emptyComposition(now: Date, days: number): CompositionSection {
  const empty = buildEmptyDaily(now, days);
  const weekly: BodyPoint[] = [];
  for (let i = 0; i < 12; i++) {
    weekly.unshift({
      iso_date: empty[empty.length - i * 7 - 1]?.iso_date ?? '',
      value: null,
    });
  }
  return {
    weight_daily: empty,
    weight_weekly_avg: weekly,
    current_weight_kg: null,
    weight_delta_30d_kg: null,
    body_fat_pct: null,
    body_fat_delta_30d_pct: null,
    dexa_snapshots: [],
    hydration_avg_l: null,
  };
}

function emptyWellness(now: Date, days: number): WellnessSection {
  const labels: Record<WellnessMetric['key'], string> = {
    soreness: 'Soreness',
    mood: 'Ánimo',
    motivation: 'Motivación',
    fatigue: 'Fatiga',
    sleep_quality: 'Calidad sueño',
  };
  const metrics: WellnessMetric[] = (
    ['soreness', 'mood', 'motivation', 'fatigue', 'sleep_quality'] as const
  ).map((k) => ({
    key: k,
    label: labels[k],
    series: buildEmptyDaily(now, days),
    avg: null,
    trend: null,
  }));
  return { metrics, checkins_done_30d: 0, checkins_total_30d: days };
}
