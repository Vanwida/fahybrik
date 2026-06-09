import { z } from 'zod';
import { atrBlockType, isoDate, isoDateTime } from './_primitives';

// Status of a weekly review record.
//   draft     — open, Pablo hasn't approved yet
//   approved  — committed, decisions executed, locked for history
//   deferred  — Pablo punted; reminded next day
export const coachWeeklyReviewStatus = z.enum(['draft', 'approved', 'deferred']);
export type CoachWeeklyReviewStatus = z.infer<typeof coachWeeklyReviewStatus>;

// -----------------------------------------------------------------------------
// Snapshot — cohort-wide metrics frozen at review-open time
// -----------------------------------------------------------------------------

export const cohortPolarizationSchema = z.object({
  low: z.number().min(0).max(100),
  mid: z.number().min(0).max(100),
  high: z.number().min(0).max(100),
});
export type CohortPolarization = z.infer<typeof cohortPolarizationSchema>;

export const weeklyReviewSnapshotSchema = z.object({
  iso_week_start: isoDate,
  iso_week_end: isoDate,
  week_number: z.number().int().min(1).max(53),
  // cohort-wide aggregates
  active_athlete_count: z.number().int().nonnegative(),
  compliance_pct: z.number().min(0).max(100).nullable(),
  compliance_pct_delta_vs_lw: z.number().nullable(),
  total_volume_hours: z.number().nonnegative().nullable(),
  total_volume_pct_delta_vs_lw: z.number().nullable(),
  polarization: cohortPolarizationSchema.nullable(),
  polarization_drift: z.number().nonnegative().nullable(),
  prs_count: z.number().int().nonnegative(),
  prs_athletes: z.number().int().nonnegative(),
  injuries_count: z.number().int().nonnegative(),
  injuries_summary: z.string().max(280).nullable(),
  hrv_trend: z.enum(['up', 'down', 'flat']).nullable(),
  sleep_avg_h: z.number().nonnegative().nullable(),
  sleep_avg_delta_min: z.number().nullable(),
});
export type WeeklyReviewSnapshot = z.infer<typeof weeklyReviewSnapshotSchema>;

// -----------------------------------------------------------------------------
// Attention list — atletas que requieren atención (deeper than daily)
// -----------------------------------------------------------------------------

export const weeklyAttentionItemSchema = z.object({
  athlete_id: z.string(),
  full_name: z.string(),
  block_type: atrBlockType.nullable(),
  block_week: z.number().int().nullable(),
  severity: z.enum(['critical', 'warning']),
  // bullet-point analysis lines, ordered by severity
  signals: z.array(z.string()).min(1).max(8),
  recommendation: z.string().min(1),
});
export type WeeklyAttentionItem = z.infer<typeof weeklyAttentionItemSchema>;

// -----------------------------------------------------------------------------
// Transitions — atletas listos para transición de bloque
// -----------------------------------------------------------------------------

export const weeklyTransitionItemSchema = z.object({
  athlete_id: z.string(),
  full_name: z.string(),
  current_block: atrBlockType,
  current_week: z.number().int(),
  next_block: atrBlockType.nullable(),
  signals: z.array(z.string()).min(1).max(6),
  recommendation: z.enum(['advance', 'hold', 'regress']),
  confidence: z.enum(['high', 'medium', 'low']),
});
export type WeeklyTransitionItem = z.infer<typeof weeklyTransitionItemSchema>;

// -----------------------------------------------------------------------------
// Mass adjustment opportunities — patterns Pablo could apply across cohort
// -----------------------------------------------------------------------------

export const massAdjustmentKindSchema = z.enum([
  'load_increase',
  'load_decrease',
  'z3_to_z2_refactor',
  'recovery_microcycle',
  'volume_taper',
]);
export type MassAdjustmentKind = z.infer<typeof massAdjustmentKindSchema>;

export const massAdjustmentOpportunitySchema = z.object({
  id: z.string(),
  kind: massAdjustmentKindSchema,
  affected_count: z.number().int().positive(),
  affected_athlete_ids: z.array(z.string()).min(1),
  rationale: z.string().min(1),
  suggestion: z.string().min(1),
  cta_label: z.string().min(1),
});
export type MassAdjustmentOpportunity = z.infer<typeof massAdjustmentOpportunitySchema>;

// -----------------------------------------------------------------------------
// Plan próximas 2 semanas — visual calendar
// -----------------------------------------------------------------------------

export const cohortPlanDaySchema = z.object({
  iso_date: isoDate,
  weekday_label: z.string(),
  am_focus: z.string().nullable(),
  pm_focus: z.string().nullable(),
  highlights: z.string().nullable(),
  is_today: z.boolean(),
});
export type CohortPlanDay = z.infer<typeof cohortPlanDaySchema>;

