import { z } from 'zod';
import { idSchema, isoDate, isoDateTime } from './_primitives';
// Single source of truth for the HYROX 16-element layout (8 runs + 8 stations).
import { HYROX_ELEMENT_COUNT } from './hyrox-layout';

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

// race_division pg enum — HYROX competitive bracket / weight level. 'open' and
// 'pro' are the singles+doubles weight divisions; 'elite' is the apex bracket
// (HYROX ELITE / DOUBLES ELITE / PRO DOUBLES ELITE / ELITE RELAY) surfaced by
// the hyresult.com full-history import (migration 0071).
export const raceDivision = z.enum(['open', 'pro', 'elite']);
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
  // Nullable since migration 0072: the official single-URL HYROX import has no
  // machine-readable date, so it stores NULL ("date unknown") rather than a
  // fabricated placeholder. hyresult + manual/coach races always carry a real date.
  race_date: isoDate.nullable(),
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

// =============================================================================
// HYROX result IMPORT (migration 0054 — additive columns on `races`)
//
// An imported HYROX official result is a FACTUAL per-athlete race record. It
// lives on `races` — the unified per-athlete spine (one row carries FUTURE→PAST).
// These schemas validate the import INPUT (the link the athlete pastes) and
// project the STORED shape.
//
// HYROX is fixed: 8×1km runs interleaved with 8 stations. Splits arrive in the
// canonical FIXED order. `station_splits[].index` is the 16-element station_index
// (2,4,…,16 — see STATION_INDEX_STATION in hyrox-layout.ts).
// =============================================================================

// races.source — provenance of the row.
//   manual          — entered by hand by the athlete/coach.
//   hyrox_import     — single official result pasted from results.hyrox.com (0054).
//   hyresult_import  — full history imported by name from hyresult.com (0071).
export const raceSource = z.enum(['manual', 'hyrox_import', 'hyresult_import']);
export type RaceSource = z.infer<typeof raceSource>;

// Allowed HYROX results host (SSRF allowlist — the endpoint rejects any other).
export const HYROX_RESULTS_HOST = 'results.hyrox.com' as const;

// Bounds shared with the migration CHECK constraints.
const splitSeconds = z.number().int().min(0).max(7200);

// One station split. `index` is the canonical 16-element station_index
// (2=SkiErg … 16=WallBalls). `rank` is the athlete's placing in that station
// (null on the HYROX page → null here).
export const hyroxStationSplitSchema = z.object({
  index: z.number().int().min(1).max(HYROX_ELEMENT_COUNT),
  seconds: splitSeconds.nullable(),
  rank: z.number().int().positive().nullable(),
});
export type HyroxStationSplit = z.infer<typeof hyroxStationSplitSchema>;

// The parsed + stored HYROX result projection (snake_case, iOS Codable contract).
// Mirrors exactly the additive `races` columns the importer writes, plus the
// derived `percentile`. `run_splits` are 8 ordered ints (run 1..8). 8 stations.
export const hyroxImportedResultSchema = z.object({
  race_id: idSchema,
  athlete_id: idSchema,
  name: z.string().min(1).max(200),
  // Total finish time (HYROX "Net" finish) — also stored in result_time_seconds.
  result_time_seconds: z.number().int().positive(),
  division: raceDivision,
  gender_category: raceGender,
  age_group: z.string().max(80).nullable(),
  nationality: z.string().max(8).nullable(),
  bib: z.string().max(40).nullable(),
  // null when unknown: the official results.hyrox.com detail page exposes the
  // meeting name but no ISO date, so the single-URL import stores NULL (0072)
  // instead of fabricating today's date.
  race_date: isoDate.nullable(),
  location: z.string().max(200).nullable(),
  // 8 run laps in order (seconds). May be empty if the page lacked the table.
  run_splits: z.array(splitSeconds).max(8),
  // 8 stations in fixed order, each with the canonical index + rank.
  station_splits: z.array(hyroxStationSplitSchema).max(8),
  roxzone_seconds: z.number().int().min(0).max(7200).nullable(),
  run_total_seconds: z.number().int().min(0).max(14400).nullable(),
  best_run_lap_seconds: z.number().int().min(0).max(3600).nullable(),
  overall_rank: z.number().int().positive().nullable(),
  age_group_rank: z.number().int().positive().nullable(),
  field_size: z.number().int().positive().nullable(),
  // overall_rank / field_size as a 0..1 fraction (1 = last). null if either is
  // missing. Lower is better.
  percentile: z.number().min(0).max(1).nullable(),
  source: raceSource,
  source_idp: z.string().max(120).nullable(),
  source_event: z.string().max(120).nullable(),
  source_season: z.string().max(40).nullable(),
  source_url: z.string().max(500).nullable(),
  imported_at: isoDateTime.nullable(),
});
export type HyroxImportedResult = z.infer<typeof hyroxImportedResultSchema>;

