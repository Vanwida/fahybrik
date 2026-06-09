import { z } from 'zod';
import { idSchema, isoDate } from './_primitives';

export const MONTHLY_BLOCK_PROPOSAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const monthlyBlockProposalStatusSchema = z.enum(MONTHLY_BLOCK_PROPOSAL_STATUSES);

export const monthlyBlockProposalReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  month_template_id: idSchema.optional(),
  start_date: isoDate.optional(),
  note: z.string().max(2000).optional(),
});
