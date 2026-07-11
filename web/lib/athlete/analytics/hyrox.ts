// ANALYTICS · Section 4 — HYROX (the differentiator: cross-modality, "lo que
// nadie tiene"). Cards, in the doc's order:
//   A · Proyección de finish   — GATE (no model yet → invitation to a simulation, never a fake number)
//   B · Última carrera · desglose — REAL: 8 runs + 8 estaciones + RoxZone (mig 0054) (drill → 16 segmentos)
//   C · Percentil vs el campo  — FIELD (needs the licensed HYROX dataset); rank-based only when field_size present
//   D · Eslabón débil          — DERIVED/FIELD (percentile + decay + strength); honest placeholder until the dataset
//   E · Historial de carreras  — REAL: unified catalog (mig 0077), finish + delta (drill each → desglose)
//
// athlete 70's HYROX are DOUBLES → the splits are TEAM-level; surfaced REAL but
// labelled honestly. Singles (individual) breakdowns flow through the same shape
// when present. NOTE: HYROX is competition-anchored, not period-windowed — a race
// is a race; the period selector does not filter it (we still echo the period).

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { normalizeFormat } from '@fahybrid/shared/domain/prescription/format';
import {
  type AnalyticsCard,
  type AnalyticsSection,
  type CardRow,
  type ResolvedPeriod,
  card,
  clockStr,
  dayMonthEs,
  deltaStr,
} from './core';

interface RaceRow {
  id: string;
  name: string;
  format: string;
  division: string | null;
  race_date: string | null;
  result_time_seconds: number | null;
  run_total_seconds: number | null;
  roxzone_seconds: number | null;
  station_total: number | null;
  has_splits: boolean;
  overall_rank: number | null;
  field_size: number | null;
}

