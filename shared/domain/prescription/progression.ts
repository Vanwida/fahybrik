// Progression — apply a coach-configured per-loop PROGRESSIVE OVERLOAD increment
// to a materialized Prescription when an athlete REPEATS a microciclo sequence.
//
// WHY THIS EXISTS
// ---------------
// A program_sequence (one matrix cell) carries a per-loop lever the coach sets in
// the SequenceEditor: `progression_pct` (0-100) + `progression_applies_to`
// (strength_load | volume | pace). On end_policy='repeat' the sequence loops; each
// completed loop should make the work HARDER by that %. Until now the loop
// re-materialized VERBATIM and the lever was ignored. This module is the single
// source of truth for HOW the % scales the doses — the assign/advance pipeline
// only DECIDES the scope+amount (from the coach's field) and the loop index; it
// does NOT design method here.
//
// SCOPE IS HONORED STRICTLY (one source of truth = the coach's field):
//   · strength_load → scales intensity targets of kind `percent_rm` / `kg` ONLY.
//                     RPE/RIR/HR-zone/pace are NEVER touched (no lever selects
//                     them) — so the RPE ceiling / "don't flat-scale zones"
//                     constraints hold structurally.
//   · volume        → scales the WORK measures (reps / distance / duration /
//                     calories) per set + the `rounds` count. Targets untouched.
//                     The NUMBER of set entries is not changed (synthesizing new
//                     set specs would invent method); reps/rounds carry the volume.
//   · pace          → scales `pace` targets FASTER (fewer seconds per unit),
//                     floored so they never reach zero. Loads/volume untouched.
//
// CUMULATIVE MODEL: per-step compounding. On the N-th loop the factor is applied
// N times relative to the base template (the template is NEVER mutated — every
// loop re-materializes from the same library microciclo, so the factor must carry
// the full cumulative overload). loads/volume grow as (1+pct)^N; pace improves as
// (1-pct)^N. N=0 (initial assign / first pass) ⇒ factor 1 ⇒ verbatim.
//
// DETERMINISTIC: pure function, fixed rounding to sensible increments, hard caps.

import type { Measure, Prescription, Target } from './types';
import type { SequenceProgressionTarget } from '../../schema/program-sequences';

// ── Bounds & increments (named, not magic) ──────────────────────────────────
const PERCENT_RM_CAP = 100; // auto-progression never drives %1RM past 100 (supramaximal is a coach choice, not an emergent side-effect)
const KG_STEP = 2.5; // round absolute load to the nearest plate-sensible increment
const DISTANCE_STEP_M = 5; // round progressed distance to a clean 5 m
const DURATION_STEP_S = 5; // round progressed duration to a clean 5 s
const PACE_FLOOR_S = 1; // a pace target can never reach 0 s (physically impossible)
const ROUNDS_MIN = 1; // a circuit always has at least one round

export interface ProgressionSpec {
  /** WHICH dose dimension the coach's lever scales (program_sequences.progression_applies_to). */
  appliesTo: SequenceProgressionTarget;
  /** Per-loop percentage (program_sequences.progression_pct), 0-100. */
  pct: number;
  /** Completed loops under end_policy=repeat. 0 ⇒ no change (verbatim). */
  loops: number;
}

/** Cumulative OVERLOAD factor for loads/volume — grows the work. `(1+pct/100)^loops`. */
export function progressionFactor(pct: number, loops: number): number {
  if (pct <= 0 || loops <= 0) return 1;
  return Math.pow(1 + pct / 100, loops);
}

/** Cumulative pace IMPROVEMENT factor — shrinks seconds (faster). `(1-pct/100)^loops`, clamped ≥0. */
function paceImprovementFactor(pct: number, loops: number): number {
  if (pct <= 0 || loops <= 0) return 1;
  return Math.pow(Math.max(0, 1 - pct / 100), loops);
}

// ── Rounders (deterministic) ─────────────────────────────────────────────────
const roundToStep = (v: number, step: number) => Math.round(v / step) * step;
const scalePercentRm = (v: number, f: number) =>
  Math.min(PERCENT_RM_CAP, Math.max(0, Math.round(v * f)));
const scaleKg = (v: number, f: number) => Math.max(0, roundToStep(v * f, KG_STEP));
const scaleReps = (v: number, f: number) => Math.max(0, Math.round(v * f));
const scaleDistance = (v: number, f: number) => Math.max(0, roundToStep(v * f, DISTANCE_STEP_M));
const scaleDuration = (v: number, f: number) => Math.max(0, roundToStep(v * f, DURATION_STEP_S));
const scaleCalories = (v: number, f: number) => Math.max(0, Math.round(v * f));
const scaleRounds = (v: number, f: number) => Math.max(ROUNDS_MIN, Math.round(v * f));
const scalePaceSeconds = (v: number, pf: number) => Math.max(PACE_FLOOR_S, Math.round(v * pf));

