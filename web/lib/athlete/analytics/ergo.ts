// ANALYTICS · Section 2 — ERGO (Remo · Ski · Bike). The schema is REAL
// (avg_pace_s_per_500m, avg_power_w, stroke_rate_spm — mig 0045) but the athlete
// log is usually thin → headline availability 'needs_logging' until enough erg
// sessions exist. Cards:
//   • mejores splits por ergo  — fastest /500m at the race distance per ergo (drill)
//   • tendencia · remo         — power + stroke-rate trend
//
// Honest: an ergo with zero logged segments simply doesn't appear; nothing faked.

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  type AnalyticsCard,
  type AnalyticsSection,
  type CardSeriesPoint,
  type ResolvedPeriod,
  card,
  num,
  numOrNull,
  paceStr,
} from './core';

const MIN_BAR = 0.15;
const TREND_MAX = 8;

// The three ergos + their iOS-facing ES label and modality key.
const ERGOS: ReadonlyArray<{ key: 'row' | 'ski' | 'bike'; label: string }> = [
  { key: 'row', label: 'Remo' },
  { key: 'ski', label: 'SkiErg' },
  { key: 'bike', label: 'BikeErg' },
];

interface ErgRow {
  modality: string;
  day: string;
  pace_500: string | null;
  power_w: string | null;
  stroke_spm: string | null;
  distance_meters: string | null;
}

export async function buildErgoSection(
  args: { athlete_id: number | bigint; period: ResolvedPeriod },
  client: Sql = defaultSql,
): Promise<AnalyticsSection> {
  const athleteId = Number(args.athlete_id);
  const { period } = args;

  // All ergo segments in the period (explicit modality wins, else derived).
  const segs = await client<ErgRow[]>`
    select
      coalesce(se.modality, case
        when ex.category = 'cardio' and ex.slug ilike '%row%' then 'row'
        when ex.category = 'cardio' and ex.slug ilike '%ski%' then 'ski'
        when ex.category = 'cardio' and (ex.slug ilike '%bike%' or ex.slug ilike '%cycl%') then 'bike'
        else 'x' end) as modality,
      to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day,
      se.avg_pace_s_per_500m::text as pace_500,
      se.avg_power_w::text as power_w,
      se.stroke_rate_spm::text as stroke_spm,
      se.distance_meters::text as distance_meters
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

  const byErgo = new Map<string, ErgRow[]>();
  for (const s of segs) {
    const list = byErgo.get(s.modality) ?? [];
    list.push(s);
    byErgo.set(s.modality, list);
  }

  const cards: AnalyticsCard[] = [];

  // ── CARD: best splits per ergo ─────────────────────────────────────────────
  const splitRows = ERGOS.flatMap((e) => {
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

  cards.push(
    card({
      id: 'ergo_splits',
      title_es: 'Mejores splits por ergo',
      availability: splitRows.length ? 'needs_logging' : 'needs_logging',
      availability_note: splitRows.length
        ? 'A la distancia de carrera. Más registros afinan el split.'
        : 'Registra sesiones de remo / ski / bike para ver tus splits.',
      rows: splitRows,
      meaning_es: 'Split a la distancia de carrera, no la del test. Watts ≈ split (w = 2,80/split³).',
    }),
  );

  // ── CARD: trend · remo (power + stroke rate) ───────────────────────────────
  const rowList = (byErgo.get('row') ?? []).filter((r) => numOrNull(r.power_w) != null);
  const powerSeries: CardSeriesPoint[] = (() => {
    const pts = rowList.slice(-TREND_MAX);
    const max = Math.max(1, ...pts.map((r) => num(r.power_w)));
    return pts.map((r, i) => ({
      id: `${r.day}-${i}`,
      height: Math.max(MIN_BAR, Math.min(1, num(r.power_w) / max)),
      display: `${Math.round(num(r.power_w))} w`,
      current: i === pts.length - 1,
      label: r.day,
    }));
  })();
  const latestRow = rowList[rowList.length - 1];
  cards.push(
    card({
      id: 'ergo_trend_row',
      title_es: 'Tendencia · remo',
      availability: 'needs_logging',
      availability_note: rowList.length >= 2 ? null : 'Pocos registros aún: la tendencia se afina con más sesiones.',
      series: powerSeries,
      rows: [
        { id: 'power', label: 'Potencia', value: latestRow && numOrNull(latestRow.power_w) != null ? `${Math.round(num(latestRow.power_w))} w` : null, sub: null, accent: false, drill: null },
        { id: 'rate', label: 'Rate paladas', value: latestRow && numOrNull(latestRow.stroke_spm) != null ? `${Math.round(num(latestRow.stroke_spm))} spm` : null, sub: null, accent: false, drill: null },
      ],
      meaning_es: 'Rate bajo / potencia alta = remo eficiente.',
    }),
  );

  return { section: 'ergo', title_es: 'Ergo', availability: 'needs_logging', period, cards };
}