export async function buildHyroxSection(
  args: { athlete_id: number | bigint; period: ResolvedPeriod },
  client: Sql = defaultSql,
): Promise<AnalyticsSection> {
  const athleteId = Number(args.athlete_id);
  const { period } = args;

  // All races, newest→oldest. station_total = sum of station_splits seconds.
  const races = await client<RaceRow[]>`
    select
      id::text as id,
      name,
      format::text as format,
      division::text as division,
      to_char(race_date, 'YYYY-MM-DD') as race_date,
      result_time_seconds,
      run_total_seconds,
      roxzone_seconds,
      (
        select sum((s->>'seconds')::int)
        from jsonb_array_elements(coalesce(station_splits_json, '[]'::jsonb)) s
        where s->>'seconds' is not null
      ) as station_total,
      (station_splits_json is not null) as has_splits,
      overall_rank,
      field_size
    from races
    where athlete_id = ${athleteId}
    order by race_date desc nulls last, id desc
  `;

  const cards: AnalyticsCard[] = [];
  const withSplits = races.filter((r) => r.has_splits);
  const last = withSplits[0] ?? null;

  // ── A · Proyección de finish — GATE (mirror deep-dive loadHyroxPrediction null) ─
  cards.push(
    card({
      id: 'finish_projection',
      title_es: '¿Llegas a tu objetivo?',
      availability: 'gate',
      availability_note: 'El modelo de proyección no existe aún. Haz una simulación HYROX y lo desbloqueas con tus splits.',
    }),
  );

  // ── B · Última carrera · desglose (REAL) ───────────────────────────────────
  if (last) {
    const isDoubles = last.format !== 'singles';
    cards.push(
      card({
        id: 'last_race_breakdown',
        title_es: 'Última carrera · desglose',
        availability: 'real',
        availability_note: isDoubles ? 'Splits de equipo (dobles).' : null,
        primary: last.result_time_seconds != null
          ? { value: clockStr(last.result_time_seconds), unit: null, side: null }
          : null,
        rows: [
          { id: 'runs', label: '8 runs', value: clockStr(last.run_total_seconds), sub: null, accent: false, drill: null },
          { id: 'stations', label: '8 estaciones', value: clockStr(last.station_total), sub: null, accent: false, drill: null },
          { id: 'roxzone', label: 'RoxZone', value: clockStr(last.roxzone_seconds), sub: 'tiempo de transición', accent: true, drill: null },
        ],
        meaning_es: 'RoxZone = tiempo gratis: recreacional ~52 s/transición vs élite ~28 s. Invisible para el reloj.',
        drill: { kind: 'hyrox.race', params: { race_id: last.id }, count: 16, label_es: 'los 16 segmentos uno a uno' },
      }),
    );
  } else {
    cards.push(
      card({
        id: 'last_race_breakdown',
        title_es: 'Última carrera · desglose',
        availability: 'needs_logging',
        availability_note: 'Importa una carrera HYROX (o haz una simulación) para ver tu desglose.',
      }),
    );
  }

  // ── C · Percentil vs el campo — FIELD ──────────────────────────────────────
  const rankPct =
    last && last.overall_rank != null && last.field_size != null && last.field_size > 0
      ? Math.min(100, Math.max(1, Math.round((last.overall_rank / last.field_size) * 100)))
      : null;
  cards.push(
    card({
      id: 'field_percentile',
      title_es: 'Tú vs el campo',
      availability: 'field',
      availability_note: rankPct == null
        ? 'Percentil por estación = dataset HYROX (mikatiming) a licenciar. Por división · sexo · edad.'
        : 'Posición global real; el percentil por estación llega con el dataset del campo.',
      rows:
        rankPct != null
          ? [{ id: 'overall', label: 'Posición global', value: `top ${rankPct}%`, sub: `#${last!.overall_rank} de ${last!.field_size}`, accent: true, drill: null }]
          : [],
    }),
  );

  // ── D · Eslabón débil — DERIVED/FIELD ──────────────────────────────────────
  cards.push(
    card({
      id: 'weak_link',
      title_es: 'Tu eslabón débil',
      availability: 'field',
      availability_note: 'Se deriva de percentil + decay + fuerza. Llega con el dataset del campo.',
    }),
  );

  // ── E · Historial de carreras (REAL) ───────────────────────────────────────
  const historyRows = races
    .filter((r) => r.result_time_seconds != null)
    .map((r, i, arr) => {
      const prev = arr[i + 1]; // next older
      const delta = prev?.result_time_seconds != null && r.result_time_seconds != null ? r.result_time_seconds - prev.result_time_seconds : null;
      const meta = [dayMonthEs(r.race_date) ?? 'sin fecha', formatLabel(r.format), r.division].filter(Boolean).join(' · ');
      return {
        id: r.id,
        label: r.name,
        value: clockStr(r.result_time_seconds),
        sub: `${meta}${delta != null ? ` · ${deltaStr(delta)}` : ''}`,
        accent: i === 0,
        drill: r.has_splits ? { kind: 'hyrox.race', params: { race_id: r.id }, count: 16, label_es: 'desglose' } : null,
      };
    });
  cards.push(
    card({
      id: 'race_history',
      title_es: 'Historial de carreras',
      availability: historyRows.length ? 'real' : 'needs_logging',
      availability_note: historyRows.length ? null : 'Aún no hay carreras registradas.',
      rows: historyRows,
    }),
  );

  // ── F · Simulaciones y metcons (REAL scores) ───────────────────────────────
  // Training sessions scored by TIME (For Time / HYROX sim / …) or ROUNDS+reps
  // (AMRAP / Tabata) — workout_executions.score_* (mig 0069). Unlike the races
  // above these ARE training, so they honour the period window.
  cards.push(await buildScoresCard(client, athleteId, period));

  const hasScores = cards.some((c) => c.id === 'sim_scores' && c.availability === 'real');
  return {
    section: 'hyrox',
    title_es: 'HYROX',
    availability: withSplits.length || hasScores ? 'real' : 'needs_logging',
    period,
    cards,
  };
}

// ── Scored training sessions (sim / metcon) ──────────────────────────────────
interface ScoreRow {
  execution_id: string;
  day: string | null;
  score_time_s: number | null;
  score_rounds: number | null;
  score_reps: number | null;
  template_name: string;
  format: string;
}

