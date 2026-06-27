// Strength lift catalog — the six barbell lifts we track a 1RM for, plus the
// exercise-catalog → 1RM-benchmark mapping. Single source of truth for both. The
// lift slugs are the canonical benchmark slugs (shared/domain/coach/benchmark-slugs),
// so this never re-types the strings.

import {
  BENCH_BACK_SQUAT_1RM,
  BENCH_DEADLIFT_1RM,
  BENCH_BENCH_PRESS_1RM,
  BENCH_OHP_1RM,
  BENCH_CLEAN_1RM,
  BENCH_SNATCH_1RM,
} from '../coach/benchmark-slugs';

export interface StrengthLift {
  slug: string;
  label: string;
  abbrev: string;
}

// The tracked lifts, in display order (most-programmed first). Spanish labels +
// the short abbreviations used in 1RM chips ("SQ 1RM 110 · DL 1RM 180").
export const STRENGTH_LIFTS: readonly StrengthLift[] = [
  { slug: BENCH_BACK_SQUAT_1RM, label: 'Sentadilla', abbrev: 'SQ' },
  { slug: BENCH_DEADLIFT_1RM, label: 'Peso muerto', abbrev: 'DL' },
  { slug: BENCH_BENCH_PRESS_1RM, label: 'Press banca', abbrev: 'BP' },
  { slug: BENCH_OHP_1RM, label: 'Press militar', abbrev: 'OHP' },
  { slug: BENCH_CLEAN_1RM, label: 'Cargada', abbrev: 'CL' },
  { slug: BENCH_SNATCH_1RM, label: 'Arrancada', abbrev: 'SN' },
];

export const STRENGTH_LIFT_BY_SLUG: ReadonlyMap<string, StrengthLift> = new Map(
  STRENGTH_LIFTS.map((lift) => [lift.slug, lift]),
);

/** Human label for a lift slug, falling back to the slug itself if unknown. */
export function strengthLiftLabel(slug: string): string {
  return STRENGTH_LIFT_BY_SLUG.get(slug)?.label ?? slug;
}

/** True if `slug` is one of the tracked strength 1RM lifts. */
export function isStrengthMaxSlug(slug: string): boolean {
  return STRENGTH_LIFT_BY_SLUG.has(slug);
}

// ── Exercise slug → 1RM benchmark slug (single source of truth) ──────────────
// Maps an exercise-catalog slug (e.g. `back-squat`) to the canonical benchmark
// slug whose value is the athlete's 1RM for that lift. Only lifts the onboarding
// flow captures are mapped — anything else resolves to the honest "<pct>% · —"
// path. Close variants that train the SAME 1RM (overhead-press == strict press
// == OHP; power-clean / clean-and-jerk == clean) are mapped to that lift's
// benchmark; variants that are genuinely a DIFFERENT lift (front-squat, RDL,
// push-press) are intentionally NOT mapped — we don't borrow another lift's 1RM.
export const EXERCISE_TO_1RM_BENCHMARK: Readonly<Record<string, string>> = {
  'back-squat': BENCH_BACK_SQUAT_1RM,
  deadlift: BENCH_DEADLIFT_1RM,
  'bench-press': BENCH_BENCH_PRESS_1RM,
  'overhead-press': BENCH_OHP_1RM,
  'power-clean': BENCH_CLEAN_1RM,
  'hang-power-clean': BENCH_CLEAN_1RM,
  'clean-and-jerk': BENCH_CLEAN_1RM,
  snatch: BENCH_SNATCH_1RM,
};
