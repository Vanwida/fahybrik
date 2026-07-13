// ANALYTICS · Section 2 — ERGO (Remo · Ski · Bike). The schema is REAL
// (avg_pace_s_per_500m, avg_power_w, stroke_rate_spm, distance_meters — mig 0045)
// but the athlete log is usually thin. The section is SCOPED to one erg at a time
// (the `erg` param, default 'row'); a segmented control in the app flips it. Cards:
//   • mejores splits · 500 m   — fastest /500m per ergo, COMPARATIVE (cross-erg, 3 rows)
//   • tendencia · {erg}        — /500m pace trend for the selected erg   (line)
//   • volumen semanal · {erg}  — metres/week for the selected erg        (bars)
//
// Honest: an ergo with zero logged segments simply doesn't appear in the splits,
// and the scoped trend/volume degrade to 'needs_logging'. Nothing is faked.

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  type AnalyticsCard,
  type AnalyticsSection,
  type CardRow,
  type CardSeriesPoint,
  type ResolvedPeriod,
  card,
  isoWeekStart,
  kmStr,
  num,
  numOrNull,
  paceStr,
  seriesAxis,
} from './core';

const MIN_BAR = 0.15;
const TREND_MAX = 8;

// The three ergos + their iOS-facing ES label. `ErgKey` is the wire scope value.
export type ErgKey = 'row' | 'ski' | 'bike';
const ERGOS: ReadonlyArray<{ key: ErgKey; label: string }> = [
  { key: 'row', label: 'Remo' },
  { key: 'ski', label: 'SkiErg' },
  { key: 'bike', label: 'BikeErg' },
];
const ERGO_LABEL: Record<ErgKey, string> = { row: 'Remo', ski: 'SkiErg', bike: 'BikeErg' };

export function isErgKey(v: string): v is ErgKey {
  return v === 'row' || v === 'ski' || v === 'bike';
}

interface ErgRow {
  modality: string;
  execution_id: string;
  day: string;
  pace_500: string | null;
  power_w: string | null;
  stroke_spm: string | null;
  distance_meters: string | null;
  calories: string | null;
}

// Stroke rate is strokes/min on row & ski, cadence (rpm) on the bike — same
// column, machine-appropriate label + unit so the number never reads with the
// wrong term. Shared by the pace-trend and power-trend cards.
function rateRow(erg: ErgKey, spm: number | null): CardRow {
  return erg === 'bike'
    ? { id: 'rate', label: 'Cadencia', value: spm != null ? `${spm} rpm` : null, sub: null, accent: false, drill: null }
    : { id: 'rate', label: 'Rate paladas', value: spm != null ? `${spm} spm` : null, sub: null, accent: false, drill: null };
}

export async function buildErgoSection(
  args: { athlete_id: number | bigint; period: ResolvedPeriod; erg?: ErgKey },
  client: Sql = defaultSql,
): Promise<AnalyticsSection> {
  const athleteId = Number(args.athlete_id);
  const { period } = args;
  const erg: ErgKey = args.erg && isErgKey(args.erg) ? args.erg : 'row';
  const label = ERGO_LABEL[erg];

  // All ergo segments in the period (explicit modality wins, else derived).
  const segs = await client<ErgRow[]>`
    select
      coalesce(se.modality, case
        when ex.category = 'cardio' and ex.slug ilike '%row%' then 'row'
        when ex.category = 'cardio' and ex.slug ilike '%ski%' then 'ski'
        when ex.category = 'cardio' and (ex.slug ilike '%bike%' or ex.slug ilike '%cycl%') then 'bike'
        else 'x' end) as modality,
      we.id::text as execution_id,
      to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day,
      se.avg_pace_s_per_500m::text as pace_500,
      se.avg_power_w::text as power_w,
      se.stroke_rate_spm::text as stroke_spm,
      se.distance_meters::text as distance_meters,
      se.calories::text as calories
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    left join template_segments ts on ts.id = se.template_segment_id
    left join exercises ex on ex.id = ts.exercise_id
    where we.athlete_id = ${athleteId}
      and coalesce(se.modality, case
        when ex.category = 'cardio' and ex.slug ilike '%row%' then 'row'
        when ex.category = 'cardio' and ex.slug ilike '%ski%' then 'ski'
        when ex.category = 'cardio' and (ex.slug ilike '%bike%' or ex.slug ilike '%cycl%') then 'bike'
        else 'x' end) in ('row','ski','bike')
      and coalesce(we.ended_at, we.started_at) >= ${period.start_iso}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${period.end_iso}::timestamptz
    order by we.started_at asc
  `;

  const byErgo = new Map<ErgKey, ErgRow[]>();
  for (const s of segs) {
    if (!isErgKey(s.modality)) continue;
    const list = byErgo.get(s.modality) ?? [];
    list.push(s);
    byErgo.set(s.modality, list);
  }

  const selected = byErgo.get(erg) ?? [];
  const cards: AnalyticsCard[] = [
    buildSplitsCard(byErgo),
    buildTrendCard(erg, label, selected),
    buildPowerCard(erg, label, selected),
    buildVolumeCard(erg, label, selected, period),
  ];

  return {
    section: 'ergo',
    title_es: 'Ergo',
    availability: selected.length ? 'real' : 'needs_logging',
    period,
    cards,
  };
}

