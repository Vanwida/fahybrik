import { z } from 'zod';
import { idSchema, isoDateTime, notificationType } from './_primitives';

export const notificationSchema = z.object({
  id: idSchema,
  user_id: idSchema,
  type: notificationType,
  payload_json: z.record(z.unknown()).default({}),
  created_at: isoDateTime,
  read_at: isoDateTime.nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;