/** Apply `fn` to whichever of value/min/max are present on a scalar target. */
function mapScalar<T extends { value?: number; min?: number; max?: number }>(
  t: T,
  fn: (v: number) => number,
): T {
  const o = { ...t };
  if (o.value !== undefined) o.value = fn(o.value);
  if (o.min !== undefined) o.min = fn(o.min);
  if (o.max !== undefined) o.max = fn(o.max);
  return o;
}

/** strength_load: scale %RM / kg targets; leave every other intensity kind untouched. */
function scaleLoadTarget(t: Target, f: number): Target {
  if (t.kind === 'percent_rm') return mapScalar(t, (v) => scalePercentRm(v, f));
  if (t.kind === 'kg') return mapScalar(t, (v) => scaleKg(v, f));
  return t;
}

/** pace: scale a pace target's seconds FASTER; leave every other kind untouched. */
function scalePaceTarget(t: Target, pf: number): Target {
  if (t.kind !== 'pace') return t;
  const o = { ...t };
  if (o.value_s !== undefined) o.value_s = scalePaceSeconds(o.value_s, pf);
  if (o.min_s !== undefined) o.min_s = scalePaceSeconds(o.min_s, pf);
  if (o.max_s !== undefined) o.max_s = scalePaceSeconds(o.max_s, pf);
  return o;
}

/** volume: scale the work measure of a set (reps/distance/duration/calories). */
function scaleMeasure(m: Measure, f: number): Measure {
  switch (m.kind) {
    case 'reps':
      return { kind: 'reps', value: scaleReps(m.value, f) };
    case 'distance':
      return { kind: 'distance', meters: scaleDistance(m.meters, f) };
    case 'duration':
      return { kind: 'duration', seconds: scaleDuration(m.seconds, f) };
    case 'calories':
      return { kind: 'calories', value: scaleCalories(m.value, f) };
  }
}

// Legacy back-compat alias keys on a set — once the canonical measure/target are
// scaled, the (now stale) aliases are dropped so the progressed line has ONE
// source of truth (avoids the two-loader divergence). Safe because the parsed
// Prescription has already lifted every alias onto its canonical field.
const SET_LEGACY_KEYS = ['reps', 'duration_s', 'distance_m', 'rpe', 'rir', 'hr_zone', 'load'] as const;

/**
 * Apply the coach's per-loop progression to a (parsed, normalized) Prescription.
 * Returns a fresh, canonical-only Prescription. A no-op (returns the input) when
 * the effective factor is 1 (pct 0 / loops 0). The input is treated as immutable.
 *
 * PRECONDITION: `prescription` is the output of prescriptionSchema parsing, so its
 * canonical `measure`/`target` fields are populated (legacy aliases already lifted).
 */
export function applyProgression(prescription: Prescription, spec: ProgressionSpec): Prescription {
  const isPace = spec.appliesTo === 'pace';
  const factor = isPace
    ? paceImprovementFactor(spec.pct, spec.loops)
    : progressionFactor(spec.pct, spec.loops);
  if (factor === 1) return prescription;

  // JSON clone (Prescription is JSON-safe) — same zero-surprise pattern the
  // materializer already uses when persisting prescription_json.
  const out = JSON.parse(JSON.stringify(prescription)) as Prescription;

  switch (spec.appliesTo) {
    case 'strength_load':
      if (out.target) out.target = scaleLoadTarget(out.target, factor);
      if (out.sets) {
        out.sets = out.sets.map((s) => (s.target ? { ...s, target: scaleLoadTarget(s.target, factor) } : s));
      }
      break;
    case 'volume':
      if (out.rounds != null) out.rounds = scaleRounds(out.rounds, factor);
      if (out.sets) {
        out.sets = out.sets.map((s) =>
          s.measure ? { ...s, measure: scaleMeasure(s.measure, factor) } : s,
        );
      }
      break;
    case 'pace':
      if (out.target) out.target = scalePaceTarget(out.target, factor);
      if (out.sets) {
        out.sets = out.sets.map((s) => (s.target ? { ...s, target: scalePaceTarget(s.target, factor) } : s));
      }
      break;
  }

  // Drop now-stale legacy aliases so the progressed line is canonical-only.
  if (out.sets) {
    out.sets = out.sets.map((s) => {
      const clean = { ...s } as Record<string, unknown>;
      for (const k of SET_LEGACY_KEYS) delete clean[k];
      return clean as typeof s;
    });
  }
  if (out.hr_zone !== undefined) delete out.hr_zone;

  return out;
}
