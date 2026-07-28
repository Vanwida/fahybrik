// Progress-readiness logic — AGNOSTIC replacement for the legacy ATR transition
// engine. Answers ONE question: is this athlete ready to PROGRESS to the next
// microciclo in the coach's ordered sequence? There is no fixed periodization
// (no ACC→TRANS→REAL): the ORDER of the coach's microciclos IS the plan, so this
// emits a generic advance/hold/regress signal from compliance + load + benchmark
// progression + microciclo completion. The coach has the final call — nothing
// auto-promotes; the engine just surfaces a defensible suggestion.
//
// Thresholds are Pablo's tuning, carried verbatim from the prior ATR engine.
//
// DEFENSIBLE means the evidence exists. Where a signal is missing — nothing was
// scheduled yet, or part of the executed work has no intensity — the engine
// holds at LOW confidence and names the gap, instead of filling it with a
// flattering default. See docs/CONTRATO-UI.md §7.

import type { Sql } from 'postgres';
import { LOAD_COVERAGE_MIN, getLoadSummary, loadIntensityCoverage } from '../training-load';
import { adherencePct } from '../adherence/completion';
import { addDays, isoDateString, parseIsoDate, startOfDayInBox } from '../dates';
import { getCurrentMicrociclo } from './current-microciclo';

export type ProgressRecommendation = 'advance' | 'hold' | 'regress';

export type ProgressFlag =
  | 'compliance_low'
  | 'compliance_unknown'
  | 'overreaching'
  | 'undertrained'
  | 'load_partial'
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
  /**
   * 0..1 — completed assignments / scheduled assignments in the current
   * microciclo. NULL when nothing was due yet: with no scheduled work adherence
   * is UNDEFINED, not perfect. Treating it as 1 handed the coach a 100 %
   * adherencia (and an "advance" with high confidence) for an athlete who had
   * not trained at all.
   */
  compliance_pct: number | null;
  load: {
    ctl: number;
    atl: number;
    tsb: number;
    acr: number;
    /**
     * Share 0..1 of the chronic window's executed work whose intensity was
     * known. Null when nothing was executed. Below LOAD_COVERAGE_MIN the load
     * numbers are a partial view and the engine says so instead of ruling on it.
     */
    intensity_coverage: number | null;
  };
  /** Mean % change vs pre-microciclo baseline across tracked benchmarks. Null if no data. */
  benchmark_progression_pct: number | null;
};

// Empirical thresholds — Pablo tunes with real data (verbatim from prior engine).
const COMPLIANCE_MIN = 0.75; // < 75% missed sessions → hold
const ACR_OVERREACH = 1.5; // > 1.5 sustained → high injury risk
const ACR_UNDERTRAINED = 0.5; // < 0.5 → not enough stimulus to advance
const TSB_OVERREACH = -25; // very negative → too fatigued
const BENCHMARK_REGRESSION_PCT = -2.0; // < -2% mean → fitness lost
// LOAD_COVERAGE_MIN is imported, not redeclared: it is a property of a load
// reading, and this engine must draw the line exactly where the roster and the
// deep-dive draw it. See shared/domain/training-load/coverage.ts.

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

  if (input.compliance_pct == null) {
    flags.push('compliance_unknown');
    reasons.push('Adherencia: aún no había sesiones programadas en el microciclo — no se puede medir.');
  } else if (input.compliance_pct < COMPLIANCE_MIN) {
    flags.push('compliance_low');
    reasons.push(
      `Adherencia ${(input.compliance_pct * 100).toFixed(0)}% por debajo del umbral ${COMPLIANCE_MIN * 100}%.`,
    );
  } else {
    reasons.push(`Adherencia ${(input.compliance_pct * 100).toFixed(0)}%.`);
  }

  // Load coverage first: it decides which load claims can be made at all.
  const coverage = input.load.intensity_coverage;
  const loadPartial = coverage != null && coverage < LOAD_COVERAGE_MIN;
  if (loadPartial) {
    flags.push('load_partial');
    reasons.push(
      `Solo se conoce la intensidad del ${(coverage * 100).toFixed(0)}% del trabajo: la carga es una lectura parcial.`,
    );
  }

  if (input.load.acr > ACR_OVERREACH || input.load.tsb < TSB_OVERREACH) {
    // Sobrecarga survives partial coverage: the load we DID price already clears
    // the threshold, and unmeasured work can only add more on top.
    flags.push('overreaching');
    reasons.push(
      `Señal de sobrecarga: ACR ${input.load.acr.toFixed(2)} / TSB ${input.load.tsb.toFixed(0)}.`,
    );
  } else if (!loadPartial && input.load.acr < ACR_UNDERTRAINED && input.load.ctl > 0) {
    // "Infraentrenado" is a claim of ABSENCE of stimulus — unclaimable while we
    // know there is training we could not price.
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
  } else if (flags.includes('compliance_unknown') || flags.includes('load_partial')) {
    // No adherence evidence, or a load reading with holes in it: there is no
    // defensible case for progressing. Hold, at LOW confidence so the coach sees
    // this is an absence of evidence, not a judgement about the athlete. The
    // reasons above name exactly what is missing.
    recommendation = 'hold';
    confidence = 'low';
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
  load: { ctl: number; atl: number; tsb: number; acr: number; intensity_coverage: number | null };
  /** 0..1, or null when nothing was due yet in the microciclo (see the input type). */
  compliance_pct: number | null;
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
  // adherencePct is the SINGLE SOURCE OF TRUTH for this number (shared/domain/
  // adherence/completion.ts): it already returns null when nothing was due, and
  // rounds to the same integer percent the roster and /hoy show, so the engine
  // and the coach's screens can never disagree. Kept here as a 0..1 fraction
  // because the thresholds above are fractions.
  const scheduled = complianceRows[0]?.scheduled ?? 0;
  const completed = complianceRows[0]?.completed ?? 0;
  const compliancePctInt = adherencePct(scheduled, completed);
  const compliance_pct = compliancePctInt == null ? null : compliancePctInt / 100;

  const loadSummary = await getLoadSummary({
    athlete_id: params.athlete_id,
    on_date: today,
    client,
  });
  const load = {
    ctl: loadSummary.ctl,
    atl: loadSummary.atl,
    tsb: loadSummary.tsb,
    acr: loadSummary.acr,
    intensity_coverage: loadIntensityCoverage(loadSummary),
  };

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
    load,
    benchmark_progression_pct,
  });

  return {
    ...readiness,
    current_microciclo: current.name,
    load,
    compliance_pct,
  };
}
