import { z } from 'zod';
import { idSchema, isoDateTime } from './_primitives.js';

export const coachSchema = z.object({
  id: idSchema,
  user_id: idSchema,
  full_name: z.string().min(1).max(200),
  bio: z.string().max(4000).nullable(),
  default_methodology_doc_id: idSchema.nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type Coach = z.infer<typeof coachSchema>;

export const coachInsertSchema = coachSchema.pick({
  user_id: true,
  full_name: true,
  bio: true,
}).partial({ bio: true });
export type CoachInsert = z.infer<typeof coachInsertSchema>;
