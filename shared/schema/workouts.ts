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
import { STORE_RESULT_MEASURES, STORE_RESULT_UNITS, STORE_RESULT_DERIVES } from './test-battery';

// Dobles HYROX station assignment (reparto).
//
// SOURCE: DERIVED at read from the coach's `dobles_simulations` (single source
// of truth) by the athlete assignment-detail endpoint — see
// web/lib/athlete/dobles-station-split.ts. It is NOT stored on
// `workout_assignments.station_assignment`; that column is LEGACY / never
// written (migration 0091 documents it on the column). Do not add a writer.
//
// 'a' / 'b' identify the two partners deterministically (the application layer
// maps a/b to user IDs via `my_role`); 'split' means the station is shared
// (`self_share` = the reading athlete's fraction); the legacy 'alternate' value
// stays accepted so older payloads keep validating.
//
// This schema is TOLERANT by design: the legacy fields (`name`, `assigned_to`)
// still validate, and the derived per-station fields (`label`, `station_index`,
// `template_segment_id`, `self_share`, `note`) are optional additions so no
// existing payload breaks.
export const stationAssignmentEntrySchema = z.object({
  // Legacy display field (== `label`); kept for back-compat with clients that
  // require it. Optional so a lean derived payload can omit it.
  name: z.string().min(1).max(80).optional(),
  // Canonical HYROX station label, e.g. "SkiErg 1km".
  label: z.string().min(1).max(80).optional(),
  assigned_to: z.enum(['a', 'b', 'alternate', 'split']),
  // Canonical HYROX station index (2,4,…,16), from dobles_simulations.
  station_index: z.number().int().optional(),
  // The template_segments.id of the session line that IS this station, so the
  // client attributes the reparto to the exact segment it executes.
  template_segment_id: z.number().int().optional(),
  // The READING athlete's share of this station, 0..1 (partner = 1 − this).
  self_share: z.number().min(0).max(1).optional(),
  // Coach's per-station reparto note ("alterna 250m"), or null.
  note: z.string().nullable().optional(),
});
export type StationAssignmentEntry = z.infer<typeof stationAssignmentEntrySchema>;

