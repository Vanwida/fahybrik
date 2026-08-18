// Persisted-row zod schema for the STRENGTH / 1RM system (migration 0076). This
// validates every row of `athlete_strength_maxes` — the strength analog of
// athleteZoneProfileSchema (a versioned, per-athlete resolved value). The 1RM
// ESTIMATORS + lift catalog (the logic) live in @fahybrid/shared/domain/strength;
// imported by readers, NOT re-declared here.
//
// The lift slugs are built from the canonical BENCH_* constants
// (shared/domain/coach/benchmark-slugs) so this file never re-types the strings.

import { z } from 'zod';
import { idSchema, isoDateTime } from './_primitives';
import {
  BENCH_BACK_SQUAT_1RM,
  BENCH_DEADLIFT_1RM,
  BENCH_BENCH_PRESS_1RM,
  BENCH_OHP_1RM,
  BENCH_CLEAN_1RM,
  BENCH_SNATCH_1RM,
} from '../domain/coach/benchmark-slugs';

// The six barbell lifts we track a 1RM for. Built from the canonical benchmark
// slugs (single source) — same vocabulary athlete_benchmarks already uses.
export const STRENGTH_LIFT_SLUGS = [
  BENCH_BACK_SQUAT_1RM,
  BENCH_DEADLIFT_1RM,
  BENCH_BENCH_PRESS_1RM,
  BENCH_OHP_1RM,
  BENCH_CLEAN_1RM,
  BENCH_SNATCH_1RM,
] as const;
export const strengthLiftSlug = z.enum(STRENGTH_LIFT_SLUGS);
export type StrengthLiftSlug = z.infer<typeof strengthLiftSlug>;

// WHO produced a stored max: onboarding (self-reported at signup) | athlete_test
// (self-entered from the app) | coach_test (coach-recorded, validated). Mirrors
// athlete_zone_profiles.source.
//
// Ojo: esto NO dice si hubo protocolo. Un `coach_test` puede ser el coach
// escribiendo 110 a mano en la ficha. Lo que dice que el número salió de una
// batería programada es `assignment_id` (0200). Origen = las dos juntas; el
// lector que las combina es shared/domain/strength/origen.
export const STRENGTH_MAX_SOURCES = ['onboarding', 'athlete_test', 'coach_test'] as const;
export const strengthMaxSource = z.enum(STRENGTH_MAX_SOURCES);
export type StrengthMaxSource = z.infer<typeof strengthMaxSource>;

// ── athlete_strength_maxes — VERSIONED resolved 1RM per athlete × lift (0076) ──
// one_rm_kg in + provenance/test set. Highest version = current. Mirrors
// athleteZoneProfileSchema.
export const athleteStrengthMaxSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  exercise_slug: z.string().min(1).max(60),
  one_rm_kg: z.number().positive(),
  source: strengthMaxSource.default('coach_test'),
  // The test set this was estimated from. Null for a direct / onboarding entry.
  test_weight_kg: z.number().positive().nullable(),
  test_reps: z.number().int().min(1).max(20).nullable(),
  // The coach formula used to estimate one_rm_kg. Null for a direct entry.
  one_rm_method: z.enum(['Epley', 'Brzycki', 'Lombardi']).nullable(),
  needs_review: z.boolean().default(false),
  version: z.number().int().min(1),
  notes: z.string().nullable(),
  // La ocurrencia de batería que produjo este 1RM (0200). Null = no hubo
  // protocolo: alta, coach a mano, o el atleta apuntándoselo.
  // Texto: el SELECT lo castea (`assignment_id::text`) y la ficha lo enlaza.
  assignment_id: z.string().nullable().default(null),
  recorded_at: isoDateTime,
  created_at: isoDateTime,
});
export type AthleteStrengthMax = z.infer<typeof athleteStrengthMaxSchema>;
