// ANALYTICS · Section 5 — RECUPERACIÓN. REAL today via HealthKit (no partner API
// / legal entity needed): athlete 70 has 12k+ biometric_streams rows. Cards:
//   • HRV / FC reposo / VO₂máx — daily-averaged trend over the period (drill)
//   • carga aguda vs crónica   — ACWR from our training_load stream (fixed 7d/28d)
//   • sueño                    — needs_logging (iOS doesn't observe sleepAnalysis yet)
//   • zonas de FC              — needs_wearable (continuous streams + HR model)
//
// As TREND, never a hero daily score (the doc's "no construir": a daily score in
// isolation is anxiety). Honest: a metric with too few recent days is omitted.

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  type AnalyticsCard,
  type AnalyticsSection,
  type CardSeriesPoint,
  type ResolvedPeriod,
  card,
} from './core';

const MIN_DAYS = 4;
const MIN_BAR = 0.1;
const FLAT = 0.02;
// ACWR windows (days). Acute = recent load; chronic = the 4-week baseline.
const ACUTE_DAYS = 7;
const CHRONIC_DAYS = 28;

interface MetricCfg {
  id: string;
  metric_type: string;
  title_es: string;
  unit: string;
  higher_is_better: boolean;
  round: (v: number) => number;
}

const METRICS: readonly MetricCfg[] = [
  { id: 'hrv', metric_type: 'hrv', title_es: 'HRV', unit: 'ms', higher_is_better: true, round: (v) => Math.round(v) },
  { id: 'resting_hr', metric_type: 'hr_resting', title_es: 'FC reposo', unit: 'ppm', higher_is_better: false, round: (v) => Math.round(v) },
  { id: 'vo2max', metric_type: 'vo2max', title_es: 'VO₂ máx', unit: '', higher_is_better: true, round: (v) => Math.round(v * 10) / 10 },
];

