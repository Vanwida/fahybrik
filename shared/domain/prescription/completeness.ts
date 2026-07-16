// Prescription COMPLETENESS — the objective minimum dose a prescribed item must
// carry to be a real training item, per modality.
//
// `prescriptionSchema` answers "is this well-formed?"; it does NOT answer "is this
// a workout?". `{ scheme: 'sets' }` parses clean and is still garbage: three
// exercise names with no reps, no load, no rest is not a strength session. This
// module is the second gate — the one that separates a NAME from a PRESCRIPTION.
//
// The rule, stated once: every prescription is HOW the work is measured
// (distance | time | reps | calories) × AGAINST WHAT target (pace | zone | RPE |
// %RM | RIR) × BY MODALITY. A modality's minimum is what the athlete needs to
// execute the set without guessing.
//
// Pure + dependency-free (no I/O, no server-only) so both the composer and the
// import review grid run the identical gate.

import {
  setMeasure,
  setTarget,
  prescriptionTarget,
  type Measure,
  type Modality,
  type Prescription,
  type PrescriptionSet,
  type Target,
} from './types';

/** Where the item sits in the session. Warm-up/cool-down doses are unambiguous at
 *  face value ("trote suave 10'"), so they do not require an intensity target;
 *  a main set without one ("Back Squat 5×5" — at what load?) is ambiguous. */
export type PrescriptionRole = 'calentamiento' | 'principal' | 'vuelta';

export interface CompletenessResult {
  ok: boolean;
  /** Coach-facing reasons, in Spanish — surfaced verbatim as review reasons. */
  reasons: string[];
}

/** Schemes whose dose lives at the block level (a cap/round count), not per set. */
const CAPPED_SCHEMES = new Set(['amrap', 'emom', 'tabata', 'death_by']);

/** Targets that answer "how hard?" for a running/erg effort. */
const ENDURANCE_TARGETS = new Set<Target['kind']>([
  'pace',
  'hr_zone',
  'hr_bpm',
  'rpe',
  'watts',
]);

/** Targets that answer "how heavy?" for a strength set. */
const LOAD_TARGETS = new Set<Target['kind']>([
  'percent_rm',
  'kg',
  'rir',
  'rpe',
  'bodyweight',
]);

const MEASURE_LABEL: Record<Measure['kind'], string> = {
  reps: 'repeticiones',
  distance: 'distancia',
  duration: 'tiempo',
  calories: 'calorías',
};

/** The set's effective target: its own, else the block-level one it inherits. */
function effectiveTarget(s: PrescriptionSet, p: Prescription): Target | undefined {
  return setTarget(s) ?? prescriptionTarget(p);
}

function measureKinds(sets: PrescriptionSet[]): Array<Measure['kind'] | null> {
  return sets.map((s) => setMeasure(s)?.kind ?? null);
}

function listMeasures(kinds: Array<Measure['kind']>): string {
  return kinds.map((k) => MEASURE_LABEL[k]).join(' o ');
}

/**
 * Does this prescription carry the minimum dose its modality objectively needs?
 *
 * `modality` is the EXERCISE's modality (intrinsic to the catalog row, mig 0053) —
 * pass it from the catalog, not from `prescription.modality`, which is a hint the
 * writer may omit. When it is unknown we fall back to the universal floor (there
 * must be a dose at all) rather than inventing a stricter rule we cannot justify.
 */
