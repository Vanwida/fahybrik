// ANALYTICS · Section 5 — RECUPERACIÓN. REAL today via HealthKit (no partner API
// / legal entity needed): athlete 70 has 12k+ biometric_streams rows. Cards:
//   • HRV / FC reposo / VO₂máx / sueño — daily-averaged trend over the period
//     (drill). Sueño comparte el motor de METRICS (ver SLEEP_CFG): mismo cálculo,
//     metric_type='sleep_duration' en biometric_streams (segundos → horas). iOS SÍ
//     observa sleepAnalysis (ios/FAHYBRIK/HealthKit/HealthKitSyncService.swift) y
//     ese dato ya alimenta la disposición diaria y biometric-trend.ts — el
//     comentario que decía lo contrario aquí era falso (verificado 13-ago-2026:
//     202 muestras, 3 atletas en producción). Ver docs/DECISIONS.md.
//   • carga aguda vs crónica   — ACWR from our training_load stream (fixed 7d/28d)
//   • zonas de FC              — REAL: reparto de segment_zone_seconds vía
//     loadZoneWindow (lib/zones/weekly.ts), el MISMO motor que ya pinta la ficha
//     del coach — "needs_wearable / API de socio" también era falso, no hace
//     falta ningún socio, solo entrenos sincronizados con pulso.
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
  type CardZone,
  type ResolvedPeriod,
  card,
  seriesAxis,
} from './core';
import { buildLoadCards } from './load';
import {
  RESTING_HR_METRIC,
  loadRestingHrDays,
} from '@fahybrid/shared/domain/biometrics/resting-hr';
import { loadAthleteTimezone } from '@fahybrid/shared/domain/db/athlete-timezone';
import { zonedDayString } from '@fahybrid/shared/domain/dates';
import { loadZoneWindow } from '@/lib/zones/weekly';
import { ZONE_KEYS, ZONE_PART_LABEL, formatDuration, mondayOf, type ZoneKey } from '@/lib/zones/chart';
import { HR_ANCHOR_CONFIDENCE } from '@fahybrid/shared/domain/methodology';
import { tokens } from '@fahybrid/shared/tokens';

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
  /** Nota cuando faltan días recientes — cada métrica se sincroniza distinto. */
  gate_note: string;
}

const METRICS: readonly MetricCfg[] = [
  { id: 'hrv', metric_type: 'hrv', title_es: 'HRV', unit: 'ms', higher_is_better: true, round: (v) => Math.round(v), gate_note: 'Sincroniza tu reloj para ver esta tendencia.' },
  { id: 'resting_hr', metric_type: 'hr_resting', title_es: 'FC reposo', unit: 'ppm', higher_is_better: false, round: (v) => Math.round(v), gate_note: 'Sincroniza tu reloj para ver esta tendencia.' },
  { id: 'vo2max', metric_type: 'vo2max', title_es: 'VO₂ máx', unit: '', higher_is_better: true, round: (v) => Math.round(v * 10) / 10, gate_note: 'Sincroniza tu reloj para ver esta tendencia.' },
];

// Sueño vive FUERA de METRICS a propósito: comparte exactamente el mismo motor
// (buildMetricTrendCard) pero se construye por separado para no reordenar la
// tarjeta — se queda en su sitio histórico, después de carga/ACWR. El valor
// crudo llega en SEGUNDOS (biometric_streams.value_numeric), igual que lee
// biometric-trend.ts; `round` lo pasa a horas con un decimal.
const SLEEP_CFG: MetricCfg = {
  id: 'sleep',
  metric_type: 'sleep_duration',
  title_es: 'Sueño',
  unit: 'h',
  higher_is_better: true,
  round: (v) => Math.round((v / 3600) * 10) / 10,
  gate_note: 'Sincroniza tu sueño en Salud (Apple Health) para ver esta tendencia.',
};

/**
 * Una tarjeta de tendencia diaria. HRV / FC reposo / VO₂máx / sueño comparten
 * EXACTAMENTE este motor: gate honesto bajo MIN_DAYS, si no serie + media +
 * dirección. Extraído del bucle de METRICS para que sueño (fuera del array) lo
 * reutilice sin duplicar el cálculo.
 */
