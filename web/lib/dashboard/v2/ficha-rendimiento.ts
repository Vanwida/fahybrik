import 'server-only';

// Pestaña Rendimiento de la ficha — UN scroll ordenado por la pregunta del coach
// (informe C §4.3): zonas y tests · running · fuerza · fisiología · carreras. Aquí
// se carga lo que no tiene su propia API (zonas, tests, 1RM, marcas, carga y
// cuerpo); running en detalle, tiempo en zonas y carreras se piden a la vista.
// Cada parte lleva su error: un fallo nunca se pinta como «sin datos» (S5).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadAthleteZoneProfiles } from '@/lib/dashboard/v2/zone-profile';
import { loadStrengthMaxes, loadStrengthMaxHistory } from '@/lib/strength/strength-max';
import { loadBatteryStatus, type CalibrationTestStatus } from '@/lib/coach/battery-status';
import { listCoachTests } from '@/lib/coach/coach-tests';
import { buildAthleteBody, type BodyPayload } from '@/lib/dashboard/coach/deep-dive-body';
import { computeAcr, computeLoadSeries, getDailyTssSeries, readLoadCoverage, summarizeLoad } from '@/lib/training-load';
import { strengthLiftLabel } from '@fahybrid/shared/domain/strength';
import { benchmarkLabel } from '@fahybrid/shared/domain/coach/benchmark-slugs';
import type { AthleteZoneProfile } from '@fahybrid/shared/schema/methodology-system';

export interface StrengthMaxView {
  exercise_slug: string;
  exercise_label: string;
  one_rm_kg: number;
  recorded_at: string;
  source: string;
  history: { one_rm_kg: number; recorded_at: string }[];
}

export interface BenchmarkSeries {
  exercise_slug: string;
  label: string;
  unit: string;
  results: { value: number; recorded_at: string }[];
}

export interface LoadView {
  /** Últimos días, el más viejo primero: fitness (CTL), fatiga (ATL), forma (TSB). */
  series: { date: string; ctl: number; atl: number; tsb: number }[];
  ctl: number;
  atl: number;
  tsb: number;
  acr: number | null;
  /** Días con carga medida en la ventana (0 = no hay de dónde leer). */
  days_with_load: number;
  /** Frase honesta de cobertura si falta parte de la carga. */
  coverage_note: string | null;
}

type Part<T> = { ok: true; data: T } | { ok: false };

export interface FichaRendimiento {
  athlete_id: string;
  athlete_name: string;
  zones: Part<AthleteZoneProfile[]>;
  tests: Part<{ tests: CalibrationTestStatus[]; library: { id: string; name: string; last_done: string | null }[] }>;
  strength: Part<StrengthMaxView[]>;
  benchmarks: Part<BenchmarkSeries[]>;
  load: Part<LoadView>;
  body: Part<BodyPayload>;
  max_hr_bpm: number | null;
}

/** Días de la curva de carga que se pintan (PMC). */
export const PMC_DAYS = 90;
/** Días de historia con los que se calienta el fitness antes de pintar. */
const PMC_WARMUP_DAYS = 84;

async function part<T>(p: Promise<T>): Promise<Part<T>> {
  try {
    return { ok: true, data: await p };
  } catch {
    return { ok: false };
  }
}

async function loadBenchmarks(client: Sql, coach_id: number, athlete_id: number): Promise<BenchmarkSeries[]> {
  const rows = await client<Array<{ slug: string; value: number; unit: string; at: Date }>>`
    select ab.exercise_slug as slug, ab.value::float8 as value, ab.unit, ab.recorded_at as at
    from athlete_benchmarks ab
    join athletes a on a.id = ab.athlete_id and a.coach_id = ${coach_id}
    where ab.athlete_id = ${athlete_id}
    order by ab.exercise_slug, ab.recorded_at
  `;
  const by = new Map<string, BenchmarkSeries>();
  for (const r of rows) {
    const s = by.get(r.slug) ?? { exercise_slug: r.slug, label: benchmarkLabel(r.slug), unit: r.unit, results: [] };
    s.results.push({ value: r.value, recorded_at: r.at.toISOString() });
    by.set(r.slug, s);
  }
  return [...by.values()];
}

async function loadLoad(athlete_id: number, client: Sql): Promise<LoadView> {
  const daily = await getDailyTssSeries({
    athlete_id,
    end_date: new Date(),
    days: PMC_DAYS + PMC_WARMUP_DAYS,
    client,
  });
  const series = computeLoadSeries(daily).slice(-PMC_DAYS);
  const summary = summarizeLoad(daily);
  const coverage = readLoadCoverage(summary);
  return {
    series: series.map((p) => ({ date: p.date, ctl: p.ctl, atl: p.atl, tsb: p.tsb })),
    ctl: summary.ctl,
    atl: summary.atl,
    tsb: summary.tsb,
    acr: computeAcr(daily).acr,
    days_with_load: daily.slice(-PMC_DAYS).filter((d) => d.tss > 0).length,
    coverage_note: coverage.state === 'partial' ? coverage.note_es : null,
  };
}

export async function loadFichaRendimiento(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<FichaRendimiento> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const ath = params.athlete_id;
  const head = await client<Array<{ full_name: string; max_hr_bpm: number | null }>>`
    select full_name, max_hr_bpm from athletes where id = ${ath} and coach_id = ${coachId}
  `;
  const [zones, tests, strength, benchmarks, load, body] = await Promise.all([
    part(loadAthleteZoneProfiles({ coach_id: coachId, athlete_id: ath, client })),
    part(
      Promise.all([loadBatteryStatus(ath, client), listCoachTests(coachId, { onlyEnabled: true }, client)]).then(
        ([battery, lib]) => {
          const last = new Map<string, string>();
          for (const t of battery.tests) {
            if (!t.result_captured) continue;
            const prev = last.get(t.calibration_slug);
            if (!prev || t.scheduled_for > prev) last.set(t.calibration_slug, t.scheduled_for);
          }
          return {
            tests: battery.tests,
            library: lib.map((t) => ({ id: String(t.id), name: t.name, last_done: last.get(t.slug) ?? null })),
          };
        },
      ),
    ),
    part(
      Promise.all([
        loadStrengthMaxes({ coach_id: coachId, athlete_id: ath, client }),
        loadStrengthMaxHistory({ athlete_id: ath, client }),
      ]).then(([current, history]) =>
        current.map((m) => ({
          exercise_slug: m.exercise_slug,
          exercise_label: strengthLiftLabel(m.exercise_slug),
          one_rm_kg: m.one_rm_kg,
          recorded_at: m.recorded_at,
          source: m.source,
          history: history
            .filter((h) => h.exercise_slug === m.exercise_slug)
            .map((h) => ({ one_rm_kg: h.one_rm_kg, recorded_at: h.recorded_at })),
        })),
      ),
    ),
    part(loadBenchmarks(client, coachId, ath)),
    part(loadLoad(ath, client)),
    part(buildAthleteBody({ coach_id: coachId, athlete_id: ath, client })),
  ]);
  return {
    athlete_id: String(ath),
    athlete_name: head[0]?.full_name ?? '',
    zones,
    tests,
    strength,
    benchmarks,
    load,
    body,
    max_hr_bpm: head[0]?.max_hr_bpm ?? null,
  };
}
