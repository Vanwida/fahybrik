import { z } from 'zod';
import { idSchema, isoDate } from './_primitives';

export const WEEK_ADJUSTMENT_STATUSES = ['pending', 'approved', 'rejected', 'superseded'] as const;
export const weekAdjustmentStatusSchema = z.enum(WEEK_ADJUSTMENT_STATUSES);

export const weekAdjustmentVerdictSchema = z.enum(['ok', 'needs_adjustment']);

export const weekAdjustmentSlotChangeSchema = z.object({
  date: isoDate,
  slot: z.enum(['am', 'pm']),
  from_template_id: idSchema.nullable(),
  to_template_id: idSchema.nullable(),
  param_patches: z.record(z.unknown()).optional(),
});

export const weekAdjustmentProposalJsonSchema = z.object({
  recommendation: z.enum(['keep', 'soften', 'swap', 'rest_day']),
  rationale: z.string().max(2000),
  slot_changes: z.array(weekAdjustmentSlotChangeSchema).max(14),
  coach_summary: z.string().max(500),
});

export type WeekAdjustmentProposalJson = z.infer<typeof weekAdjustmentProposalJsonSchema>;

export const weekAdjustmentProposeInputSchema = z.object({
  week_start: isoDate.optional(),
  force: z.boolean().optional(),
});

export const weekAdjustmentReviewInputSchema = z.object({
  note: z.string().max(2000).optional(),
});
