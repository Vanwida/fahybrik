import { z } from 'zod';
import {
  assignmentStatus,
  biometricSource,
  idSchema,
  isoDate,
  isoDateTime,
  partnerVisibility,
} from './_primitives';
import { prescriptionSchema } from '../domain/prescription';

// Dobles HYROX station assignment.
// 'a' / 'b' identify the two partners deterministically inside this
// assignment (the application layer maps a/b to user IDs); 'alternate' means
// either partner can take the station depending on the runtime decision.
export const stationAssignmentEntrySchema = z.object({
  name: z.string().min(1).max(80),
  assigned_to: z.enum(['a', 'b', 'alternate']),
});
export type StationAssignmentEntry = z.infer<typeof stationAssignmentEntrySchema>;

export const stationAssignmentSchema = z.object({
  stations: z.array(stationAssignmentEntrySchema),
});
export type StationAssignment = z.infer<typeof stationAssignmentSchema>;

export const workoutAssignmentSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  microcycle_id: idSchema.nullable(),
  scheduled_for: isoDate,
  template_id: idSchema,
  template_version: z.number().int().min(1),
  status: assignmentStatus,
  notes: z.string().max(4000).nullable(),
  // Dobles HYROX: per-station partner assignment. NULL for non-Dobles
  // assignments (the overwhelming majority).
  station_assignment: stationAssignmentSchema.nullable(),
  // Whether this assignment is shared with the paired partner (default) or
  // private to the assigned athlete. DB default is 'shared' so legacy rows
  // keep behaving as before.
  partner_visibility: partnerVisibility,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type WorkoutAssignment = z.infer<typeof workoutAssignmentSchema>;

