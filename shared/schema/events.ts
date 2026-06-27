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

// Series — the HYROX-adjacent competition brand. Mirrors the events_series_chk
// DB constraint (migration 0077): a soft whitelist with an 'other' escape, NOT a
// closed hardcoded enum — adding a series later is a one-line constraint bump
// plus this list. `type` (hyrox/crossfit/other) stays the broad category;
// `series` is the finer brand label the scraper + catalog curation fill.
export const eventSeries = z.enum(['hyrox', 'deka', 'athx', 'deadly_dozen', 'other']);
export type EventSeries = z.infer<typeof eventSeries>;

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
  // Nullable since migration 0080: a venue announced without a confirmed date is
  // stored honestly as null + is_tentative=true (we never invent a placeholder).
  start_date: isoDate.nullable(),
  end_date: isoDate.nullable(),
  // Headline division (usually 'Pro' for HYROX). Free text to allow
  // CrossFit-specific wording.
  division: z.string().max(80).nullable(),
  // Full bouquet of divisions offered at this venue.
  division_options: z.array(z.string().max(80)).max(20),
  source_url: z.string().url().nullable(),
  is_visible_to_athletes: z.boolean(),
  // Catalog metadata (migration 0077): the finer series brand + scraper origin.
  series: eventSeries.nullable(),
  is_tentative: z.boolean(),
  source: z.string().max(80).nullable(),
  source_ref: z.string().max(200).nullable(),
  created_by_coach_id: idSchema.nullable(),
  // Owner/admin curation flag (migration 0079): set ⇒ scraper never overwrites.
  verified_by_user_id: idSchema.nullable(),
  verified_at: isoDateTime.nullable(),
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
  // Optional + nullable: a "por confirmar" race can be created with no date.
  start_date: isoDate.nullable().optional(),
  end_date: isoDate.nullable().optional(),
  division: z.string().max(80).nullable().optional(),
  division_options: z.array(z.string().max(80)).max(20).optional(),
  source_url: z.string().url().nullable().optional(),
  is_visible_to_athletes: z.boolean().optional(),
  // Catalog metadata — optional so the existing manual-create path is unchanged;
  // the admin curation surface and a future scraper set them.
  series: eventSeries.nullable().optional(),
  is_tentative: z.boolean().optional(),
  source: z.string().max(80).nullable().optional(),
  source_ref: z.string().max(200).nullable().optional(),
});
export type EventCreateInput = z.infer<typeof eventCreateInput>;

// PATCH /api/coach/events/[id] — Pablo edits attributes / toggles visibility
export const eventUpdateInput = eventCreateInput.partial();
export type EventUpdateInput = z.infer<typeof eventUpdateInput>;

// =============================================================================
// Admin race-catalog curation (phase 2c) — owner/admin only
// =============================================================================
//
// Reuses the event payloads + a `verified` convenience flag the route maps to
// the verified_by_user_id column (true ⇒ session.user_id, false ⇒ null,
// omitted ⇒ leave unchanged). Verification is NEVER set from a client-supplied
// id — the route derives it from the authenticated admin session.
export const adminRaceCreateInput = eventCreateInput.extend({
  verified: z.boolean().optional(),
});
export type AdminRaceCreateInput = z.infer<typeof adminRaceCreateInput>;

export const adminRaceUpdateInput = eventUpdateInput.extend({
  verified: z.boolean().optional(),
});
export type AdminRaceUpdateInput = z.infer<typeof adminRaceUpdateInput>;
