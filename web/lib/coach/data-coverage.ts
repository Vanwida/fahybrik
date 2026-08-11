// COBERTURA DE DATOS DEL ATLETA — desde cuándo y por qué fuente hay señal.
//
// Para la comparativa «antes del plan / con el plan» el coach necesita saber si
// el «antes» existe de verdad. Un panel de rendimiento con 4 semanas de Salud y
// un plan de 6 meses no miente en los números: miente en la pregunta. Esta pieza
// solo cuenta hechos: por fuente, el primer y el último día con dato, cuántos
// entrenos y cuántas muestras, y cuántos días de pasado hay ANTES del plan.
//
// No opina. No inventa baselines. No rellena huecos con ceros.

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadCompareContext } from '@/lib/zones/compare';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';

/** Fuentes que el coach reconoce al mirar. Orden estable de lectura. */
export const COVERAGE_SOURCE_ORDER = [
  'healthkit',
  'garmin',
  'polar',
  'whoop',
  'oura',
  'coros',
  'suunto',
  'amazfit',
  'concept2',
  'wahoo',
  'manual',
  'gps',
  'treadmill',
] as const;

export type CoverageSource = (typeof COVERAGE_SOURCE_ORDER)[number] | string;

export interface SourceCoverage {
  source: CoverageSource;
  /** Primer día con cualquier señal de esta fuente, «YYYY-MM-DD». */
  first_day: string;
  /** Último día con señal, «YYYY-MM-DD». */
  last_day: string;
  /** Días de calendario entre first y last (inclusive). */
  span_days: number;
  samples: number;
  workouts: number;
}

export interface DataCoverage {
  sources: SourceCoverage[];
  /** Primer día con dato de cualquier fuente, o null si no hay nada. */
  earliest_day: string | null;
  /** Último día con dato de cualquier fuente. */
  latest_day: string | null;
  /** Días de calendario de historia (inclusive), null sin datos. */
  history_days: number | null;
  /** Lunes del arranque del plan del atleta (ancla de compare). */
  plan_start: string | null;
  /** Días de historia ANTES del plan (first → día anterior al plan). Null sin plan o sin datos previos. */
  pre_plan_days: number | null;
  /** True cuando hay menos de 28 días antes del plan (comparativa frágil). */
  pre_plan_thin: boolean;
}

const MS_PER_DAY = 86_400_000;

/** Días de calendario inclusivos entre dos «YYYY-MM-DD». */
export function inclusiveDaySpan(from: string, to: string): number {
  const a = parseIsoDate(from).getTime();
  const b = parseIsoDate(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / MS_PER_DAY) + 1;
}

