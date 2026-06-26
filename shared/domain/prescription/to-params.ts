// prescriptionToParams — derive a scalar `params_json` SUMMARY from a structured
// Prescription, for TRANSITION back-compat. The studio now edits the structured
// `prescription_json`, but every other reader (iOS summary line, analytics, the
// legacy materializer path) still consumes scalar params. This helper keeps a
// faithful flat summary in sync so nothing downstream breaks while the structured
// model rolls out.
//
// CONTRACT: this is a LOSSY summary, not a round-trip. Per-set pyramids collapse
// to a representative scalar (sets count + first/uniform rep + a single target).
// The structured detail lives in `prescription_json`; this is the fallback.

import type { Measure, Prescription, PrescriptionSet, Target } from './types';
import { prescriptionTarget, setMeasure, setTarget } from './types';

// Use the block_exercises param names — the studio's WeekDayPartItem.params_json
// mirrors that vocabulary (sets/reps/load_pct/load_kg/rpe/rest_seconds/...). The
// pace / hr_bpm / calories keys are NEW scalar surfaces for cardio/erg/HYROX so
// iOS + analytics can read a target that used to vanish into free text.
export type ScalarParams = Record<string, number | string>;

// Flatten a Target onto scalar params. Ranges keep the floor as the scalar plus
// a "lo-hi" string hint so the summary line can still read the range.
function targetToParams(target: Target, out: ScalarParams): void {
  switch (target.kind) {
    case 'percent_rm': {
      if (target.value !== undefined) out.load_pct = target.value;
      else if (target.min !== undefined && target.max !== undefined) {
        out.load_pct = target.min;
        out.load_pct_range = `${target.min}-${target.max}`;
      } else if (target.min !== undefined) out.load_pct = target.min;
      else if (target.max !== undefined) out.load_pct = target.max;
      break;
    }
    case 'kg': {
      const v = target.value ?? target.min ?? target.max;
      if (v !== undefined) out.load_kg = v;
      break;
    }
    case 'rpe': {
      const v = target.value ?? target.min ?? target.max;
      if (v !== undefined) out.rpe = v;
      break;
    }
    case 'rir': {
      const v = target.value ?? target.min ?? target.max;
      if (v !== undefined) out.rir = v;
      break;
    }
    case 'bodyweight':
      break; // bodyweight carries no scalar target
    case 'hr_zone': {
      const v = target.value ?? target.min ?? target.max;
      if (v !== undefined) out.hr_zone = v;
      if (target.min !== undefined && target.max !== undefined && target.min !== target.max) {
        out.hr_zone_range = `${target.min}-${target.max}`;
      }
      break;
    }
    case 'hr_bpm': {
      if (target.min !== undefined) out.hr_bpm_min = target.min;
      if (target.max !== undefined) out.hr_bpm_max = target.max;
      if (target.value !== undefined) {
        out.hr_bpm_min = target.value;
        out.hr_bpm_max = target.value;
      }
      break;
    }
    case 'calories': {
      const v = target.value ?? target.min ?? target.max;
      if (v !== undefined) out.target_calories = v;
      break;
    }
    case 'watts': {
      const v = target.value ?? target.min ?? target.max;
      if (v !== undefined) out.watts = v;
      break;
    }
    case 'pace': {
      // Normalize every pace to seconds-per-km so analytics has one scalar, AND
      // keep the native unit's scalar so iOS can render the original unit.
      const native = target.value_s ?? target.min_s ?? target.max_s;
      if (native === undefined) break;
      const perKm = paceToPerKmSeconds(native, target.unit);
      out.pace_sec_per_km = Math.round(perKm);
      out.pace_unit = target.unit;
      out.pace_sec = Math.round(native);
      if (target.min_s !== undefined && target.max_s !== undefined && target.min_s !== target.max_s) {
        out.pace_sec_range = `${Math.round(target.min_s)}-${Math.round(target.max_s)}`;
      }
      break;
    }
  }
}

// Meters per unit for pace normalization. 1 mile = 1609.344 m (exact).
const METERS_PER_UNIT: Record<string, number> = {
  per_km: 1000,
  per_500m: 500,
  per_mile: 1609.344,
};

function paceToPerKmSeconds(secondsPerUnit: number, unit: string): number {
  const meters = METERS_PER_UNIT[unit] ?? 1000;
  return (secondsPerUnit / meters) * 1000;
}

// Pick the representative target across sets: the first set that carries one.
function representativeTarget(sets: PrescriptionSet[]): Target | undefined {
  for (const s of sets) {
    const t = setTarget(s);
    if (t) return t;
  }
  return undefined;
}

