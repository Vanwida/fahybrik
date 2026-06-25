import type { Modality, Prescription } from '@fahybrid/shared/domain/prescription';
import { prescriptionToParams } from '@fahybrid/shared/domain/prescription';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import {
  presetById,
  type WeekDayPartPreset,
} from '@/lib/dashboard/constants/week-day-part-presets';
import {
  defaultMeasureForModality,
  defaultSchemeForModality,
  defaultTargetForModality,
} from '@/lib/programming/prescription-model';
import { newBlockUid } from '@/lib/dashboard/programming/studio-types';
// `defaultParamsForExercise` is no longer used for item seeding — items now carry
// a structured prescription_json and derive params from it. The helper remains
// for any other caller of block-defaults.

// Map the exercise catalog category onto a default prescription modality so a
// freshly-added line opens with sensible measure/target defaults (a cardio row
// → distance + pace /500m, a strength lift → reps + %RM). The coach can switch
// modality in the editor; this is only the starting point. `hyrox_station` and
// `skill` default to `functional` (reps + RPE) — the most common HYROX station
// shape — and the coach refines per station (the run/erg ones flip to run/row).
const CATEGORY_TO_MODALITY: Record<ExerciseCategory, Modality> = {
  cardio: 'run',
  strength: 'strength',
  skill: 'functional',
  hyrox_station: 'functional',
  mobility: 'mobility',
  plyometric: 'functional',
  core: 'core',
};

export function modalityForExercise(exercise: CatalogExercise): Modality {
  return CATEGORY_TO_MODALITY[exercise.category] ?? 'strength';
}

export function createPartFromPreset(preset: WeekDayPartPreset): WeekDayPart {
  const part: WeekDayPart = {
    uid: newBlockUid(),
    format: preset.format,
    title: preset.title,
    config_json: { ...preset.defaultConfig },
    items: [],
  };
  // Clasifica el bloque a medida por su grupo metodológico (1–10) cuando lo
  // tiene; las piezas de Estructura (calentamiento, movilidad…) no llevan grupo.
  if (preset.methodology_group_id != null) {
    part.methodology_group_id = preset.methodology_group_id;
  }
  return part;
}

export function createPartFromPresetId(presetId: string): WeekDayPart | null {
  const preset = presetById(presetId);
  if (!preset) return null;
  return createPartFromPreset(preset);
}

export function createItemFromExercise(exercise: CatalogExercise) {
  // Seed a STRUCTURED prescription_json carrying the line's modality + sensible
  // measure/target so the editor opens coherent for EVERY modality from the
  // first render (a row → distance + pace /500m, a squat → reps + %RM). This is
  // what lets a coach assemble a mixed HYROX block: each item is added with its
  // own modality, then refined. `params_json` is kept as the scalar back-compat
  // summary alongside (row summary / materializer / iOS still read it).
  const modality = modalityForExercise(exercise);
  const prescription = buildSeedPrescription(modality);
  return {
    uid: newBlockUid(),
    exercise_id: Number(exercise.id),
    exercise_name: exercise.name,
    prescription_json: prescription,
    params_json: prescriptionToParams(prescription),
  };
}

// One sensible default line per modality, built from the same model helpers the
// editor uses (single source of truth for "what does a fresh run/row/squat look
// like"). Strength/functional/core/mobility → a single set; cardio/erg → a
// steady block with the right measure + target.
function buildSeedPrescription(modality: Modality): Prescription {
  const scheme = defaultSchemeForModality(modality);
  const measure = defaultMeasureForModality(modality);
  const target = defaultTargetForModality(modality);
  if (scheme === 'sets') {
    const set: Prescription['sets'] = [{ measure, ...(target ? { target } : {}) }];
    return { scheme: 'sets', modality, sets: set };
  }
  // steady / conditioning: stash duration on total_s, distance/cal on a single
  // representative set, and the target at block level.
  const base: Prescription = { scheme, modality, ...(target ? { target } : {}) };
  if (measure.kind === 'duration') base.total_s = measure.seconds;
  else base.sets = [{ measure }];
  return base;
}
