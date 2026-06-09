// Mass Adjustments — Pablo applies one change across many athletes.
// Mirrors infra/migrations/0006_coach_mass_adjustments.sql. Used by:
//   * web/lib/coach/mass-adjustments.ts (server)
//   * web/components/coach/MassAdjustment*.tsx (client)
//
// Spec: /docs/ux/10-coach-mass-adjustments.md (signed off 2026-05-07).

import { z } from 'zod';
import { atrBlockType, idSchema, isoDateTime } from './_primitives';

export const massAdjustmentType = z.enum([
  'strength_load_pct',
  'running_volume_pct',
  'refactor_exercise',
  'insert_session',
  'delete_session',
  'reschedule_shift',
  'private_note',
]);
export type MassAdjustmentType = z.infer<typeof massAdjustmentType>;

export const massAdjustmentStatus = z.enum(['applied', 'rolled_back']);
export type MassAdjustmentStatus = z.infer<typeof massAdjustmentStatus>;

// Scope = how Pablo picked the athletes. Stored as snapshot for history.
export const scopeSelection = z.object({
  kind: z.literal('selection'),
  athlete_ids: z.array(idSchema).min(1).max(200),
});
export const scopeFilter = z.object({
  kind: z.literal('filter'),
  block: atrBlockType.optional(),
  week: z.number().int().min(1).max(20).optional(),
  level: z.enum(['todos', 'elite', 'amateur']).optional(),
});
export const scopeAEvent = z.object({
  kind: z.literal('a_event'),
  event_id: idSchema,
});
export const scopeManual = z.object({
  kind: z.literal('manual'),
  athlete_ids: z.array(idSchema).min(1).max(200),
});
export const massAdjustmentScope = z.discriminatedUnion('kind', [
  scopeSelection,
  scopeFilter,
  scopeAEvent,
  scopeManual,
]);
export type MassAdjustmentScope = z.infer<typeof massAdjustmentScope>;

// Type-specific payloads.
export const payloadStrengthLoad = z.object({
  type: z.literal('strength_load_pct'),
  delta_pct: z.number().min(-50).max(50),
  weeks_ahead: z.number().int().min(1).max(8).default(1),
});
export const payloadRunningVolume = z.object({
  type: z.literal('running_volume_pct'),
  delta_pct: z.number().min(-50).max(50),
  weeks_ahead: z.number().int().min(1).max(8).default(1),
});
export const payloadRefactorExercise = z.object({
  type: z.literal('refactor_exercise'),
  from_exercise_id: idSchema,
  to_exercise_id: idSchema,
  weeks_ahead: z.number().int().min(1).max(8).default(1),
});
export const payloadInsertSession = z.object({
  type: z.literal('insert_session'),
  template_id: idSchema,
  day_offset: z.number().int().min(0).max(28),
});
export const payloadDeleteSession = z.object({
  type: z.literal('delete_session'),
  // 0..6 (Mon..Sun) — match scheduled_for weekday on the next 7d window.
  day_offset: z.number().int().min(0).max(28),
});
export const payloadRescheduleShift = z.object({
  type: z.literal('reschedule_shift'),
  shift_days: z.number().int().min(-14).max(14),
  weeks_ahead: z.number().int().min(1).max(8).default(1),
});
export const payloadPrivateNote = z.object({
  type: z.literal('private_note'),
  body: z.string().min(1).max(1_000),
});
export const massAdjustmentPayload = z.discriminatedUnion('type', [
  payloadStrengthLoad,
  payloadRunningVolume,
  payloadRefactorExercise,
  payloadInsertSession,
  payloadDeleteSession,
  payloadRescheduleShift,
  payloadPrivateNote,
]);
export type MassAdjustmentPayload = z.infer<typeof massAdjustmentPayload>;

// Hard alerts surfaced in preview that Pablo can choose to exclude.
export const exclusionReason = z.enum([
  'hrv_crash',
  'no_sync',
  'rpe_high',
  'manual_override',
]);
export type ExclusionReason = z.infer<typeof exclusionReason>;

// Preview / commit request body.
export const massAdjustmentRequest = z.object({
  scope: massAdjustmentScope,
  payload: massAdjustmentPayload,
  // Athletes Pablo deselected after seeing the warnings.
  excluded_athlete_ids: z.array(idSchema).default([]),
});
export type MassAdjustmentRequest = z.infer<typeof massAdjustmentRequest>;

// Preview response per-athlete row.
export const previewAthleteRow = z.object({
  athlete_id: z.string(),
  full_name: z.string(),
  block_type: atrBlockType.nullable(),
  block_week: z.number().int().nullable(),
  exercises_modified: z.number().int().nonnegative(),
  warnings: z.array(exclusionReason),
});
export type PreviewAthleteRow = z.infer<typeof previewAthleteRow>;

export const previewProjection = z.object({
  strength_load_pct_delta: z.number(),
  running_volume_pct_delta: z.number(),
});
export type PreviewProjection = z.infer<typeof previewProjection>;

export const massAdjustmentPreviewResponse = z.object({
  athletes: z.array(previewAthleteRow),
  total_assignments_touched: z.number().int().nonnegative(),
  projection: previewProjection,
  suggested_exclusions: z.array(z.string()),
});
export type MassAdjustmentPreviewResponse = z.infer<typeof massAdjustmentPreviewResponse>;

// Commit response.
export const massAdjustmentCommitResponse = z.object({
  adjustment_id: z.string(),
  athletes_affected: z.number().int().nonnegative(),
  rollback_deadline: isoDateTime,
});
export type MassAdjustmentCommitResponse = z.infer<typeof massAdjustmentCommitResponse>;

// History row.
export const massAdjustmentHistoryRow = z.object({
  id: z.string(),
  adjustment_type: massAdjustmentType,
  status: massAdjustmentStatus,
  scope_summary: z.string(),
  athletes_affected_count: z.number().int().nonnegative(),
  applied_at: isoDateTime,
  rollback_deadline: isoDateTime,
  rolled_back_at: isoDateTime.nullable(),
  payload_summary: z.string(),
});
export type MassAdjustmentHistoryRow = z.infer<typeof massAdjustmentHistoryRow>;

export const massAdjustmentHistoryResponse = z.object({
  rows: z.array(massAdjustmentHistoryRow),
});
export type MassAdjustmentHistoryResponse = z.infer<typeof massAdjustmentHistoryResponse>;
