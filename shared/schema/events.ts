import { z } from 'zod';
import {
  eventType,
  idSchema,
  isoDate,
  isoDateTime,
  slugSchema,
  targetPriority,
} from './_primitives.js';

export const eventSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  name: z.string().min(1).max(200),
  type: eventType,
  location: z.string().max(200).nullable(),
  country: z.string().length(2).nullable(),
  start_date: isoDate,
  end_date: isoDate.nullable(),
  division: z.string().max(80).nullable(),
  source_url: z.string().url().nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type Event = z.infer<typeof eventSchema>;

export const athleteTargetEventSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  event_id: idSchema,
  priority: targetPriority,
  notes: z.string().max(2000).nullable(),
  created_at: isoDateTime,
});
export type AthleteTargetEvent = z.infer<typeof athleteTargetEventSchema>;
