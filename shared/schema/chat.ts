import { z } from 'zod';
import { idSchema, isoDateTime } from './_primitives.js';

export const chatThreadSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  athlete_id: idSchema,
  last_message_at: isoDateTime.nullable(),
  unread_for_coach: z.number().int().nonnegative(),
  unread_for_athlete: z.number().int().nonnegative(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type ChatThread = z.infer<typeof chatThreadSchema>;

export const chatMessageSchema = z.object({
  id: idSchema,
  thread_id: idSchema,
  sender_user_id: idSchema,
  body: z.string().min(1).max(8000),
  created_at: isoDateTime,
  read_at: isoDateTime.nullable(),
  edited_at: isoDateTime.nullable(),
  deleted_at: isoDateTime.nullable(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatMessageInsertSchema = chatMessageSchema.pick({
  thread_id: true,
  sender_user_id: true,
  body: true,
});
export type ChatMessageInsert = z.infer<typeof chatMessageInsertSchema>;