// POST /api/athlete/race-results/import — body. The athlete pastes the HYROX
// detail link. Host is re-validated server-side against HYROX_RESULTS_HOST.
export const hyroxImportInput = z.object({
  result_url: z.string().url().max(500),
});
export type HyroxImportInput = z.infer<typeof hyroxImportInput>;

// =============================================================================
// ATHLETE RACE HISTORY projection — GET /api/athlete/race-context → `history[]`
// (the iOS Carreras hub's race list). One row per imported/completed race the
// athlete has — singles AND doubles/relay (migration 0071).
//
// Distinct from hyroxImportedResultSchema (the single official-import display):
// this is the READ projection for the WHOLE history, so it carries the team
// dimension the single-race shape lacks — format/division/gender_category,
// is_team_result, and the teammates joined from `race_partners`.
//
//   is_team_result === (format !== 'singles'). For a team race the run/station
//   splits, the ranks and the age_group are the TEAM's — NOT the athlete's
//   individual performance — so the flag tells the client to label them as such.
//   partners = teammates ordered by position ([] for singles).
//
// race_id is the numeric `races.id`. race_date is the REAL stored date (the
// hyresult importer stores the true date_start; never a placeholder). percentile
// is derived (overall_rank / field_size), never stored.
// =============================================================================

// One teammate of a doubles/relay race (a `race_partners` row, ordered by
// position). slug/nation are null when the source didn't expose them.
export const racePartnerSchema = z.object({
  name: z.string(),
  slug: z.string().nullable(),
  nation: z.string().nullable(),
  position: z.number().int().nonnegative(),
});
export type RacePartner = z.infer<typeof racePartnerSchema>;

export const raceHistoryItemSchema = z.object({
  race_id: z.number().int().nonnegative(),
  name: z.string().min(1).max(200),
  // REAL stored race date (YYYY-MM-DD); never a fabricated placeholder. NULL only
  // for an official single-URL import whose detail page carried no ISO date (0072);
  // hyresult + manual rows always have a real date. Readers sort NULLs last.
  race_date: isoDate.nullable(),
  location: z.string().max(200).nullable(),
  event_type: raceEventType,
  format: raceFormat,
  // 'elite' is the apex bracket surfaced by the hyresult import (0071).
  division: raceDivision,
  gender_category: raceGender,
  // For doubles/relay this is the TEAM bracket, not the athlete's true age.
  age_group: z.string().max(80).nullable(),
  result_time_seconds: z.number().int().positive().nullable(),
  run_total_seconds: z.number().int().min(0).max(14400).nullable(),
  roxzone_seconds: splitSeconds.nullable(),
  best_run_lap_seconds: z.number().int().min(0).max(3600).nullable(),
  overall_rank: z.number().int().positive().nullable(),
  age_group_rank: z.number().int().positive().nullable(),
  field_size: z.number().int().positive().nullable(),
  // overall_rank / field_size as a 0..1 fraction (lower = better). Derived, not
  // stored; null when either rank or field is missing.
  percentile: z.number().min(0).max(1).nullable(),
  // Up to 8 run laps (seconds), run 1..8 in order.
  run_splits: z.array(splitSeconds).max(8),
  // Up to 8 stations, each with the canonical 16-element index + optional rank.
  station_splits: z.array(hyroxStationSplitSchema).max(8),
  // true ⇔ format !== 'singles': splits / ranks / age_group are TEAM-level.
  is_team_result: z.boolean(),
  partners: z.array(racePartnerSchema),
  source: raceSource,
  source_season: z.string().max(40).nullable(),
});
export type RaceHistoryItem = z.infer<typeof raceHistoryItemSchema>;