// ── CARD: best splits · 500 m — COMPARATIVE across the three ergos (unchanged) ──
function buildSplitsCard(byErgo: Map<ErgKey, ErgRow[]>): AnalyticsCard {
  const splitRows: CardRow[] = ERGOS.flatMap((e) => {
    const list = (byErgo.get(e.key) ?? []).filter((r) => numOrNull(r.pace_500) != null);
    if (list.length === 0) return [];
    const best = list.reduce((m, r) => Math.min(m, num(r.pace_500)), Infinity);
    return [
      {
        id: e.key,
        label: `${e.label} · mejor /500m`,
        value: `${paceStr(best)} /500m`,
        sub: `${list.length} ses`,
        accent: e.key === 'row',
        drill: { kind: 'ergo.split', params: { modality: e.key }, count: list.length, label_es: 'su sesión' },
      },
    ];
  });

  return card({
    id: 'ergo_splits',
    title_es: 'Mejores splits · 500 m',
    availability: 'needs_logging',
    availability_note: splitRows.length
      ? 'A la distancia de carrera. Más registros afinan el split.'
      : 'Registra sesiones de remo / ski / bike para ver tus splits.',
    rows: splitRows,
    meaning_es: 'Split a la distancia de carrera, no la del test. Watts ≈ split (w = 2,80/split³).',
  });
}

// ── CARD: trend · {erg} — /500 m pace over the last sessions (LINE) ────────────
function buildTrendCard(erg: ErgKey, label: string, list: ErgRow[]): AnalyticsCard {
  const paced = list.filter((r) => numOrNull(r.pace_500) != null);
  const pts = paced.slice(-TREND_MAX);
  const maxPace = Math.max(1, ...pts.map((r) => num(r.pace_500)));
  const series: CardSeriesPoint[] = pts.map((r, i) => ({
    id: `${r.day}-${i}`,
    // Same convention as running's pace trend: taller = slower (worse). The
    // y-axis labels (seriesAxis) read fastest at the bottom, slowest at the top.
    height: Math.max(MIN_BAR, Math.min(1, num(r.pace_500) / maxPace)),
    display: paceStr(num(r.pace_500)),
    current: i === pts.length - 1,
    label: r.day,
  }));

  const latest = paced[paced.length - 1];
  const latestPace = latest && numOrNull(latest.pace_500) != null ? `${paceStr(num(latest.pace_500))} /500m` : null;
  const power = latest && numOrNull(latest.power_w) != null ? `${Math.round(num(latest.power_w))} w` : null;
  const rateNum = latest && numOrNull(latest.stroke_spm) != null ? Math.round(num(latest.stroke_spm)) : null;

  return card({
    id: 'ergo_trend',
    title_es: `Tendencia · ${label} — ritmo /500 m`,
    availability: paced.length >= 2 ? 'real' : 'needs_logging',
    availability_note:
      paced.length >= 2
        ? null
        : paced.length === 1
          ? 'Pocos registros aún: la tendencia se afina con más sesiones.'
          : `Registra sesiones de ${label.toLowerCase()} para ver tu tendencia.`,
    series,
    series_kind: 'line',
    series_axis: seriesAxis(series),
    rows: [
      { id: 'pace', label: 'Ritmo /500 m', value: latestPace, sub: null, accent: true, drill: null },
      { id: 'power', label: 'Potencia', value: power, sub: null, accent: false, drill: null },
      rateRow(erg, rateNum),
    ],
    meaning_es: 'Ritmo medio /500 m por sesión. Bajando = motor mejorando. Rate bajo / potencia alta = más eficiente.',
  });
}

