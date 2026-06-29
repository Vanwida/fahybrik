// Progress-readiness logic — AGNOSTIC replacement for the legacy ATR transition
// engine. Answers ONE question: is this athlete ready to PROGRESS to the next
// microciclo in the coach's ordered sequence? There is no fixed periodization
// (no ACC→TRANS→REAL): the ORDER of the coach's microciclos IS the plan, so this
// emits a generic advance/hold/regress signal from compliance + load + benchmark
// progression + microciclo completion. The coach has the final call — nothing
// auto-promotes; the engine just surfaces a defensible suggestion.
//
// Thresholds are Pablo's tuning, carried verbatim from the prior ATR engine.

import type { Sql } from 'postgres';
import { getLoadSummary } from '../training-load';
import { addDays, isoDateString, parseIsoDate, startOfDayInBox } from '../dates';
import { getCurrentMicrociclo } from './current-microciclo';

export type ProgressRecommendation = 'advance' | 'hold' | 'regress';

export type ProgressFlag =
  | 'compliance_low'
  | 'overreaching'
  | 'undertrained'
  | 'benchmarks_regressed'
  | 'microciclo_underdone'
  | 'microciclo_complete';

export type ProgressReadiness = {
  recommendation: ProgressRecommendation;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[]; // human-readable, displayed to coach
  flags: ProgressFlag[]; // structured, for UI gating
};

export type ProgressReadinessInput = {
  /** 1-based week reached within the current microciclo. */
  week_index: number;
  /** Total weeks of the current microciclo. */
  week_count: number;
  /** 0..1 — completed assignments / scheduled assignments in current microciclo. */
  compliance_pct: number;
  load: { ctl: number; atl: number; tsb: number; acr: number };
  /** Mean % change vs pre-microciclo baseline across tracked benchmarks. Null if no data. */
  benchmark_progression_pct: number | null;
};

// Empirical thresholds — Pablo tunes with real data (verbatim from prior engine).
const COMPLIANCE_MIN = 0.75; // < 75% missed sessions → hold
const ACR_OVERREACH = 1.5; // > 1.5 sustained → high injury risk
const ACR_UNDERTRAINED = 0.5; // < 0.5 → not enough stimulus to advance
const TSB_OVERREACH = -25; // very negative → too fatigued
const BENCHMARK_REGRESSION_PCT = -2.0; // < -2% mean → fitness lost

export function assessProgressReadiness(input: ProgressReadinessInput): ProgressReadiness {
  const reasons: string[] = [];
  const flags: ProgressFlag[] = [];

  const microComplete = input.week_index >= input.week_count;
  if (microComplete) {
    flags.push('microciclo_complete');
    reasons.push(`Microciclo: ${input.week_index}/${input.week_count} semanas completadas.`);
  } else {
    flags.push('microciclo_underdone');
    reasons.push(`Microciclo: solo ${input.week_index}/${input.week_count} semanas hechas.`);
  }

  if (input.compliance_pct < COMPLIANCE_MIN) {
    flags.push('compliance_low');
    reasons.push(
      `Adherencia ${(input.compliance_pct * 100).toFixed(0)}% por debajo del umbral ${COMPLIANCE_MIN * 100}%.`,
    );
  } else {
    reasons.push(`Adherencia ${(input.compliance_pct * 100).toFixed(0)}%.`);
  }

  if (input.load.acr > ACR_OVERREACH || input.load.tsb < TSB_OVERREACH) {
    flags.push('overreaching');
    reasons.push(
      `Señal de sobrecarga: ACR ${input.load.acr.toFixed(2)} / TSB ${input.load.tsb.toFixed(0)}.`,
    );
  } else if (input.load.acr < ACR_UNDERTRAINED && input.load.ctl > 0) {
    flags.push('undertrained');
    reasons.push(`Infraentrenado: ACR ${input.load.acr.toFixed(2)} por debajo de ${ACR_UNDERTRAINED}.`);
  }

  if (
    input.benchmark_progression_pct != null &&
    input.benchmark_progression_pct < BENCHMARK_REGRESSION_PCT
  ) {
    flags.push('benchmarks_regressed');
    reasons.push(
      `Benchmarks regresaron ${input.benchmark_progression_pct.toFixed(1)}% vs baseline.`,
    );
  } else if (input.benchmark_progression_pct != null) {
    reasons.push(
      `Benchmarks ${input.benchmark_progression_pct >= 0 ? '+' : ''}${input.benchmark_progression_pct.toFixed(1)}% vs baseline.`,
    );
  }

  let recommendation: ProgressRecommendation;
  let confidence: ProgressReadiness['confidence'];

  if (flags.includes('overreaching')) {
    recommendation = 'regress';
    confidence = 'high';
  } else if (flags.includes('benchmarks_regressed') && flags.includes('microciclo_complete')) {
    recommendation = 'hold';
    confidence = 'medium';
  } else if (flags.includes('compliance_low') || flags.includes('microciclo_underdone')) {
    recommendation = 'hold';
    confidence = 'high';
  } else if (flags.includes('microciclo_complete') && !flags.includes('undertrained')) {
    recommendation = 'advance';
    confidence = input.benchmark_progression_pct != null ? 'high' : 'medium';
  } else if (flags.includes('undertrained')) {
    recommendation = 'hold';
    confidence = 'medium';
  } else {
    recommendation = 'hold';
    confidence = 'low';
  }

  return { recommendation, confidence, reasons, flags };
}

