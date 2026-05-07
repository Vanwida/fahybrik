// Local mirror of weekly review validation schemas. Mirrors
// `@fahybrik/shared/schema/coach-weekly-review.ts` — kept in sync manually
// because the Next.js bundler currently cannot resolve the workspace package's
// `.js` extension imports. When the shared package is built/published, switch
// to importing from `@fahybrik/shared/schema`.

import { z } from 'zod';
import { ATR_BLOCK_TYPES } from './types';

export const coachWeeklyReviewStatusSchema = z.enum(['draft', 'approved', 'deferred']);
export type CoachWeeklyReviewStatus = z.infer<typeof coachWeeklyReviewStatusSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const isoDateTime = z.string().datetime({ offset: true });
const blockSchema = z.enum(ATR_BLOCK_TYPES);

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

export const weeklyAttentionItemSchema = z.object({
  athlete_id: z.string(),
  full_name: z.string(),
  block_type: blockSchema.nullable(),
  block_week: z.number().int().nullable(),
  severity: z.enum(['critical', 'warning']),
  signals: z.array(z.string()).min(1).max(8),
  recommendation: z.string().min(1),
});
export type WeeklyAttentionItem = z.infer<typeof weeklyAttentionItemSchema>;

export const weeklyTransitionItemSchema = z.object({
  athlete_id: z.string(),
  full_name: z.string(),
  current_block: blockSchema,
  current_week: z.number().int(),
  next_block: blockSchema.nullable(),
  signals: z.array(z.string()).min(1).max(6),
  recommendation: z.enum(['advance', 'hold', 'regress']),
  confidence: z.enum(['high', 'medium', 'low']),
});
export type WeeklyTransitionItem = z.infer<typeof weeklyTransitionItemSchema>;

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

export const weeklyReviewDecisionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('transition_advanced'),
    athlete_id: z.string(),
    from_block: blockSchema,
    to_block: blockSchema,
    decided_at: isoDateTime,
  }),
  z.object({
    kind: z.literal('transition_held'),
    athlete_id: z.string(),
    block: blockSchema,
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

export const weeklyReviewNoteSchema = z.object({
  id: z.string(),
  body: z.string().min(1).max(1000),
  created_at: isoDateTime,
});
export type WeeklyReviewNote = z.infer<typeof weeklyReviewNoteSchema>;

export const weeklyReviewPlanEditSchema = z.object({
  iso_date: isoDate,
  slot: z.enum(['am', 'pm']),
  new_focus: z.string().min(1).max(120),
  edited_at: isoDateTime,
});
export type WeeklyReviewPlanEdit = z.infer<typeof weeklyReviewPlanEditSchema>;

export const coachWeeklyReviewSchema = z.object({
  id: z.string().nullable(),
  coach_id: z.bigint(),
  iso_week_start: isoDate,
  status: coachWeeklyReviewStatusSchema,
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
  status: coachWeeklyReviewStatusSchema,
  approved_at: isoDateTime.nullable(),
  duration_ms: z.number().int().nonnegative().nullable(),
  decisions_count: z.number().int().nonnegative(),
  notes_count: z.number().int().nonnegative(),
  active_athlete_count: z.number().int().nonnegative(),
  compliance_pct: z.number().nullable(),
});
export type WeeklyReviewHistoryItem = z.infer<typeof weeklyReviewHistoryItemSchema>;
