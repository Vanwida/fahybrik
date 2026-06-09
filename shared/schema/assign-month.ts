import { z } from 'zod';
import { idSchema, isoDate } from './_primitives';
import { programLevelSchema } from './program-templates';

export const assignMonthInputSchema = z.object({
  month_template_id: idSchema,
  start_date: isoDate,
  level: programLevelSchema.optional(),
});

export type AssignMonthInput = z.infer<typeof assignMonthInputSchema>;
