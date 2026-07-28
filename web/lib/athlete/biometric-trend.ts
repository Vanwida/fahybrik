import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, parseIsoDate, zonedDayString } from '@fahybrid/shared/domain/dates';
import {
  RESTING_HR_METRIC,
  loadRestingHrDays,
} from '@fahybrid/shared/domain/biometrics/resting-hr';
import { loadAthleteTimezone } from '@fahybrid/shared/domain/db/athlete-timezone';

// Athlete-facing biometric TREND — the "proof you're advancing" signal on Inicio.
//
// We surface the athlete's MOST RELEVANT biometric with RECENT history as a short
// daily-averaged series, so the home can render an honest sparkline + latest value
// + direction. We NEVER fabricate: a metric is returned only when it actually has
// enough recent days of real `biometric_streams` data; the client picks the
// highest-priority metric present and hides the element when none qualify.
//
// Why a fallback chain and not hardcoded HRV/sleep: a given athlete may have rich
// recent VO2max but stale/absent HRV (e.g. a Garmin user whose HRV stopped syncing).
// Hardcoding one metric would render empty. The priority order below leads with the
// recovery/adaptation signals and falls back to the aerobic-engine ones.

/** Window of days the trend covers. VO2max moves slowly, so a wide window gives a
 *  meaningful progression; HRV/sleep are daily and fill it densely. */
const TREND_DAYS = 90;
/** A metric needs at least this many distinct days WITH data to be trustworthy as a
 *  trend (avoids a noisy 2-point line). */
const MIN_DAYS = 4;
/** Relative change below this reads as "flat" (no real movement). */
const FLAT_THRESHOLD = 0.02;

type MetricConfig = {
  key: string;
  /** Athlete-facing ES label. */
  label: string;
  unit: string;
  /** Direction that counts as improvement (HRV/VO2max up; resting HR down). */
  higher_is_better: boolean;
  /** DB metric_type in biometric_streams. */
  metric_type: string;
  /** Map a raw daily-average value to the displayed value (e.g. sleep s → h). */
  transform: (v: number) => number;
};

// Priority order = what the client shows first when several qualify. Lead with the
// recovery/adaptation signals (HRV), then the aerobic engine (VO2max), then resting
// HR, then sleep behaviour.
const METRICS: readonly MetricConfig[] = [
  { key: 'hrv',        label: 'HRV',       unit: 'ms',  higher_is_better: true,  metric_type: 'hrv',           transform: (v) => round1(v) },
  { key: 'vo2max',     label: 'VO₂ máx',   unit: '',    higher_is_better: true,  metric_type: 'vo2max',        transform: (v) => round1(v) },
  { key: 'resting_hr', label: 'FC reposo', unit: 'ppm', higher_is_better: false, metric_type: 'hr_resting',    transform: (v) => Math.round(v) },
  { key: 'sleep',      label: 'Sueño',     unit: 'h',   higher_is_better: true,  metric_type: 'sleep_duration', transform: (v) => round1(v / 3600) },
] as const;

export type BioTrendPoint = { iso_date: string; value: number };

export type BioTrendMetric = {
  key: string;
  label: string;
  unit: string;
  higher_is_better: boolean;
  /** Chronological, only the days that actually have a reading. */
  points: BioTrendPoint[];
  /** Most recent reading in the window. */
  latest: number;
  /** Average over the earlier part of the window (the comparison baseline). */
  baseline: number | null;
  direction: 'up' | 'down' | 'flat';
};

export type AthleteBiometricTrend = {
  days: number;
  /** In priority order; empty when the athlete has no recent biometric history. */
  metrics: BioTrendMetric[];
};

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Build the athlete's biometric trend bundle — only metrics with ≥ MIN_DAYS of
 * recent real data, in priority order. Empty `metrics` is the honest empty state.
 */
export async function buildAthleteBiometricTrend(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<AthleteBiometricTrend> {
  const client = params.client ?? defaultSql;
  const tz = await loadAthleteTimezone(client, params.athlete_id);
  const todayIso = zonedDayString(params.on_date ?? new Date(), tz);
  const fromIso = isoDateString(addDays(parseIsoDate(todayIso), -(TREND_DAYS - 1)));
  // Resting HR is EXCLUDED from the bulk query on purpose — it is a daily aggregate
  // revised in place, so it needs last-revision-wins on the athlete's local day, not
  // a UTC-bucketed average of its own superseded revisions. It comes from THE
  // resolver just below and lands in the same map.
  const types = METRICS.map((m) => m.metric_type).filter((t) => t !== RESTING_HR_METRIC);

  // One round-trip: daily averages per metric across the window.
  const rows = await client<Array<{ metric_type: string; d: string; v: number | null }>>`
    select metric_type,
           to_char(date_trunc('day', recorded_at)::date, 'YYYY-MM-DD') as d,
           avg(value_numeric)::float as v
    from biometric_streams
    where athlete_id = ${params.athlete_id as number}
      -- metric_type is the biometric_metric ENUM; compare as text so the bound
      -- string[] param matches (enum = text[] has no operator).
      and metric_type::text = any(${types})
      and recorded_at >= ${parseIsoDate(fromIso)}
    group by 1, 2
    order by 1, 2
  `;

  const byMetric = new Map<string, Array<{ d: string; v: number }>>();
  for (const r of rows) {
    if (r.v == null) continue;
    const list = byMetric.get(r.metric_type) ?? [];
    list.push({ d: r.d, v: r.v });
    byMetric.set(r.metric_type, list);
  }

  const restingHrDays = await loadRestingHrDays({
    athlete_id: params.athlete_id,
    from_iso: fromIso,
    to_iso: todayIso,
    client,
  });
  if (restingHrDays.length > 0) {
    byMetric.set(
      RESTING_HR_METRIC,
      restingHrDays.map((d) => ({ d: d.on, v: d.bpm })),
    );
  }

  const metrics: BioTrendMetric[] = [];
  for (const cfg of METRICS) {
    const raw = byMetric.get(cfg.metric_type);
    if (!raw || raw.length < MIN_DAYS) continue;

    const points: BioTrendPoint[] = raw.map((p) => ({ iso_date: p.d, value: cfg.transform(p.v) }));
    const values = points.map((p) => p.value);
    const latest = values[values.length - 1];

    // Compare the recent third against the earlier two-thirds for a stable
    // direction (single-day spikes don't flip it).
    const split = Math.max(1, Math.floor(values.length / 3));
    const earlier = values.slice(0, values.length - split);
    const recent = values.slice(values.length - split);
    const earlierAvg = earlier.length ? avg(earlier) : null;
    const recentAvg = avg(recent);

    let direction: BioTrendMetric['direction'] = 'flat';
    if (earlierAvg != null && earlierAvg !== 0) {
      const rel = (recentAvg - earlierAvg) / Math.abs(earlierAvg);
      if (Math.abs(rel) >= FLAT_THRESHOLD) direction = rel > 0 ? 'up' : 'down';
    }

    metrics.push({
      key: cfg.key,
      label: cfg.label,
      unit: cfg.unit,
      higher_is_better: cfg.higher_is_better,
      points,
      latest,
      baseline: earlierAvg != null ? round1(earlierAvg) : null,
      direction,
    });
  }

  return { days: TREND_DAYS, metrics };
}

function avg(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}