// Are all sets' rep counts the same? Then a single `reps` scalar is faithful.
function uniformReps(sets: PrescriptionSet[]): number | undefined {
  const reps = sets
    .map((s) => {
      const m = setMeasure(s);
      return m?.kind === 'reps' ? m.value : undefined;
    })
    .filter((r): r is number => r !== undefined);
  if (reps.length === 0) return undefined;
  const first = reps[0]!;
  return reps.every((r) => r === first) ? first : undefined;
}

/**
 * Derive a scalar params summary from a Prescription. Intended to be written to
 * `params_json` ALONGSIDE the structured `prescription_json` during transition,
 * so the existing summary line / materializer / iOS keep working.
 */
export function prescriptionToParams(p: Prescription): ScalarParams {
  const out: ScalarParams = {};

  // For-time / AFAP is scored by completion TIME, not by a fixed work duration.
  // Mark it so iOS/analytics render a "for time" result and read `total_s` as a
  // CAP (not the work duration the steady/amrap path would assume).
  if (p.scheme === 'for_time') {
    out.scored_by = 'time';
    if (p.total_s !== undefined) out.time_cap_seconds = p.total_s;
  }

  if (p.sets && p.sets.length > 0) {
    out.sets = p.sets.length;

    const reps = uniformReps(p.sets);
    if (reps !== undefined) out.reps = reps;
    else {
      const seq = p.sets
        .map((s) => {
          const m = setMeasure(s);
          return m?.kind === 'reps' ? m.value : undefined;
        })
        .filter((r): r is number => r !== undefined);
      if (seq.length === p.sets.length && seq.length > 1) out.reps_scheme = seq.join('/');
      else if (seq.length > 0) out.reps = seq[0]!;
    }

    // Per-set target wins; otherwise fall back to the BLOCK-level target. A
    // single-distance cardio bout (e.g. a steady run carrying its distance on
    // one representative set, with the pace/zone at block level) must still
    // surface its pace/zone in the scalar summary — without this fallback the
    // sets branch would drop the block target entirely.
    const target = representativeTarget(p.sets) ?? prescriptionTarget(p);
    if (target) targetToParams(target, out);

    // Per-set %RM sequence (60/65/70/70/75) → a hint string when it varies.
    const loadSeq = p.sets
      .map((s) => {
        const t = setTarget(s);
        return t?.kind === 'percent_rm' ? t.value : undefined;
      })
      .filter((v): v is number => v !== undefined);
    if (loadSeq.length === p.sets.length && new Set(loadSeq).size > 1) {
      out.load_pct_seq = loadSeq.join('/');
    }

    // Uniform rest across sets.
    const rests = Array.from(
      new Set(p.sets.map((s) => s.rest_s).filter((r): r is number => r !== undefined)),
    );
    if (rests.length === 1) out.rest_seconds = rests[0]!;

    // Per-set duration / distance / calories summary when uniform.
    const durs = collectMeasure(p.sets, 'duration');
    if (durs.length > 0 && new Set(durs).size === 1) out.duration_seconds = durs[0]!;
    const dists = collectMeasure(p.sets, 'distance');
    if (dists.length > 0 && new Set(dists).size === 1) out.distance_meters = dists[0]!;
    const cals = collectMeasure(p.sets, 'calories');
    if (cals.length > 0 && new Set(cals).size === 1) out.calories = cals[0]!;

    return out;
  }

  // Scheme-driven (conditioning) summary.
  if (p.rounds !== undefined) out.sets = p.rounds;
  if (p.work_s !== undefined) out.duration_seconds = p.work_s;
  if (p.rest_s !== undefined) out.rest_seconds = p.rest_s;
  // for_time's total_s is a CAP (already mapped to time_cap_seconds above), not a
  // work duration — don't overwrite duration_seconds with it.
  if (p.total_s !== undefined && p.scheme !== 'for_time') out.duration_seconds = p.total_s;

  // Block-level target (steady Z2 ride, @4:00/km tempo, hr_bpm band).
  const blockTarget = prescriptionTarget(p);
  if (blockTarget) targetToParams(blockTarget, out);

  return out;
}

// Collect the numeric value of a measure kind across sets.
function collectMeasure(sets: PrescriptionSet[], kind: Measure['kind']): number[] {
  const out: number[] = [];
  for (const s of sets) {
    const m = setMeasure(s);
    if (!m || m.kind !== kind) continue;
    if (m.kind === 'distance') out.push(m.meters);
    else if (m.kind === 'duration') out.push(m.seconds);
    else out.push(m.value);
  }
  return out;
}
