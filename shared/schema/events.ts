import { z } from 'zod';
import {
  eventType,
  idSchema,
  isoDate,
  isoDateTime,
  slugSchema,
} from './_primitives';

// HYROX has 5 official competition formats; CrossFit events use freeform
// division names so we keep this as a soft-validated whitelist with
// `other` escape. Server tolerates anything in the array but the picker
// only renders these.
export const eventRegion = z.enum(['EU', 'NA', 'APAC', 'LATAM', 'MEA']);
export type EventRegion = z.infer<typeof eventRegion>;

export const hyroxDivision = z.enum([
  'Pro',
  'Open',
  'Doubles',
  'Relay',
  'Mixed Doubles',
  'Masters',
  'Adaptive',
]);
export type HyroxDivision = z.infer<typeof hyroxDivision>;

export const eventSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  name: z.string().min(1).max(200),
  type: eventType,
  location: z.string().max(200).nullable(),
  country: z.string().length(2).nullable(),
  region: eventRegion.nullable(),
  start_date: isoDate,
  end_date: isoDate.nullable(),
  // Headline division (usually 'Pro' for HYROX). Free text to allow
  // CrossFit-specific wording.
  division: z.string().max(80).nullable(),
  // Full bouquet of divisions offered at this venue.
  division_options: z.array(z.string().max(80)).max(20),
  source_url: z.string().url().nullable(),
  is_visible_to_athletes: z.boolean(),
  created_by_coach_id: idSchema.nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type Event = z.infer<typeof eventSchema>;

// =============================================================================
// Request payloads
// =============================================================================

// POST /api/coach/events — Pablo creates a manual event
export const eventCreateInput = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(200),
  type: eventType,
  location: z.string().max(200).nullable().optional(),
  country: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2, uppercase')
    .nullable()
    .optional(),
  region: eventRegion.nullable().optional(),
  start_date: isoDate,
  end_date: isoDate.nullable().optional(),
  division: z.string().max(80).nullable().optional(),
  division_options: z.array(z.string().max(80)).max(20).optional(),
  source_url: z.string().url().nullable().optional(),
  is_visible_to_athletes: z.boolean().optional(),
});
export type EventCreateInput = z.infer<typeof eventCreateInput>;

// PATCH /api/coach/events/[id] — Pablo edits attributes / toggles visibility
export const eventUpdateInput = eventCreateInput.partial();
export type EventUpdateInput = z.infer<typeof eventUpdateInput>;
