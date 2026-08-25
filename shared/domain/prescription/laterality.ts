// Laterality of a prescription LINE (card 128 · hueco 2).
//
// The catalog already knows whether a movement CAN be done on one side
// (`exercises.is_unilateral`). That is capability. This field says whether
// THIS line's measure is per side, so volume and reps count both sides.
//
// The number the coach wrote stays on the measure (8). The field says it
// is 8 per side. Analytics multiplies by 2. Absent = total, which is what
// every older row meant.
//
// Not a new exercise. "Box jump a una pierna" is a different movement and
// does not enter here. Only the words that mean count-per-side: por lado,
// /lado, per side, cada lado.

import type { Measure } from './types';
import { z } from 'zod';

export const LATERALITY_VALUES = ['per_side'] as const;
export type Laterality = (typeof LATERALITY_VALUES)[number];

export const lateralitySchema = z.enum(LATERALITY_VALUES);

/** Two sides. The only count "por lado" names. */
export const SIDES_WHEN_PER_SIDE = 2;

export function lateralitySides(laterality: Laterality | undefined): number {
  return laterality === 'per_side' ? SIDES_WHEN_PER_SIDE : 1;
}

/** Worked amount: the written number times the sides it applies to. */
export function countWorked(n: number, laterality: Laterality | undefined): number {
  return n * lateralitySides(laterality);
}

/** Worked floor of a measure, or undefined when the measure states no number. */
export function measureWorked(m: Measure, laterality: Laterality | undefined): number | undefined {
  const sides = lateralitySides(laterality);
  if (m.kind === 'reps' || m.kind === 'calories') return m.value * sides;
  if (m.kind === 'distance') return m.meters * sides;
  if (m.kind === 'duration') return m.seconds * sides;
  return undefined;
}

const LATERALITY_CUE_RE =
  /(?:\d+\s*)?(?:\/\s*lado\b|por\s+lado\b|per\s+side\b|cada\s+lado\b)/i;

/** True when the text is a laterality cue, not a different unilateral movement. */
export function textHasLateralityCue(text: string): boolean {
  return LATERALITY_CUE_RE.test(text);
}

/** Note that is ONLY the laterality qualifier (so to-text does not repeat it). */
export function noteIsLateralityCue(note: string): boolean {
  return /^(?:\d+\s*)?(?:\/\s*)?(?:por\s+lado|lado|per\s+side|cada\s+lado)$/i.test(note.trim());
}

export function lateralityFromNotes(note: string | undefined, setNotes: Array<string | undefined>): Laterality | undefined {
  if (note && textHasLateralityCue(note)) return 'per_side';
  if (setNotes.length > 0 && setNotes.every((n) => n != null && textHasLateralityCue(n))) {
    return 'per_side';
  }
  return undefined;
}