export function checkPrescriptionCompleteness(
  p: Prescription,
  opts: { modality?: Modality | null; role?: PrescriptionRole } = {},
): CompletenessResult {
  const role = opts.role ?? 'principal';
  const modality = opts.modality ?? p.modality ?? null;
  const sets = p.sets ?? [];
  const reasons: string[] = [];

  // ── Universal floor: there must be a dose SOMEWHERE ───────────────────────
  // Either per-set work, or a block-level cap (AMRAP 12' / EMOM ×10) that makes
  // the total work explicit.
  const hasBlockDose =
    p.total_s != null || p.rounds != null || p.work_s != null;
  const hasSetDose = sets.some((s) => setMeasure(s) != null);
  if (!hasSetDose && !hasBlockDose) {
    return {
      ok: false,
      reasons: ['Sin dosis: no dice cuánto trabajo hacer (ni medida, ni tiempo, ni rondas).'],
    };
  }

  // A capped scheme must actually state its cap — an AMRAP with no duration and
  // no round count is not executable.
  if (CAPPED_SCHEMES.has(p.scheme) && !hasBlockDose) {
    reasons.push(`Formato ${p.scheme} sin límite: falta duración total o rondas.`);
  }

  // ── Per-modality minimums ─────────────────────────────────────────────────
  const needsTarget = role === 'principal';

  switch (modality) {
    case 'run': {
      requireSetMeasures(sets, ['distance', 'duration'], 'Correr', reasons);
      if (needsTarget) {
        requireSetTargets(sets, p, ENDURANCE_TARGETS, 'ritmo, zona, pulso o RPE', reasons);
      }
      requireIntervalRest(sets, reasons);
      break;
    }
    case 'row':
    case 'ski':
    case 'bike': {
      requireSetMeasures(sets, ['distance', 'duration', 'calories'], 'Ergo', reasons);
      if (needsTarget) {
        requireSetTargets(sets, p, ENDURANCE_TARGETS, 'ritmo /500m, watts, zona o RPE', reasons);
      }
      requireIntervalRest(sets, reasons);
      break;
    }
    case 'strength': {
      if (sets.length === 0) {
        reasons.push('Fuerza sin series: hacen falta series con repeticiones y carga.');
        break;
      }
      requireSetMeasures(sets, ['reps', 'duration'], 'Fuerza', reasons);
      if (needsTarget) {
        requireSetTargets(sets, p, LOAD_TARGETS, 'carga (%RM, kg, RIR o RPE)', reasons);
        // Rest between strength sets is part of the dose, not a nicety: the same
        // 5×5 at 2' and at 4' are different sessions.
        const missingRest = sets.slice(0, -1).some((s) => s.rest_s == null);
        if (missingRest && p.rest_s == null) {
          reasons.push('Fuerza sin descanso entre series.');
        }
      }
      break;
    }
    case 'core':
    case 'mobility': {
      requireSetMeasures(sets, ['reps', 'duration'], 'Core/movilidad', reasons);
      break;
    }
    case 'functional': {
      // A WOD movement's dose is its measure; the intensity is the cap/format, so
      // no per-set target is required (10 burpees is 10 burpees).
      if (!CAPPED_SCHEMES.has(p.scheme)) {
        requireSetMeasures(sets, ['reps', 'distance', 'duration', 'calories'], 'Funcional', reasons);
      }
      break;
    }
    default:
      // Unknown/other modality: the universal floor above is all we can justify.
      break;
  }

  return { ok: reasons.length === 0, reasons };
}

function requireSetMeasures(
  sets: PrescriptionSet[],
  allowed: Array<Measure['kind']>,
  label: string,
  reasons: string[],
): void {
  if (sets.length === 0) return; // block-level dose already accepted upstream.
  const kinds = measureKinds(sets);
  const allowedSet = new Set(allowed);
  const bad = kinds.filter((k) => k == null || !allowedSet.has(k));
  if (bad.length > 0) {
    reasons.push(`${label}: cada serie necesita ${listMeasures(allowed)}.`);
  }
}

function requireSetTargets(
  sets: PrescriptionSet[],
  p: Prescription,
  allowed: Set<Target['kind']>,
  label: string,
  reasons: string[],
): void {
  if (sets.length === 0) {
    // No sets, but a block dose exists (e.g. steady with only total_s): the
    // block-level target must then carry the intensity.
    const t = prescriptionTarget(p);
    if (!t || !allowed.has(t.kind)) reasons.push(`Sin objetivo: falta ${label}.`);
    return;
  }
  const missing = sets.some((s) => {
    const t = effectiveTarget(s, p);
    return !t || !allowed.has(t.kind);
  });
  if (missing) reasons.push(`Sin objetivo: falta ${label}.`);
}

/** Multi-set endurance work is intervals; intervals without a recovery are not
 *  prescribed. The last set needs no rest (the session ends). */
function requireIntervalRest(sets: PrescriptionSet[], reasons: string[]): void {
  if (sets.length < 2) return;
  const missing = sets.slice(0, -1).some((s) => s.rest_s == null);
  if (missing) reasons.push('Series sin descanso entre repeticiones.');
}
