import { z } from 'zod';
import { emailSchema, idSchema, isoDateTime, userRole } from './_primitives.js';

export const userSchema = z.object({
  id: idSchema,
  email: emailSchema,
  apple_user_id: z.string().nullable(),
  role: userRole,
  created_at: isoDateTime,
  updated_at: isoDateTime,
  last_seen_at: isoDateTime.nullable(),
  deleted_at: isoDateTime.nullable(),
});
export type User = z.infer<typeof userSchema>;

export const userInsertSchema = userSchema
  .pick({ email: true, apple_user_id: true, role: true })
  .extend({
    apple_user_id: z.string().nullish(),
  });
export type UserInsert = z.infer<typeof userInsertSchema>;
