import { z } from 'zod';
import { emailSchema, idSchema, isoDateTime, userLanguage, userRole } from './_primitives';

// box_class_schedule shape (D1 — box-class awareness for in-box athletes).
// Free-form by design — we store the days/types the athlete attends Pablo's
// in-person classes so the IA can avoid double-stacking volume. Coach edits
// this in the dashboard; iOS reads it.
//
// day_of_week: ISO 8601 numeric (1 = Monday … 7 = Sunday).
export const boxClassDaySchema = z.object({
  day_of_week: z.number().int().min(1).max(7),
  type: z.string().min(1).max(60),
  notes: z.string().max(500).optional(),
});
export type BoxClassDay = z.infer<typeof boxClassDaySchema>;

export const boxClassScheduleSchema = z.object({
  days: z.array(boxClassDaySchema),
});
export type BoxClassSchedule = z.infer<typeof boxClassScheduleSchema>;

export const userSchema = z.object({
  id: idSchema,
  email: emailSchema,
  apple_user_id: z.string().nullable(),
  role: userRole,
  // Dobles HYROX pairing. NULL when the user has no partner (most cases).
  // Pairing is bidirectional but stored as two independent self-references —
  // the application layer keeps them in sync.
  partner_id: idSchema.nullable(),
  // True when the athlete also attends Pablo's in-person classes at Fabrik.
  // Drives IA volume adjustments to avoid stacking with box work.
  box_member: z.boolean(),
  // 'es' default; 'en' for international athletes. Localizes notifications and
  // iOS surfaces.
  idioma: userLanguage,
  // Box class schedule (only meaningful when box_member = true).
  box_class_schedule: boxClassScheduleSchema.nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
  last_seen_at: isoDateTime.nullable(),
  deleted_at: isoDateTime.nullable(),
});
export type User = z.infer<typeof userSchema>;

export const userInsertSchema = userSchema
  .pick({
    email: true,
    apple_user_id: true,
    role: true,
    partner_id: true,
    box_member: true,
    idioma: true,
    box_class_schedule: true,
  })
  .extend({
    apple_user_id: z.string().nullish(),
    partner_id: idSchema.nullish(),
    box_member: z.boolean().optional(),
    idioma: userLanguage.optional(),
    box_class_schedule: boxClassScheduleSchema.nullish(),
  });
export type UserInsert = z.infer<typeof userInsertSchema>;
