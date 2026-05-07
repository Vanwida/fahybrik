import { z } from 'zod';
import { auditAction, idSchema, isoDateTime } from './_primitives.js';

export const auditLogSchema = z.object({
  id: idSchema,
  actor_user_id: idSchema.nullable(),
  entity_type: z.string().min(1).max(120),
  entity_id: idSchema,
  action: auditAction,
  diff_json: z.record(z.unknown()).default({}),
  created_at: isoDateTime,
});
export type AuditLog = z.infer<typeof auditLogSchema>;