export const stationAssignmentSchema = z.object({
  // 'a' | 'b' — which side of the pair the READING user is (== dobles_simulations
  // athlete_a/b). Optional so legacy payloads (no role) still validate.
  my_role: z.enum(['a', 'b']).optional(),
  // #23 — partner's first name for the live relay line. Optional/nullable so
  // legacy payloads still validate.
  partner_first_name: z.string().nullable().optional(),
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
  // LEGACY / NEVER WRITTEN. The Dobles reparto is DERIVED at read from
  // dobles_simulations (see stationAssignmentSchema above + migration 0091 which
  // documents this on the column). This column has no writer and stays NULL;
  // it's kept only so the row schema still parses the DB shape. Do not add a
  // writer — derive the reparto instead.
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
  // Metcon/HYROX final score (migration 0069). score_time_s for For Time / RFT /
  // HYROX-sim; score_rounds (+ score_reps) for AMRAP. Null for non-scored formats.
  score_time_s: z.number().int().nonnegative().nullable(),
  score_rounds: z.number().int().nonnegative().nullable(),
  score_reps: z.number().int().nonnegative().nullable(),
  source: biometricSource.nullable(),
  source_workout_ref: z.string().max(200).nullable(),
  // Joint HYROX Dobles link (migration 0074): the partner this execution was
  // logged with, else null (the solo-logging default). bigint FK → idSchema.
  partner_athlete_id: idSchema.nullable(),
  // Per-GROUP data provenance after a multi-source FUSION (migration 0108, #36).
  // When a device skeleton and a screenshot→IA capture are fused into ONE
  // execution these say WHICH source owns each group of fields — the honesty the
  // coach and the deferred reconciler need. `source` stays the legacy whole-row
  // provenance (== totals_source for single-source rows). RPE is always the
  // athlete and segments carry their own per-row `source`, so neither needs a
  // header column (Fork B: no dead weight). Tolerant/optional so pre-0108 row
  // shapes and partial constructors keep parsing.
  totals_source: biometricSource.nullable().optional(),
  score_source: biometricSource.nullable().optional(),
  // Every provider that contributed ≥1 value (the fused-state signal: length ≥ 2
  // ⇒ a genuine fusion). Defaults to [] so older selects still parse.
  contributing_sources: z.array(biometricSource).optional().default([]),
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

// Honest-logging vocabulary — the SINGLE SOURCE of the three states a logged
// unit of work can be in, shared coach↔athlete↔DB↔wire (web ingest re-exports
// these). NULL actual ⇔ 'skipped'; a real 0 is legal only for open/AMRAP score-
// reps. Mirrors the CHECK constraints on segment_executions / set_executions.
export const REPS_STATUSES = ['done', 'scaled', 'skipped'] as const;
export type RepsStatus = (typeof REPS_STATUSES)[number];

// Rx/Scaled toggle for metcon-family blocks (whole-block scaling).
export const RX_SCALED_VALUES = ['rx', 'scaled'] as const;
export type RxScaled = (typeof RX_SCALED_VALUES)[number];

// One working set of a strength segment (table `set_executions`). The parent
// segment keeps the back-compat aggregate (reps_completed = Σ reps_actual,
// weight_used_kg = representative load); this carries the per-set honest detail.
export const setExecutionSchema = z.object({
  id: idSchema,
  segment_execution_id: idSchema,
  set_index: z.number().int().min(1),
  reps_prescribed: z.number().int().nonnegative().nullable(),
  // NULL only when the set was skipped — never a fabricated 0.
  reps_actual: z.number().int().nonnegative().nullable(),
  load_prescribed_kg: z.number().nonnegative().nullable(),
  load_actual_kg: z.number().nonnegative().nullable(),
  rpe: z.number().min(0).max(10).nullable(),
  rir: z.number().min(0).max(10).nullable(),
  status: z.enum(REPS_STATUSES),
  confirmed: z.boolean(),
  tempo: z.string().nullable(),
  rest_s: z.number().int().nonnegative().nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type SetExecution = z.infer<typeof setExecutionSchema>;

export const segmentExecutionSchema = z.object({
  id: idSchema,
  execution_id: idSchema,
  template_segment_id: idSchema.nullable(),
  position: z.number().int().nonnegative(),
  started_at: isoDateTime.nullable(),
  ended_at: isoDateTime.nullable(),
  // ACTUAL completed reps (NULL when skipped) — the legacy alias for reps_actual.
  reps_completed: z.number().int().nonnegative().nullable(),
  weight_used_kg: z.number().nonnegative().nullable(),
  distance_meters: z.number().nonnegative().nullable(),
  calories: z.number().nonnegative().nullable(),
  avg_hr: z.number().int().min(30).max(260).nullable(),
  max_hr: z.number().int().min(30).max(260).nullable(),
  // Per-segment modality + modality-native intensity (migration 0045). The DB
  // columns are all nullable (plain text / numeric, no CHECK). `modality` is free
  // text on the column (writes are normalized to run|row|ski|bike|strength|other);
  // `source` is this segment's ingestion provenance, distinct from the execution's
  // biometric_source enum. Matched here so the wire contract stops dropping them.
  modality: z.string().nullable(),
  avg_pace_s_per_km: z.number().nonnegative().nullable(),
  avg_pace_s_per_500m: z.number().nonnegative().nullable(),
  avg_power_w: z.number().nonnegative().nullable(),
  stroke_rate_spm: z.number().nonnegative().nullable(),
  source: z.string().nullable(),
  // Honest-logging fields (migration 0088). reps_confirmed / is_structural are
  // NOT NULL with a default, so always present; the rest are nullable.
  reps_prescribed: z.number().int().nonnegative().nullable(),
  reps_status: z.enum(REPS_STATUSES).nullable(),
  reps_confirmed: z.boolean(),
  is_structural: z.boolean(),
  rx_scaled: z.enum(RX_SCALED_VALUES).nullable(),
  scaled_note: z.string().nullable(),
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

// G1 — a zone target (@Zn) resolved to the athlete's ABSOLUTE pace band, read
// from their versioned zone profile for the line's modality (run → /km; ergo →
// /500m). `zone_label` is the coach zone code (Z4, or "Z3–Z4" for a span);
// `range_label` is the ready-to-render pace string with unit ("4:15–4:25/km",
// "> 2:17/500m"); raw seconds let iOS reformat. Present only when the line targets
// a zone AND the athlete has a profile for that modality.
export const resolvedIntensitySchema = z.object({
  zone_label: z.string().min(1),
  range_label: z.string().min(1),
  fast_s: z.number().nonnegative(),
  slow_s: z.number().nonnegative().nullable(),
  pace_unit: z.enum(['per_km', 'per_500m']),
  // True when these zones come from an UNCONFIRMED auto profile (derived from the
  // athlete's onboarding benchmarks, pending the coach's review). Defaulted false
  // for backward-compat with payloads built before the field existed.
  needs_review: z.boolean().default(false),
});
export type ResolvedIntensity = z.infer<typeof resolvedIntensitySchema>;

// The strength analog of resolvedIntensity: a %RM target resolved to the athlete's
// ABSOLUTE kg from their current 1RM (athlete_strength_maxes, read never
// recomputed). `pct_label` is the source percentage ("80%", "65–80%"); `kg_label`
// is the ready-to-render load ("64 kg", "52–64 kg"); raw `min_kg`/`max_kg`
// (max null for a single value) + `one_rm_kg` let iOS reformat. Present only when
// the line targets a %RM on a tracked lift AND the athlete has a 1RM for it.
export const resolvedLoadSchema = z.object({
  pct_label: z.string().min(1),
  kg_label: z.string().min(1),
  min_kg: z.number().nonnegative(),
  max_kg: z.number().nonnegative().nullable(),
  one_rm_kg: z.number().positive(),
  // True when the 1RM is from an UNCONFIRMED source (a strength max pending the
  // coach's review). Defaulted false for payloads built before the field existed.
  needs_review: z.boolean().default(false),
});
export type ResolvedLoad = z.infer<typeof resolvedLoadSchema>;

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
  // G1 — the line's zone target resolved to an absolute pace band, or null.
  resolved_intensity: resolvedIntensitySchema.nullable(),
  // The line's %RM target resolved to the athlete's absolute kg, or null.
  resolved_load: resolvedLoadSchema.nullable(),
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

// #34 — one calibration result to capture for a test session (mirrors
// coach_test_results / storeResultSpecSchema). `measure`/`unit` drive the iOS
// capture input + the value's interpretation on POST back; `derives`/`modality`
// document what it calibrates (routing lives server-side, in the bridge). Kept a
// dedicated schema (not the refined storeResultSpecSchema) so a null modality from
// the DB parses cleanly.
export const assignmentDetailStoreResultSchema = z.object({
  slug: z.string(),
  label: z.string(),
  measure: z.enum(STORE_RESULT_MEASURES),
  unit: z.enum(STORE_RESULT_UNITS),
  derives: z.enum(STORE_RESULT_DERIVES),
  modality: z.string().nullable().optional(),
});
export type AssignmentDetailStoreResult = z.infer<typeof assignmentDetailStoreResultSchema>;

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
    // Dobles HYROX reparto, DERIVED at read from dobles_simulations for a HYROX-
    // simulation session (see stationAssignmentSchema). Null for individual /
    // non-simulation sessions or when no simulation is authored.
    station_assignment: stationAssignmentSchema.nullable(),
    // Which side of the pair the reading user is ('a' | 'b'), or null when there
    // is no reparto. Mirrors station_assignment.my_role for direct access.
    my_role: z.enum(['a', 'b']).nullable(),
    // #34 — the result(s) a CALIBRATION-test session must capture, derived from
    // coach_test_results via workout_assignments.calibration_test_id. Each entry
    // says what number to ask for + its unit (measure time→seconds, load→kg,
    // distance→meters, …). Empty [] for a normal (non-test) session. Defaulted so
    // older payloads (before #34) still parse.
    store_results: z.array(assignmentDetailStoreResultSchema).default([]),
  }),
  workout: assignmentDetailWorkoutSchema.nullable(),
});
export type AssignmentDetailResponse = z.infer<typeof assignmentDetailResponseSchema>;
