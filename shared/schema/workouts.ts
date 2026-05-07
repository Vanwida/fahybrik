import { z } from 'zod';
import {
  assignmentStatus,
  biometricSource,
  idSchema,
  isoDate,
  isoDateTime,
} from './_primitives.js';

export const workoutAssignmentSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  microcycle_id: idSchema.nullable(),
  scheduled_for: isoDate,
  template_id: idSchema,
  template_version: z.number().int().min(1),
  status: assignmentStatus,
  notes: z.string().max(4000).nullable(),
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