export const workoutExecutionSchema = z.object({
  id: idSchema,
  assignment_id: idSchema,
  athlete_id: idSchema,
  started_at: isoDateTime.nullable(),
  ended_at: isoDateTime.nullable(),
  total_duration_seconds: z.number().int().nonnegative().nullable(),
  perceived_exertion: z.number().int().min(1).max(10).nullable(),
  notes: z.string().max(4000).nullable(),
  source: biometricSource.nullable(),
  source_workout_ref: z.string().max(200).nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type WorkoutExecution = z.infer<typeof workoutExecutionSchema>;

// Raw lap-level data preserved for audit. Free-form by design — provider shape varies.
export const rawLapDataSchema = z.object({
  laps: z
    .array(
      z.object({
        index: z.number().int().nonnegative().optional(),
        start_time: isoDateTime.optional(),
        duration_seconds: z.number().nonnegative().optional(),
        distance_meters: z.number().nonnegative().optional(),
        avg_hr: z.number().int().optional(),
        max_hr: z.number().int().optional(),
        calories: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
  source: z.string().optional(),
}).passthrough();
export type RawLapData = z.infer<typeof rawLapDataSchema>;

export const segmentExecutionSchema = z.object({
  id: idSchema,
  execution_id: idSchema,
  template_segment_id: idSchema.nullable(),
  position: z.number().int().nonnegative(),
  started_at: isoDateTime.nullable(),
  ended_at: isoDateTime.nullable(),
  reps_completed: z.number().int().nonnegative().nullable(),
  weight_used_kg: z.number().nonnegative().nullable(),
  distance_meters: z.number().nonnegative().nullable(),
  calories: z.number().nonnegative().nullable(),
  avg_hr: z.number().int().min(30).max(260).nullable(),
  max_hr: z.number().int().min(30).max(260).nullable(),
  raw_lap_data_json: rawLapDataSchema.nullable(),
  reconciled_at: isoDateTime.nullable(),
  reconciled_by_user_id: idSchema.nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type SegmentExecution = z.infer<typeof segmentExecutionSchema>;

// =============================================================================
// Assignment detail (GET /api/athlete/assignments/[id]/detail)
//
// Athlete-facing pre-workout payload. iOS parses this in PreWorkoutBriefView /
// ActiveWorkoutView to render sets/reps/load/RPE/pace/etc. per item. The
// /api/athlete/plan/week endpoint only ships the short card; this one is the
// full hydration.
//
// `workout` is null when the assignment has no template (defensive — DB FK is
// currently NOT NULL, but the contract preserves a rest-day fallback).
// =============================================================================

// Spec-normalized params shape — DB columns use `weight_kg` / `weight_pct_1rm`
// / `time_seconds`; the wire contract exposes `load_kg` / `load_pct` /
// `duration_seconds`. All fields optional; the loader emits only those
// present on the source segment.
export const assignmentDetailParamsSchema = z.object({
  sets: z.number().int().positive().optional(),
  reps: z.number().int().nonnegative().optional(),
  load_kg: z.number().nonnegative().optional(),
  load_pct: z.number().min(0).max(200).optional(),
  rpe: z.number().min(1).max(10).optional(),
  rest_seconds: z.number().int().nonnegative().optional(),
  duration_seconds: z.number().int().nonnegative().optional(),
  distance_km: z.number().nonnegative().optional(),
  distance_meters: z.number().nonnegative().optional(),
  pace_sec_per_km: z.number().nonnegative().optional(),
  cadence_spm: z.number().nonnegative().optional(),
  calories: z.number().nonnegative().optional(),
  calories_per_min: z.number().nonnegative().optional(),
  hr_zone: z.number().int().min(1).max(7).optional(),
});
export type AssignmentDetailParams = z.infer<typeof assignmentDetailParamsSchema>;

export const assignmentDetailItemSchema = z.object({
  uid: z.string().min(1),
  exercise_id: idSchema,
  exercise_name: z.string(),
  exercise_slug: z.string(),
  exercise_category: z.string(),
  exercise_video_url: z.string().nullable(),
  cues: z.string().nullable(),
  // Flat, iOS-ready targets. Derived from `prescription_json` (the unified
  // measure/target model) when present on the segment, else from the stored
  // scalar params. Carries the reps/load/zone/pace/distance/calories the thin
  // params alone used to drop.
  params_json: assignmentDetailParamsSchema,
  // Structured per-set prescription, passed through verbatim when valid so iOS
  // can decode the rich form (per-set pyramids, ranges, pace units) later.
  // Null for legacy segments that only have scalar params.
  prescription_json: prescriptionSchema.nullable(),
  notes: z.string().nullable(),
});
export type AssignmentDetailItem = z.infer<typeof assignmentDetailItemSchema>;

export const assignmentDetailBlockSchema = z.object({
  uid: z.string().min(1),
  title: z.string(),
  format: z.string(),
  block_position: z.number().int().nonnegative(),
  coach_note: z.string().nullable(),
  // Block-level config (rounds, time_cap_seconds, work_seconds, rest_seconds,
  // …). Free-form per-format payload; the studio currently writes {} until
  // per-block config lands.
  config_json: z.record(z.unknown()),
  items: z.array(assignmentDetailItemSchema),
});
export type AssignmentDetailBlock = z.infer<typeof assignmentDetailBlockSchema>;

export const assignmentDetailWorkoutSchema = z.object({
  name: z.string(),
  focus: z.string().nullable(),
  coach_note: z.string().nullable(),
  estimated_duration_minutes: z.number().int().nonnegative().nullable(),
  blocks: z.array(assignmentDetailBlockSchema),
});
export type AssignmentDetailWorkout = z.infer<typeof assignmentDetailWorkoutSchema>;

export const assignmentDetailResponseSchema = z.object({
  assignment: z.object({
    id: idSchema,
    athlete_id: idSchema,
    scheduled_for: isoDate,
    status: assignmentStatus,
    slot: z.string().nullable(),
    template_id: idSchema.nullable(),
    template_version: z.number().int().min(1).nullable(),
    completed_at: isoDateTime.nullable(),
    perceived_exertion: z.number().int().min(1).max(10).nullable(),
  }),
  workout: assignmentDetailWorkoutSchema.nullable(),
});
export type AssignmentDetailResponse = z.infer<typeof assignmentDetailResponseSchema>;