export const cohortPlanWeekSchema = z.object({
  iso_week_start: isoDate,
  week_label: z.string(),
  days: z.array(cohortPlanDaySchema).length(7),
});
export type CohortPlanWeek = z.infer<typeof cohortPlanWeekSchema>;

// -----------------------------------------------------------------------------
// Decisions — what Pablo committed in this review (append-only)
// -----------------------------------------------------------------------------

export const weeklyReviewDecisionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('transition_advanced'),
    athlete_id: z.string(),
    from_block: atrBlockType,
    to_block: atrBlockType,
    decided_at: isoDateTime,
  }),
  z.object({
    kind: z.literal('transition_held'),
    athlete_id: z.string(),
    block: atrBlockType,
    extended_weeks: z.number().int().min(1).max(4),
    decided_at: isoDateTime,
  }),
  z.object({
    kind: z.literal('attention_action'),
    athlete_id: z.string(),
    action: z.enum(['deload', 'modified_plan', 'message_sent', 'test_scheduled']),
    decided_at: isoDateTime,
  }),
  z.object({
    kind: z.literal('mass_adjustment_applied'),
    opportunity_id: z.string(),
    affected_count: z.number().int().positive(),
    decided_at: isoDateTime,
  }),
]);
export type WeeklyReviewDecision = z.infer<typeof weeklyReviewDecisionSchema>;

// -----------------------------------------------------------------------------
// Notes — Pablo's journal (append-only)
// -----------------------------------------------------------------------------

export const weeklyReviewNoteSchema = z.object({
  id: z.string(),
  body: z.string().min(1).max(1000),
  created_at: isoDateTime,
});
export type WeeklyReviewNote = z.infer<typeof weeklyReviewNoteSchema>;

// -----------------------------------------------------------------------------
// Plan edits — Pablo's tweaks to the cohort calendar (section 5)
// -----------------------------------------------------------------------------

export const weeklyReviewPlanEditSchema = z.object({
  iso_date: isoDate,
  slot: z.enum(['am', 'pm']),
  new_focus: z.string().min(1).max(120),
  edited_at: isoDateTime,
});
export type WeeklyReviewPlanEdit = z.infer<typeof weeklyReviewPlanEditSchema>;

// -----------------------------------------------------------------------------
// Aggregate record (returned by GET /current and /:id)
// -----------------------------------------------------------------------------

// `id` arrives serialized as text (bigint::text) from the DB before reaching
// the client; type as nullable string to avoid bigint leakage into JSON.
// `coach_id` stays a bigint on the server boundary (rowToReview wraps with
// BigInt()); API edge serializes to string before responding.
export const coachWeeklyReviewSchema = z.object({
  id: z.string().nullable(),
  coach_id: z.bigint(),
  iso_week_start: isoDate,
  status: coachWeeklyReviewStatus,
  snapshot: weeklyReviewSnapshotSchema,
  decisions: z.array(weeklyReviewDecisionSchema),
  notes: z.array(weeklyReviewNoteSchema),
  plan_edits: z.array(weeklyReviewPlanEditSchema),
  duration_ms: z.number().int().nonnegative().nullable(),
  opened_at: isoDateTime,
  approved_at: isoDateTime.nullable(),
  deferred_until: isoDate.nullable(),
});
export type CoachWeeklyReview = z.infer<typeof coachWeeklyReviewSchema>;

// -----------------------------------------------------------------------------
// API request schemas
// -----------------------------------------------------------------------------

export const saveWeeklyReviewRequestSchema = z.object({
  action: z.enum(['save_draft', 'approve', 'defer']),
  iso_week_start: isoDate,
  decisions: z.array(weeklyReviewDecisionSchema).optional(),
  notes: z.array(weeklyReviewNoteSchema).optional(),
  plan_edits: z.array(weeklyReviewPlanEditSchema).optional(),
  duration_ms: z.number().int().nonnegative().optional(),
});
export type SaveWeeklyReviewRequest = z.infer<typeof saveWeeklyReviewRequestSchema>;

export const weeklyReviewHistoryItemSchema = z.object({
  id: z.string(),
  iso_week_start: isoDate,
  status: coachWeeklyReviewStatus,
  approved_at: isoDateTime.nullable(),
  duration_ms: z.number().int().nonnegative().nullable(),
  decisions_count: z.number().int().nonnegative(),
  notes_count: z.number().int().nonnegative(),
  active_athlete_count: z.number().int().nonnegative(),
  compliance_pct: z.number().nullable(),
});
export type WeeklyReviewHistoryItem = z.infer<typeof weeklyReviewHistoryItemSchema>;