// ES labels for the scored formats (English lives in the format catalog).
export const SCORE_FORMAT_ES: Record<string, string> = {
  for_time: 'Por tiempo',
  amrap: 'AMRAP',
  emom: 'EMOM',
  tabata: 'Tabata',
  chipper: 'Chipper',
  ladder: 'Ladder',
  rounds: 'Rondas',
  hyrox_sim: 'Simulación HYROX',
};

/** A scored session's headline: a time, or rounds (+ partial reps). Structural
 *  param so the drill-down can reuse it without the full row. */
export function scoreValue(r: { score_time_s: number | null; score_rounds: number | null; score_reps: number | null }): string | null {
  if (r.score_time_s != null) return clockStr(r.score_time_s);
  if (r.score_rounds != null) {
    const reps = r.score_reps != null && r.score_reps > 0 ? ` + ${r.score_reps}` : '';
    return `${r.score_rounds} rondas${reps}`;
  }
  return null;
}

async function buildScoresCard(
  client: Sql,
  athleteId: number,
  period: ResolvedPeriod,
): Promise<AnalyticsCard> {
  const scored = await client<ScoreRow[]>`
    select
      we.id::text as execution_id,
      to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day,
      we.score_time_s, we.score_rounds, we.score_reps,
      t.name as template_name, t.format::text as format
    from workout_executions we
    join workout_assignments wa on wa.id = we.assignment_id
    join templates t on t.id = wa.template_id
    where we.athlete_id = ${athleteId}
      and (we.score_time_s is not null or we.score_rounds is not null)
      and coalesce(we.ended_at, we.started_at) >= ${period.start_iso}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${period.end_iso}::timestamptz
    order by we.started_at desc, we.id desc
  `;

  if (scored.length === 0) {
    return card({
      id: 'sim_scores',
      title_es: 'Simulaciones y metcons',
      availability: 'needs_logging',
      availability_note: 'Puntúa una simulación HYROX o un metcon (por tiempo o rondas) para ver tu historial.',
    });
  }

  // Best HYROX simulation is an ALL-TIME PR (a sim is a sim, comparable across
  // dates), separate from the period-windowed history below.
  const simBestRows = await client<Array<{ best: number | null }>>`
    select min(we.score_time_s) as best
    from workout_executions we
    join workout_assignments wa on wa.id = we.assignment_id
    join templates t on t.id = wa.template_id
    where we.athlete_id = ${athleteId}
      and we.score_time_s is not null
      and t.format::text in ('hyrox_sim', 'simulation')
  `;
  const simBest = simBestRows[0]?.best ?? null;

  const rows: CardRow[] = [];
  if (simBest != null) {
    rows.push({
      id: 'best_sim',
      label: 'Mejor simulación',
      value: clockStr(simBest),
      sub: 'ensayo completo · histórico',
      accent: true,
      drill: null,
    });
  }
  for (const r of scored) {
    const fmt = normalizeFormat(r.format);
    rows.push({
      id: r.execution_id,
      label: r.template_name,
      value: scoreValue(r),
      sub: [fmt ? SCORE_FORMAT_ES[fmt] ?? fmt : null, dayMonthEs(r.day)].filter(Boolean).join(' · ') || null,
      accent: false,
      drill: null,
    });
  }

  return card({
    id: 'sim_scores',
    title_es: 'Simulaciones y metcons',
    availability: 'real',
    rows,
    drill: { kind: 'hyrox.scores', params: {}, count: scored.length, label_es: `${scored.length} sesiones puntuadas` },
    meaning_es: 'Sesiones cronometradas o por rondas. Una simulación completa es tu mejor referencia de forma HYROX.',
  });
}

function formatLabel(format: string): string {
  if (format === 'singles') return 'Individual';
  if (format === 'doubles') return 'Dobles';
  if (format === 'relay') return 'Relevos';
  return format;
}