function buildMetricTrendCard(
  cfg: MetricCfg,
  raw: Array<{ d: string; v: number }>,
  period: ResolvedPeriod,
): AnalyticsCard {
  if (raw.length < MIN_DAYS) {
    return card({
      id: cfg.id,
      title_es: cfg.title_es,
      availability: 'needs_logging',
      availability_note: cfg.gate_note,
    });
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
  return card({
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
    series_kind: 'line',
    series_axis: seriesAxis(series),
    meaning_es: dir === 'mejora' ? 'Tendencia al alza: vas mejorando.' : dir === 'baja' ? 'Tendencia a la baja: vigila la recuperación.' : 'Como tendencia, no número diario.',
    drill: { kind: 'recovery.metric', params: { metric: cfg.metric_type }, count: raw.length, label_es: `${raw.length} días con dato` },
  });
}

export async function buildRecoverySection(
  args: { athlete_id: number | bigint; period: ResolvedPeriod },
  client: Sql = defaultSql,
): Promise<AnalyticsSection> {
  const athleteId = Number(args.athlete_id);
  const { period } = args;
  // Resting HR is EXCLUDED from the bulk query on purpose — it is a daily aggregate
  // revised in place, so it needs last-revision-wins on the athlete's local day, not
  // a UTC-bucketed average of its own superseded revisions. It comes from THE
  // resolver just below and lands in the same map.
  // Sueño entra en esta MISMA consulta agregada (un viaje menos) aunque su tarjeta
  // se construya fuera del array METRICS — ver SLEEP_CFG.
  const types = [...METRICS.map((m) => m.metric_type), SLEEP_CFG.metric_type].filter(
    (t) => t !== RESTING_HR_METRIC,
  );

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

  const tz = await loadAthleteTimezone(client, athleteId);
  const restingHrDays = await loadRestingHrDays({
    athlete_id: athleteId,
    from_iso: zonedDayString(new Date(period.start_iso), tz),
    to_iso: zonedDayString(new Date(period.end_iso), tz),
    client,
  });
  if (restingHrDays.length > 0) {
    byMetric.set(
      RESTING_HR_METRIC,
      restingHrDays.map((d) => ({ d: d.on, v: d.bpm })),
    );
  }

  const cards: AnalyticsCard[] = [];

  for (const cfg of METRICS) {
    cards.push(buildMetricTrendCard(cfg, byMetric.get(cfg.metric_type) ?? [], period));
  }

  // ── CARDS: Forma (frescura) + Carga semanal — INTERNAL load from the RPE
  // engine (shared/domain/training-load), the SAME engine the coach reads.
  // Placed just before the ACWR card so the three load readings sit together;
  // note the sources differ — these two are internal perceived load (RPE), the
  // ACWR below is external HealthKit workout volume. See load.ts.
  cards.push(...(await buildLoadCards({ athlete_id: athleteId, period }, client)));

  // ── CARD: carga aguda vs crónica (ACWR) from training_load ─────────────────
  cards.push(await buildAcwr(client, athleteId, period));

  // ── Sueño — mismo motor que HRV/FC reposo/VO₂máx, fuera del array para no
  // reordenar las tarjetas (ver SLEEP_CFG).
  cards.push(buildMetricTrendCard(SLEEP_CFG, byMetric.get(SLEEP_CFG.metric_type) ?? [], period));

  // ── Zonas de FC — REAL, reparto de segment_zone_seconds (ver buildHrZonesCard).
  cards.push(await buildHrZonesCard(client, athleteId, period));

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

/**
 * Zonas de FC — reutiliza loadZoneWindow (lib/zones/weekly.ts), el MISMO motor
 * que ya pinta la ficha del coach y que running-progress.ts reutiliza para el
 * reparto de carrera. Sin filtro de modalidad: aquí es TODO el entreno (correr +
 * fuerza + ergo…), la vista general de recuperación — no solo correr.
 *
 * A diferencia de running-progress.ts (que exige ancla medida/declarada porque
 * cruza zona de FC con ritmo — un umbral adivinado desalinearía el ritmo-al-
 * mismo-pulso), esta tarjeta solo describe cuánto tiempo cayó en cada zona: un
 * ancla ESTIMADA (FCmáx/edad) sigue siendo una zona real, con menos precisión.
 * Se lo decimos al atleta con la misma honestidad que ya usa "Mis zonas" en iOS
 * (HRZoneProfile.sourceLabel) — nunca lo escondemos ni lo hacemos pasar por medido.
 */
async function buildHrZonesCard(client: Sql, athleteId: number, period: ResolvedPeriod): Promise<AnalyticsCard> {
  const weeks = Math.max(1, Math.ceil(period.days / 7));
  const week_start = mondayOf(period.start_iso);
  const { weeks_data, anchor } = await loadZoneWindow({ athlete_id: athleteId, week_start, weeks, client });

  // no_hr_s NUNCA entra en el total: es tiempo sin pulso, no una sexta zona (misma
  // regla que running-progress.ts y que zoneTotals en lib/zones/chart.ts).
  const sums: Record<ZoneKey, number> = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  for (const w of weeks_data) {
    sums.z1 += w.z1_s;
    sums.z2 += w.z2_s;
    sums.z3 += w.z3_s;
    sums.z4 += w.z4_s;
    sums.z5 += w.z5_s;
  }
  const total_s = ZONE_KEYS.reduce((a, k) => a + sums[k], 0);

  if (total_s <= 0 || !anchor) {
    return card({
      id: 'hr_zones',
      title_es: 'Zonas de FC',
      availability: 'needs_logging',
      availability_note: 'Sincroniza entrenos con pulso y define tu umbral de FC para ver tus zonas.',
    });
  }

  const zones: CardZone[] = ZONE_KEYS.map((key) => ({
    code: key.toUpperCase(),
    label: ZONE_PART_LABEL[key],
    color: tokens.zone[key],
    value: formatDuration(sums[key]),
    pct: Math.round((sums[key] / total_s) * 100),
    drill: null,
  }));

  const estimated = HR_ANCHOR_CONFIDENCE[anchor.source] === 'estimated';
  return card({
    id: 'hr_zones',
    title_es: 'Zonas de FC',
    availability: 'real',
    availability_note: estimated ? `${anchor.source_label}. Un test de umbral afina tus zonas.` : null,
    zones,
    meaning_es: `Reparto de ${formatDuration(total_s)} de entreno con pulso, todas las modalidades.`,
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