export type AthleteProgressReadiness = ProgressReadiness & {
  /** Current microciclo NAME (coach data), null when none active. */
  current_microciclo: string | null;
  load: { ctl: number; atl: number; tsb: number; acr: number };
  compliance_pct: number;
};

/**
 * DB-bound readiness assessment — AGNOSTIC replacement for the prior
 * `recommendAthleteTransition`. Scopes compliance + benchmark progression to the
 * CURRENT microciclo dated window (athlete_month_assignments), no periodization tables.
 */
export async function assessAthleteProgressReadiness(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<AthleteProgressReadiness | null> {
  const client = params.client;
  const today = startOfDayInBox(params.on_date ?? new Date());

  const current = await getCurrentMicrociclo({
    athlete_id: params.athlete_id,
    on_date: today,
    client,
  });
  if (!current) return null;

  const todayIso = isoDateString(today);

  // Compliance for the current microciclo window: completed / scheduled (past-dated).
  const complianceRows = await client<Array<{ scheduled: number; completed: number }>>`
    select
      count(*) filter (where wa.scheduled_for <= ${todayIso}::date)::int as scheduled,
      count(*) filter (
        where wa.scheduled_for <= ${todayIso}::date and wa.status = 'completed'
      )::int as completed
    from workout_assignments wa
    where wa.athlete_id = ${params.athlete_id as number}
      and wa.scheduled_for >= ${current.assignment_start}::date
      and wa.scheduled_for <= ${current.assignment_end}::date
  `;
  const compliance_pct = complianceRows[0]?.scheduled
    ? complianceRows[0].completed / complianceRows[0].scheduled
    : 1;

  const load = await getLoadSummary({
    athlete_id: params.athlete_id,
    on_date: today,
    client,
  });

  // Benchmark progression — mean % IMPROVEMENT of latest value within this
  // microciclo vs the most recent value before it started, per exercise_slug.
  // DIRECTION-AWARE: time benchmarks (unit='seconds': 5k, threshold, ergo TTs)
  // improve when the value DROPS, so improvement = (baseline - current)/baseline;
  // load/rep benchmarks (kg, reps) improve when the value RISES. Without this, a
  // faster 5 km would read as a regression and a heavier squat as progress on the
  // same scale — incoherent. Null if no comparable data.
  const microStartIso = current.assignment_start;
  let benchmark_progression_pct: number | null = null;
  const benchRows = await client<Array<{ pct_change: number }>>`
    with current as (
      select distinct on (exercise_slug)
        exercise_slug, value, unit, recorded_at
      from athlete_benchmarks
      where athlete_id = ${params.athlete_id as number}
        and recorded_at >= ${microStartIso}::date
      order by exercise_slug, recorded_at desc
    ),
    baseline as (
      select distinct on (exercise_slug)
        exercise_slug, value
      from athlete_benchmarks
      where athlete_id = ${params.athlete_id as number}
        and recorded_at < ${microStartIso}::date
      order by exercise_slug, recorded_at desc
    )
    select
      (
        case
          when c.unit = 'seconds' then (b.value - c.value)
          else (c.value - b.value)
        end / nullif(b.value, 0) * 100
      )::float as pct_change
    from current c
    join baseline b using (exercise_slug)
    where b.value > 0
  `;
  if (benchRows.length > 0) {
    const sum = benchRows.reduce((s, r) => s + (r.pct_change ?? 0), 0);
    benchmark_progression_pct = sum / benchRows.length;
  }

  // Weeks completed: full microciclo weeks elapsed by today.
  const microStart = parseIsoDate(microStartIso);
  const lastFullWeekEnd = addDays(microStart, (current.week_index - 1) * 7 + 6);
  const weekBoost = today.getTime() >= lastFullWeekEnd.getTime() ? 1 : 0;

  const readiness = assessProgressReadiness({
    week_index: Math.min(current.week_index + weekBoost, current.week_count),
    week_count: current.week_count,
    compliance_pct,
    load: { ctl: load.ctl, atl: load.atl, tsb: load.tsb, acr: load.acr },
    benchmark_progression_pct,
  });

  return {
    ...readiness,
    current_microciclo: current.name,
    load: { ctl: load.ctl, atl: load.atl, tsb: load.tsb, acr: load.acr },
    compliance_pct,
  };
}