/** Orden de fuentes para la UI: conocidas primero, el resto alfabético. */
export function sortSources(sources: readonly string[]): string[] {
  const rank = new Map(COVERAGE_SOURCE_ORDER.map((s, i) => [s, i]));
  return [...sources].sort((a, b) => {
    const ra = rank.get(a as (typeof COVERAGE_SOURCE_ORDER)[number]);
    const rb = rank.get(b as (typeof COVERAGE_SOURCE_ORDER)[number]);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Une por fuente las filas de streams y de ejecuciones.
 * Puro: se prueba sin base.
 */
export function mergeSourceRows(args: {
  streams: ReadonlyArray<{ source: string; first_day: string; last_day: string; n: number }>;
  workouts: ReadonlyArray<{ source: string; first_day: string; last_day: string; n: number }>;
}): SourceCoverage[] {
  type Acc = { first: string; last: string; samples: number; workouts: number };
  const map = new Map<string, Acc>();

  const touch = (
    source: string,
    first: string,
    last: string,
    field: 'samples' | 'workouts',
    n: number,
  ) => {
    if (!source || !first || !last) return;
    const cur = map.get(source);
    if (!cur) {
      map.set(source, {
        first,
        last,
        samples: field === 'samples' ? n : 0,
        workouts: field === 'workouts' ? n : 0,
      });
      return;
    }
    if (first < cur.first) cur.first = first;
    if (last > cur.last) cur.last = last;
    cur[field] += n;
  };

  for (const r of args.streams) touch(r.source, r.first_day, r.last_day, 'samples', r.n);
  for (const r of args.workouts) touch(r.source, r.first_day, r.last_day, 'workouts', r.n);

  return sortSources([...map.keys()]).map((source) => {
    const row = map.get(source)!;
    return {
      source,
      first_day: row.first,
      last_day: row.last,
      span_days: inclusiveDaySpan(row.first, row.last),
      samples: row.samples,
      workouts: row.workouts,
    };
  });
}

/** Aritmética de cabecera a partir de fuentes ya fusionadas + ancla de plan. */
export function summarizeCoverage(args: {
  sources: readonly SourceCoverage[];
  plan_start: string | null;
  /** Umbral bajo el cual el «antes» se considera fino (días). */
  thin_days?: number;
}): Pick<
  DataCoverage,
  'earliest_day' | 'latest_day' | 'history_days' | 'plan_start' | 'pre_plan_days' | 'pre_plan_thin'
> {
  const thin = args.thin_days ?? 28;
  if (args.sources.length === 0) {
    return {
      earliest_day: null,
      latest_day: null,
      history_days: null,
      plan_start: args.plan_start,
      pre_plan_days: null,
      pre_plan_thin: true,
    };
  }
  let earliest = args.sources[0]!.first_day;
  let latest = args.sources[0]!.last_day;
  for (const s of args.sources) {
    if (s.first_day < earliest) earliest = s.first_day;
    if (s.last_day > latest) latest = s.last_day;
  }
  let pre_plan_days: number | null = null;
  if (args.plan_start != null && earliest < args.plan_start) {
    // El plan arranca en ese lunes; el «antes» acaba el domingo anterior.
    // Aritmética en calendario civil (YYYY-MM-DD), no en instantes: el ancla ya
    // viene truncada a lunes en la zona del atleta.
    const dayBefore = isoDateString(addDays(parseIsoDate(args.plan_start), -1));
    pre_plan_days = inclusiveDaySpan(earliest, dayBefore < earliest ? earliest : dayBefore);
  }
  return {
    earliest_day: earliest,
    latest_day: latest,
    history_days: inclusiveDaySpan(earliest, latest),
    plan_start: args.plan_start,
    pre_plan_days,
    pre_plan_thin: pre_plan_days == null || pre_plan_days < thin,
  };
}

export async function loadDataCoverage(args: {
  athlete_id: number | bigint;
  client?: Sql;
}): Promise<DataCoverage> {
  const client = args.client ?? defaultSql;
  const athlete_id = Number(args.athlete_id);

  const [streamRows, workoutRows, contexto] = await Promise.all([
    client<Array<{ source: string; first_day: string; last_day: string; n: string }>>`
      select
        source::text as source,
        to_char(min(recorded_at) at time zone 'UTC', 'YYYY-MM-DD') as first_day,
        to_char(max(recorded_at) at time zone 'UTC', 'YYYY-MM-DD') as last_day,
        count(*)::text as n
      from biometric_streams
      where athlete_id = ${athlete_id}
      group by source
    `,
    client<Array<{ source: string; first_day: string; last_day: string; n: string }>>`
      select
        coalesce(source::text, 'manual') as source,
        to_char(min(started_at) at time zone 'UTC', 'YYYY-MM-DD') as first_day,
        to_char(max(started_at) at time zone 'UTC', 'YYYY-MM-DD') as last_day,
        count(*)::text as n
      from workout_executions
      where athlete_id = ${athlete_id}
      group by coalesce(source::text, 'manual')
    `,
    loadCompareContext(athlete_id, client),
  ]);

  const sources = mergeSourceRows({
    streams: streamRows.map((r) => ({
      source: r.source,
      first_day: r.first_day,
      last_day: r.last_day,
      n: Number(r.n) || 0,
    })),
    workouts: workoutRows.map((r) => ({
      source: r.source,
      first_day: r.first_day,
      last_day: r.last_day,
      n: Number(r.n) || 0,
    })),
  });

  const summary = summarizeCoverage({ sources, plan_start: contexto.plan });
  return { sources, ...summary };
}
