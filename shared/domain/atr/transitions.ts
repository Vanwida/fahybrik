// Transition logic — when can an athlete advance to the next ATR block?
//
// Inputs (all already aggregated by the caller, so this is pure):
//   - current_block_type
//   - compliance_pct: completed assignments / scheduled in current block
//   - load: { ctl, atl, tsb, acr }
//   - benchmark_progression: pct improvement vs baseline on key tests
//   - weeks_completed_in_block / planned_weeks_in_block
//
// Output: a recommendation with reasons. The coach has the final call —
// nothing auto-promotes; the engine just surfaces a defensible suggestion.

import type { AtrBlockType } from './planner';

export type TransitionRecommendation = {
  recommendation: 'advance' | 'hold' | 'regress';
  next_block_type: AtrBlockType | null;       // null when at end of macrocycle
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];                          // human-readable, displayed to coach
  flags: TransitionFlag[];                    // structured, for UI gating
};

export type TransitionFlag =
  | 'compliance_low'
  | 'overreaching'
  | 'undertrained'
  | 'benchmarks_regressed'
  | 'block_underdone'
  | 'block_complete';

export type TransitionInput = {
  current_block_type: AtrBlockType;
  weeks_completed_in_block: number;
  planned_weeks_in_block: number;
  /** 0..1 — completed assignments / scheduled assignments. */
  compliance_pct: number;
  load: {
    ctl: number;
    atl: number;
    tsb: number;
    acr: number;
  };
  /** Mean % change vs pre-block baseline across tracked benchmarks. Null if no data. */
  benchmark_progression_pct: number | null;
};

const NEXT_BLOCK: Record<AtrBlockType, AtrBlockType | null> = {
  ACC: 'TRANS',
  TRANS: 'REAL',
  REAL: null, // peaking is the terminal block
};

// Empirical thresholds — Pablo will tune with real data.
const COMPLIANCE_MIN = 0.75;            // < 75% missed sessions → hold
const ACR_OVERREACH = 1.5;              // > 1.5 sustained → high injury risk
const ACR_UNDERTRAINED = 0.5;           // < 0.5 → not enough stimulus to advance
const TSB_OVERREACH = -25;              // very negative → too fatigued
const BENCHMARK_REGRESSION_PCT = -2.0;  // < -2% mean → fitness lost

export function recommendTransition(input: TransitionInput): TransitionRecommendation {
  const reasons: string[] = [];
  const flags: TransitionFlag[] = [];

  const blockComplete = input.weeks_completed_in_block >= input.planned_weeks_in_block;
  if (blockComplete) {
    flags.push('block_complete');
    reasons.push(
      `Block ${input.current_block_type}: ${input.weeks_completed_in_block}/${input.planned_weeks_in_block} weeks completed.`,
    );
  } else {
    flags.push('block_underdone');
    reasons.push(
      `Block ${input.current_block_type}: only ${input.weeks_completed_in_block}/${input.planned_weeks_in_block} weeks done.`,
    );
  }

  if (input.compliance_pct < COMPLIANCE_MIN) {
    flags.push('compliance_low');
    reasons.push(`Compliance ${(input.compliance_pct * 100).toFixed(0)}% below ${COMPLIANCE_MIN * 100}% threshold.`);
  } else {
    reasons.push(`Compliance ${(input.compliance_pct * 100).toFixed(0)}%.`);
  }

  if (input.load.acr > ACR_OVERREACH || input.load.tsb < TSB_OVERREACH) {
    flags.push('overreaching');
    reasons.push(
      `Overreaching signal: ACR ${input.load.acr.toFixed(2)} / TSB ${input.load.tsb.toFixed(0)}.`,
    );
  } else if (input.load.acr < ACR_UNDERTRAINED && input.load.ctl > 0) {
    flags.push('undertrained');
    reasons.push(`Undertrained: ACR ${input.load.acr.toFixed(2)} below ${ACR_UNDERTRAINED}.`);
  }

  if (
    input.benchmark_progression_pct != null &&
    input.benchmark_progression_pct < BENCHMARK_REGRESSION_PCT
  ) {
    flags.push('benchmarks_regressed');
    reasons.push(`Benchmarks regressed ${input.benchmark_progression_pct.toFixed(1)}% vs baseline.`);
  } else if (input.benchmark_progression_pct != null) {
    reasons.push(`Benchmarks ${input.benchmark_progression_pct >= 0 ? '+' : ''}${input.benchmark_progression_pct.toFixed(1)}% vs baseline.`);
  }

  // Decision tree.
  let recommendation: TransitionRecommendation['recommendation'];
  let confidence: TransitionRecommendation['confidence'];

  if (flags.includes('overreaching')) {
    recommendation = 'regress';
    confidence = 'high';
  } else if (flags.includes('benchmarks_regressed') && flags.includes('block_complete')) {
    recommendation = 'hold';
    confidence = 'medium';
  } else if (flags.includes('compliance_low') || flags.includes('block_underdone')) {
    recommendation = 'hold';
    confidence = 'high';
  } else if (flags.includes('block_complete') && !flags.includes('undertrained')) {
    recommendation = 'advance';
    confidence = input.benchmark_progression_pct != null ? 'high' : 'medium';
  } else if (flags.includes('undertrained')) {
    recommendation = 'hold';
    confidence = 'medium';
  } else {
    recommendation = 'hold';
    confidence = 'low';
  }

  return {
    recommendation,
    next_block_type: NEXT_BLOCK[input.current_block_type],
    confidence,
    reasons,
    flags,
  };
}
