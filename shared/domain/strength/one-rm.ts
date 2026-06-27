// 1RM estimators — the documented standard formulas for predicting a one-rep max
// from a multi-rep set (weight × reps). These are NOT a model choice: they are the
// canonical strength-coaching equations. WHICH one a coach uses is their decision
// (coach_methodology.one_rm_estimation, default Epley); the math here is agnostic.

export const ONE_RM_METHODS = ['Epley', 'Brzycki', 'Lombardi'] as const;
export type OneRmMethod = (typeof ONE_RM_METHODS)[number];

/**
 * Estimate a one-rep max (kg) from a set of `reps` at `weightKg`.
 *
 * Formulas (standard 1RM estimators):
 *   · Epley    — weight × (1 + reps/30)
 *   · Brzycki  — weight × 36 / (37 − reps)
 *   · Lombardi — weight × reps^0.10
 *
 * Convention for a true single (`reps === 1`): return the weight itself. A 1-rep
 * lift IS the max — the multi-rep formulas overestimate at 1 rep (Epley → +3.3%,
 * Brzycki → 0% by coincidence, Lombardi → 0%), so we short-circuit to the lifted
 * weight to keep direct maxes exact regardless of method.
 *
 * Result is rounded to 1 decimal.
 */
export function estimateOneRm(weightKg: number, reps: number, method: OneRmMethod = 'Epley'): number {
  if (weightKg <= 0) {
    throw new Error('estimateOneRm: weightKg must be > 0');
  }
  if (!Number.isInteger(reps) || reps < 1) {
    throw new Error('estimateOneRm: reps must be a positive integer');
  }

  // A true single is the max — no estimation needed.
  if (reps === 1) {
    return round1(weightKg);
  }

  let oneRm: number;
  switch (method) {
    case 'Epley':
      oneRm = weightKg * (1 + reps / 30);
      break;
    case 'Brzycki':
      oneRm = (weightKg * 36) / (37 - reps);
      break;
    case 'Lombardi':
      oneRm = weightKg * Math.pow(reps, 0.1);
      break;
  }
  return round1(oneRm);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
