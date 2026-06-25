import { z } from 'zod';
import { idSchema, isoDate } from './_primitives';

export const assignMonthInputSchema = z.object({
  month_template_id: idSchema,
  start_date: isoDate,
});

export type AssignMonthInput = z.infer<typeof assignMonthInputSchema>;
