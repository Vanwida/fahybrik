// pick-exercise — the SINGLE place that maps a picked catalog exercise onto an
// authoring line. Picking an exercise (a) puts the real exercise_id on the line
// (the A3 fix — it is now persistable), (b) sets the display name, and (c) aligns
// the line's prescription modality to the exercise's INTRINSIC modality
// (mig 0053: modality is a property of the exercise, never a free per-line
// choice). It does NOT touch the measure/target/scheme the coach configured — the
// dosis stays; only the exercise link + modality tag change.

import type { EditorItem } from '@/lib/dashboard/v2/editor-types';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';

/**
 * The catalog category the create-exercise form should DEFAULT to when the coach
 * is authoring a line of a given modality. Inverse-ish of mig 0053's derivation
 * (modality is derived from category): we pick the category whose derived
 * modality matches, so a fuerza line defaults the create chip to "strength", a
 * run line to "cardio", etc. The coach can still change the chip.
 */
export function defaultCategoryForModality(m: Modality | undefined): ExerciseCategory {
  switch (m) {
    case 'strength':
      return 'strength';
    case 'core':
      return 'core';
    case 'mobility':
      return 'mobility';
    case 'run':
    case 'row':
    case 'ski':
    case 'bike':
      return 'cardio';
    case 'functional':
    case 'other':
    default:
      return 'strength';
  }
}

interface PickedExerciseLite {
  id: number;
  name: string;
  modality: Modality;
}

/** Build the EditorItem patch for selecting `ex` onto `item`. */
export function withPickedExercise(
  item: EditorItem,
  ex: PickedExerciseLite,
): Partial<EditorItem> {
  return {
    exercise_id: ex.id,
    exercise_name: ex.name,
    // Align the line modality to the exercise (intrinsic). Keep every other
    // prescription field (scheme/sets/measure/target/structural) as the coach set.
    prescription: { ...item.prescription, modality: ex.modality },
  };
}
