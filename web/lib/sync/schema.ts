// Wire-format Zod schemas for the iOS HealthKit sync pipeline.
//
// Mirrors ios/FAHYBRIK/HealthKit/HealthKitDTO.swift (HKWorkoutDTO,
// HKBiometricSampleDTO, HKWorkoutLapDTO, HKSyncBatch). Authoritative shape
// lives in shared/schema/biometrics.ts; this is the local mirror used by the
// API route while #29 (shared package build) ships.
//
// All fields snake_case to match Swift Codable wire format and FAHYBRIK API
// convention.

import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

export const hkWorkoutLapSchema = z.object({
  started_at: isoDateTime,
  ended_at: isoDateTime,
  duration_seconds: z.number().nonnegative(),
  // 'lap' | 'segment' | 'marker' — kept as text to allow future kinds
  // without a Swift-side schema bump.
  event_kind: z.string().min(1).max(40),
});
export type HKWorkoutLapDTO = z.infer<typeof hkWorkoutLapSchema>;

export const hkWorkoutSchema = z.object({
  source_workout_id: z.string().min(1).max(200),
  workout_activity_type: z.number().int(),
  started_at: isoDateTime,
  ended_at: isoDateTime,
  duration_seconds: z.number().nonnegative(),
  total_energy_burned_kcal: z.number().nullish(),
  total_distance_meters: z.number().nullish(),
  avg_heart_rate_bpm: z.number().nullish(),
  max_heart_rate_bpm: z.number().nullish(),
  lap_markers: z.array(hkWorkoutLapSchema).default([]),
  source: z.literal('healthkit'),
});
export type HKWorkoutDTO = z.infer<typeof hkWorkoutSchema>;

// Free-form metric type from iOS — translated to canonical biometric_metric
// enum server-side via mapMetricType().
export const hkBiometricSampleSchema = z.object({
  metric_type: z.string().min(1).max(60),
  recorded_at: isoDateTime,
  value_numeric: z.number().finite(),
  unit: z.string().max(40),
  source: z.literal('healthkit'),
  source_workout_id: z.string().nullish(),
});
export type HKBiometricSampleDTO = z.infer<typeof hkBiometricSampleSchema>;

// IANA timezone id (e.g. 'Europe/Madrid'), validated by whether the runtime's
// Intl database recognises it — the only correct way to check an IANA id (a regex
// can't). Persisted to athletes.timezone so readiness windows the day in the
// athlete's own zone.
const ianaTimezone = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'invalid IANA timezone' },
  );

export const hkSyncBatchSchema = z.object({
  athlete_id: z.string().nullish(),
  sent_at: isoDateTime,
  timezone: ianaTimezone.nullish(),
  workouts: z.array(hkWorkoutSchema).default([]),
  samples: z.array(hkBiometricSampleSchema).default([]),
});
export type HKSyncBatch = z.infer<typeof hkSyncBatchSchema>;

// The actual request body the iOS client posts.
export const healthkitSyncRequestSchema = z.object({
  batch: hkSyncBatchSchema,
});
export type HealthkitSyncRequest = z.infer<typeof healthkitSyncRequestSchema>;

// =============================================================================
// Daily check-in (POST /api/checkins and /api/sync/checkins).
// Mirrors ios/FAHYBRIK/Today/Checkin/CheckinModel.swift CheckinSnapshot.
// =============================================================================

export const checkinSnapshotSchema = z.object({
  recorded_at: isoDateTime,
  soreness: z.number().int().min(1).max(5).nullable(),
  mood: z.number().int().min(1).max(5).nullable(),
  motivation: z.number().int().min(1).max(5).nullable(),
  fatigue: z.number().int().min(1).max(5).nullable(),
  sleep_quality: z.number().int().min(1).max(5).nullable(),
  notes: z.string().max(2000).nullish(),
  sub_score: z.number().int().min(0).max(100),
});
export type CheckinSnapshot = z.infer<typeof checkinSnapshotSchema>;

export const checkinRequestSchema = z.object({
  checkin: checkinSnapshotSchema,
});
export type CheckinRequest = z.infer<typeof checkinRequestSchema>;