export async function buildRecoverySection(
  args: { athlete_id: number | bigint; period: ResolvedPeriod },
  client: Sql = defaultSql,
): Promise<AnalyticsSection> {
  const athleteId = Number(args.athlete_id);
  const { period } = args;
  const types = METRICS.map((m) => m.metric_type);

  // Daily averages per metric across the period (one round-trip).
  const rows = await client<Array<{ metric_type: string; d: string; v: number | null }>>`
    select metric_type::text as metric_type,
           to_char(date_trunc('day', recorded_at)::date, 'YYYY-MM-DD') as d,
           avg(value_numeric)::float as v
    from biometric_streams
    where athlete_id = ${athleteId}
      and metric_type::text = any(${types})
      and recorded_at >= ${period.start_iso}::timestamptz
      and recorded_at <= ${period.end_iso}::timestamptz
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

  const cards: AnalyticsCard[] = [];

  for (const cfg of METRICS) {
    const raw = byMetric.get(cfg.metric_type) ?? [];
    if (raw.length < MIN_DAYS) {
      cards.push(
        card({
          id: cfg.id,
          title_es: cfg.title_es,
          availability: 'needs_logging',
          availability_note: 'Sincroniza tu reloj para ver esta tendencia.',
        }),
      );
      continue;
    }
    const values = raw.map((p) => cfg.round(p.v));
    const latest = values[values.length - 1]!;
    const max = Math.max(1, ...values);
    const series: CardSeriesPoint[] = raw.map((p, i) => ({
      id: p.d,
      height: Math.max(MIN_BAR, Math.min(1, cfg.round(p.v) / max)),
      display: `${cfg.round(p.v)}`,
      current: i === raw.length - 1,
      label: p.d,
    }));
    // Baseline = average of the earlier two-thirds; direction from recent third.
    const split = Math.max(1, Math.floor(values.length / 3));
    const earlier = values.slice(0, values.length - split);
    const recent = values.slice(values.length - split);
    const baseline = earlier.length ? avg(earlier) : null;
    const recentAvg = avg(recent);
    let dir: 'mejora' | 'baja' | 'estable' = 'estable';
    if (baseline != null && baseline !== 0) {
      const rel = (recentAvg - baseline) / Math.abs(baseline);
      if (Math.abs(rel) >= FLAT) {
        const up = rel > 0;
        dir = up === cfg.higher_is_better ? 'mejora' : 'baja';
      }
    }
    cards.push(
      card({
        id: cfg.id,
        title_es: cfg.title_es,
        availability: 'real',
        availability_note: 'HealthKit',
        primary: {
          value: `${latest}`,
          unit: cfg.unit || null,
          side: baseline != null ? { value: `${cfg.round(baseline)}`, label: `media ${period.label_es}` } : null,
        },
        series,
        meaning_es: dir === 'mejora' ? 'Tendencia al alza: vas mejorando.' : dir === 'baja' ? 'Tendencia a la baja: vigila la recuperación.' : 'Como tendencia, no número diario.',
        drill: { kind: 'recovery.metric', params: { metric: cfg.metric_type }, count: raw.length, label_es: `${raw.length} días con dato` },
      }),
    );
  }

  // ── CARD: carga aguda vs crónica (ACWR) from training_load ─────────────────
  cards.push(await buildAcwr(client, athleteId, period));

  // ── Honest gaps (sleep / HR zones) ─────────────────────────────────────────
  cards.push(
    card({
      id: 'sleep',
      title_es: 'Sueño',
      availability: 'needs_logging',
      availability_note: 'iOS aún no observa sleepAnalysis — conectar es un hueco de 1 línea.',
    }),
  );
  cards.push(
    card({
      id: 'hr_zones',
      title_es: 'Zonas de FC',
      availability: 'needs_wearable',
      availability_note: 'Necesita streams continuos + modelo de FC (APIs de socio).',
    }),
  );

  return { section: 'recovery', title_es: 'Recuperación', availability: 'real', period, cards };
}

async function buildAcwr(client: Sql, athleteId: number, period: ResolvedPeriod): Promise<AnalyticsCard> {
  const r = await client<Array<{ acute: string | null; chronic: string | null }>>`
    select
      sum(value_numeric) filter (where recorded_at >= ${period.end_iso}::timestamptz - (${ACUTE_DAYS} || ' days')::interval)::float as acute,
      sum(value_numeric) filter (where recorded_at >= ${period.end_iso}::timestamptz - (${CHRONIC_DAYS} || ' days')::interval)::float as chronic
    from biometric_streams
    where athlete_id = ${athleteId}
      and metric_type::text = 'training_load'
      and recorded_at <= ${period.end_iso}::timestamptz
      and recorded_at >= ${period.end_iso}::timestamptz - (${CHRONIC_DAYS} || ' days')::interval
  `;
  const acute = toNum(r[0]?.acute);
  const chronicTotal = toNum(r[0]?.chronic);
  // Chronic baseline = mean weekly load over the 28d window. ratio = acute / that.
  const chronicWeekly = chronicTotal != null ? chronicTotal / (CHRONIC_DAYS / 7) : null;
  const ratio = acute != null && chronicWeekly && chronicWeekly > 0 ? acute / chronicWeekly : null;
  const has = acute != null && chronicWeekly != null;
  // ACWR sweet spot 0.8–1.3; outside → flag.
  const ratioOk = ratio != null && ratio >= 0.8 && ratio <= 1.3;

  return card({
    id: 'load_acwr',
    title_es: 'Carga aguda vs crónica',
    availability: has ? 'real' : 'needs_logging',
    availability_note: has ? null : 'Sincroniza tu reloj para calcular la carga.',
    rows: [
      { id: 'acute', label: `Carga ${ACUTE_DAYS} días`, value: acute != null ? `${Math.round(acute)}` : null, sub: null, accent: false, drill: null },
      { id: 'ratio', label: 'Ratio agudo/crónico', value: ratio != null ? ratio.toFixed(2).replace('.', ',') : null, sub: ratio != null ? (ratioOk ? 'óptimo' : 'fuera de rango') : null, accent: true, drill: null },
    ],
    meaning_es: 'De nuestro training_load. Leído contra el plan: carga alta esperada ≠ overreaching.',
  });
}

function avg(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}
function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}
