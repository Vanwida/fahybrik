import { z } from 'zod';
import { idSchema, isoDate, isoDateTime } from './_primitives';

// The RACE/COMPETITION domain. A `race` is a per-athlete competition entry — the
// ANCHOR of the periodization (the ATR macrocycle peaks at it) and the source of
// the "days until race" countdown. Distinct from the shared `events` catalog
// (public HYROX venues Pablo curates): a race owns the athlete's own competition
// attributes — format, division, gender category, goal time, result, status,
// and its PRIORITY/role in the plan.

// race_event_type pg enum — what kind of competition.
export const raceEventType = z.enum(['hyrox', 'deka', 'other']);
export type RaceEventType = z.infer<typeof raceEventType>;

// race_format pg enum — HYROX participation format.
export const raceFormat = z.enum(['singles', 'doubles', 'relay']);
export type RaceFormat = z.infer<typeof raceFormat>;

// race_division pg enum — HYROX singles divisions.
export const raceDivision = z.enum(['open', 'pro']);
export type RaceDivision = z.infer<typeof raceDivision>;

// race_gender pg enum — gender category of the heat.
export const raceGender = z.enum(['men', 'women', 'mixed']);
export type RaceGender = z.infer<typeof raceGender>;

// race_status pg enum — registration lifecycle.
export const raceStatus = z.enum(['planned', 'registered', 'completed']);
export type RaceStatus = z.infer<typeof raceStatus>;

// race_priority pg enum — A/B/C-race periodization role.
//   target    — the GOAL race the plan peaks/tapers to (the main countdown).
//   secondary — raced with a mini-taper, not the focus.
//   tune_up   — intermediate race used as training/test, no taper.
export const racePriority = z.enum(['target', 'secondary', 'tune_up']);
export type RacePriority = z.infer<typeof racePriority>;

export const raceSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  created_by_coach_id: idSchema.nullable(),
  name: z.string().min(1).max(200),
  event_type: raceEventType,
  format: raceFormat,
  division: raceDivision,
  gender_category: raceGender,
  priority: racePriority,
  age_group: z.string().max(80).nullable(),
  race_date: isoDate,
  location: z.string().max(200).nullable(),
  goal_time_seconds: z.number().int().positive().nullable(),
  result_time_seconds: z.number().int().positive().nullable(),
  status: raceStatus,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type Race = z.infer<typeof raceSchema>;

// =============================================================================
// API projection — the next/target race surfaced to athlete + coach.
// Snake_case to match the iOS Codable contract. `days_until` = race_date - today
// (Europe/Madrid), so 0 = race is today, negative never occurs (only upcoming
// races are surfaced).
// =============================================================================

export const nextRaceSchema = z.object({
  name: z.string(),
  event_type: raceEventType,
  format: raceFormat,
  division: raceDivision,
  gender_category: raceGender,
  priority: racePriority,
  age_group: z.string().nullable(),
  race_date: isoDate,
  location: z.string().nullable(),
  goal_time_seconds: z.number().int().positive().nullable(),
  days_until: z.number().int(),
});
export type NextRace = z.infer<typeof nextRaceSchema>;

// Compact summary for the coach athletes-LIST and ficha headers — just enough to
// render "Objetivo: HYROX BCN · 58 días" without the full race object.
export const raceSummarySchema = z.object({
  name: z.string(),
  priority: racePriority,
  days_until: z.number().int(),
  // e.g. "HYROX · Singles · Open · Men" — one-line category for the chip.
  category: z.string(),
});
export type RaceSummary = z.infer<typeof raceSummarySchema>;

// =============================================================================
// Request payloads
// =============================================================================

// POST /api/coach/athletes/[id]/races — coach registers a race for an athlete.
export const raceCreateInput = z.object({
  name: z.string().min(1).max(200),
  event_type: raceEventType,
  format: raceFormat,
  division: raceDivision,
  gender_category: raceGender,
  priority: racePriority.optional(), // defaults to 'target' at the DB layer
  age_group: z.string().max(80).nullable().optional(),
  race_date: isoDate,
  location: z.string().max(200).nullable().optional(),
  goal_time_seconds: z.number().int().positive().nullable().optional(),
  status: raceStatus.optional(), // defaults to 'registered' at the DB layer
});
export type RaceCreateInput = z.infer<typeof raceCreateInput>;