// ── CARD: power trend · {erg} — avg watts over the last sessions (LINE) ─────────
// The erg's output metric: rising watts = a stronger motor. Polarity is OPPOSITE
// to the pace line — here TALLER = MORE power (better). Stroke rate rides along as
// a companion (it has no intrinsic "better", it's efficiency context for the
// watts), and the per-session rate is visible in the drill list.
function buildPowerCard(erg: ErgKey, label: string, list: ErgRow[]): AnalyticsCard {
  const powered = list.filter((r) => numOrNull(r.power_w) != null);
  const pts = powered.slice(-TREND_MAX);
  const maxPower = Math.max(1, ...pts.map((r) => num(r.power_w)));
  const series: CardSeriesPoint[] = pts.map((r, i) => ({
    id: `${r.day}-${i}`,
    height: Math.max(MIN_BAR, Math.min(1, num(r.power_w) / maxPower)),
    display: `${Math.round(num(r.power_w))} w`,
    current: i === pts.length - 1,
    label: r.day,
  }));

  const latest = powered[powered.length - 1];
  const latestPower = latest && numOrNull(latest.power_w) != null ? `${Math.round(num(latest.power_w))} w` : null;
  const rateNum = latest && numOrNull(latest.stroke_spm) != null ? Math.round(num(latest.stroke_spm)) : null;
  const bestPower = powered.length ? Math.max(...powered.map((r) => num(r.power_w))) : null;

  return card({
    id: 'ergo_power',
    title_es: `Tendencia · ${label} — potencia`,
    availability: powered.length >= 2 ? 'real' : 'needs_logging',
    availability_note:
      powered.length >= 2
        ? null
        : powered.length === 1
          ? 'Pocos registros aún: la tendencia se afina con más sesiones.'
          : `Registra sesiones de ${label.toLowerCase()} con potencia para ver tu tendencia.`,
    series,
    series_kind: 'line',
    series_axis: seriesAxis(series),
    rows: [
      {
        id: 'power',
        label: 'Potencia media',
        value: latestPower,
        sub: null,
        accent: true,
        drill: powered.length
          ? { kind: 'ergo.power', params: { modality: erg }, count: powered.length, label_es: 'su sesión' }
          : null,
      },
      { id: 'best', label: 'Mejor', value: bestPower != null ? `${Math.round(bestPower)} w` : null, sub: null, accent: false, drill: null },
      rateRow(erg, rateNum),
    ],
    meaning_es: 'Potencia media /sesión. Subiendo = más motor. A igual rate, más potencia = más fuerza por palada.',
  });
}

// ── CARD: weekly volume · {erg} — metres per week for the selected erg (BARS) ──
// The "how much" card. Bars + primary are metre-driven; calories ride along as a
// universal work proxy (per session + total) so the volume story holds even on a
// machine where distance reads oddly (AirBike). Calories only appear when logged.
function buildVolumeCard(erg: ErgKey, label: string, list: ErgRow[], period: ResolvedPeriod): AnalyticsCard {
  const withDist = list.filter((r) => numOrNull(r.distance_meters) != null && num(r.distance_meters) > 0);
  const totalMeters = withDist.reduce((a, r) => a + num(r.distance_meters), 0);
  const sessions = new Set(withDist.map((r) => r.execution_id));
  const weeks = Math.max(1, Math.round(period.days / 7));

  const byWeek = new Map<string, number>();
  for (const r of withDist) {
    const wk = isoWeekStart(r.day);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + num(r.distance_meters));
  }
  const ordered = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxWeek = Math.max(1, ...ordered.map(([, m]) => m));
  const series: CardSeriesPoint[] = ordered.map(([wk, m], i) => ({
    id: wk,
    height: Math.max(MIN_BAR, Math.min(1, m / maxWeek)),
    display: kmStr(m),
    current: i === ordered.length - 1,
    label: wk,
  }));

  const hasData = totalMeters > 0;

  // Calories — total + per-session average, navigable to the source sessions.
  const withCal = list.filter((r) => numOrNull(r.calories) != null && num(r.calories) > 0);
  const totalCal = withCal.reduce((a, r) => a + num(r.calories), 0);
  const calSessions = new Set(withCal.map((r) => r.execution_id));
  const calRows: CardRow[] =
    calSessions.size > 0
      ? [
          {
            id: 'calories',
            label: 'Calorías',
            value: `${Math.round(totalCal)} cal`,
            sub: null,
            accent: false,
            drill: { kind: 'ergo.calories', params: { modality: erg }, count: calSessions.size, label_es: 'su sesión' },
          },
          { id: 'cal_per_session', label: 'Cal/sesión', value: `${Math.round(totalCal / calSessions.size)} cal`, sub: null, accent: false, drill: null },
        ]
      : [];

  const metreRows: CardRow[] = hasData
    ? [
        { id: 'total', label: `Total ${period.label_es}`, value: kmStr(totalMeters), sub: null, accent: true, drill: null },
        { id: 'sessions', label: 'Sesiones', value: String(sessions.size), sub: null, accent: false, drill: null },
        { id: 'per_week', label: 'Media/sem', value: kmStr(totalMeters / weeks), sub: null, accent: false, drill: null },
      ]
    : [];

  return card({
    id: 'ergo_volume',
    title_es: `Volumen semanal · ${label}`,
    availability: hasData || calRows.length ? 'real' : 'needs_logging',
    availability_note: hasData || calRows.length ? null : `Registra sesiones de ${label.toLowerCase()} con distancia para ver tu volumen.`,
    primary: hasData
      ? {
          value: (totalMeters / 1000).toFixed(1),
          unit: 'km',
          side: { value: String(sessions.size), label: 'sesiones' },
        }
      : null,
    series,
    series_kind: 'bars',
    rows: [...metreRows, ...calRows],
    meaning_es: 'Metros por semana en este ergo. Base aeróbica del motor. Las calorías son la carga total de trabajo.',
  });
}
