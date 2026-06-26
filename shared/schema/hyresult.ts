import { z } from 'zod';
import { isoDate } from './_primitives';
import {
  hyroxStationSplitSchema,
  raceDivision,
  raceEventType,
  raceFormat,
  raceGender,
  raceSource,
} from './races';

// =============================================================================
// hyresult.com import — the EXTERNAL SOURCE contract (migration 0071).
//
// Two source shapes, kept here (not in races.ts) because they model the
// hyresult.com payload, NOT our domain:
//   * AthleteCandidate — a public Meilisearch hit (name → disambiguation list).
//   * HyresultRace     — one verbatim race object lifted from the athlete
//                        profile's RSC flight stream.
// Plus the import-all RESPONSE projection (our snake_case contract), which
// reuses our own race enums + station-split shape.
//
// hyresult is a Next.js App Router site: the race history is NOT in
// __NEXT_DATA__ — it lives in `self.__next_f.push([1,"…"])` flight chunks, deep
// in the RSC element tree as a `races` prop. The web parser decodes + extracts
// it; these schemas validate the result.
// =============================================================================

// -----------------------------------------------------------------------------
// SEARCH — Meilisearch athlete candidate (GET /api/athlete/race-results/search).
// The raw hit carries `races` as a STRING count ("6"); we expose races_count as
// a number. nation/level help the athlete disambiguate namesakes.
// -----------------------------------------------------------------------------
export const hyresultCandidateSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(160),
  races_count: z.number().int().nonnegative(),
  nation: z.string().max(8).nullable(),
  level: z.string().max(40).nullable(),
});
export type HyresultCandidate = z.infer<typeof hyresultCandidateSchema>;

// -----------------------------------------------------------------------------
// PROFILE — one verbatim hyresult race object. Keys mirror the source exactly.
// Required (never null/absent across the live sample): idp, dg, season,
// date_start, t_total. Everything else is `.nullish()` — present-but-null in the
// source (e.g. agegroup, rank_ag, t_rx) or occasionally absent. `.passthrough()`
// keeps unknown future keys instead of failing the parse.
// -----------------------------------------------------------------------------
const srcInt = z.number().int().nullish(); // seconds or rank; null when absent

export const hyresultTeamMemberSchema = z
  .object({
    name: z.string(),
    slug: z.string().nullish(),
    nation: z.string().nullish(),
    // The SHARED team idp — every teammate of one race carries the same value.
    idp: z.string().nullish(),
  })
  .passthrough();
export type HyresultTeamMember = z.infer<typeof hyresultTeamMemberSchema>;

export const hyresultRaceSchema = z
  .object({
    idp: z.string().min(1),
    athlete_name: z.string().nullish(),
    // Source `name` is the ENTRY/team name (e.g. "Pablo Amigo, Isabel Mora"),
    // NOT the event name — the web mapper builds the event name from location.
    name: z.string().nullish(),
    // Human division label (e.g. "HYROX PRO DOUBLES"); the machine `dg` is the
    // source of truth for format/division/gender, label is documentation.
    division: z.string().nullish(),
    gender: z.string().nullish(), // "MEN" | "WOMEN" | "MIXED"
    // Machine composite, e.g. "pro-doubles-men", "doubles-mixed", "elite-men",
    // "team-relay-men". Token-parsed by the mapper into format/division/gender.
    dg: z.string().min(1),
    championship: z.string().nullish(),
    location: z.string().nullish(),
    loc: z.string().nullish(),
    code: z.string().nullish(), // IOC nation code, e.g. "ESP"
    agegroup: z.string().nullish(), // e.g. "40-44"
    yob: z.number().int().nullish(),
    season: z.number().int(),
    date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    date_end: z.string().nullish(),
    t_total: z.number().int().nonnegative(), // finish time (seconds)
    rank: srcInt, // overall placing
    rank_ag: srcInt, // age-group placing
    // 8 run laps (seconds), run 1..8.
    t_r1: srcInt,
    t_r2: srcInt,
    t_r3: srcInt,
    t_r4: srcInt,
    t_r5: srcInt,
    t_r6: srcInt,
    t_r7: srcInt,
    t_r8: srcInt,
    // 8 station splits (seconds), station 1..8 (→ canonical index 2,4,…,16).
    t_w1: srcInt,
    t_w2: srcInt,
    t_w3: srcInt,
    t_w4: srcInt,
    t_w5: srcInt,
    t_w6: srcInt,
    t_w7: srcInt,
    t_w8: srcInt,
    t_ra: srcInt, // running total
    t_wa: srcInt, // station total
    t_rx: srcInt, // roxzone (transitions) total
    // Present only for doubles/relay; absent or [self] for singles.
    team: z.array(hyresultTeamMemberSchema).nullish(),
  })
  .passthrough();
export type HyresultRace = z.infer<typeof hyresultRaceSchema>;

// -----------------------------------------------------------------------------
// IMPORT-ALL — request + response (POST /api/athlete/race-results/import-all).
// -----------------------------------------------------------------------------

// slug is deterministic (normalized full name); restrict to the hyresult charset
// to keep it safe in the profile URL.
export const hyresultImportAllInput = z.object({
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits and hyphens'),
});
export type HyresultImportAllInput = z.infer<typeof hyresultImportAllInput>;

export const hyresultSearchInput = z.object({
  q: z.string().min(2).max(120),
});
export type HyresultSearchInput = z.infer<typeof hyresultSearchInput>;

// A stored teammate, as returned in the import-all response.
export const hyresultPartnerSchema = z.object({
  position: z.number().int().nonnegative(),
  name: z.string(),
  slug: z.string().nullable(),
  nation: z.string().nullable(),
  source_idp: z.string().nullable(),
});
export type HyresultPartner = z.infer<typeof hyresultPartnerSchema>;

// One imported race as projected back to the client. Reuses our own race enums +
// station-split shape. For doubles/relay the splits are TEAM-level (stored
// as-is); `format` already encodes that — no per-partner splits are invented.
export const hyresultImportedRaceSchema = z.object({
  // NUMBER (not idSchema/bigint): unified with the history endpoint's race_id
  // (raceHistoryItemSchema.race_id is z.number()), so the iOS client decodes one
  // consistent JSON type. Serial ids are small — a JS number is safe.
  race_id: z.number().int().nonnegative(),
  name: z.string().min(1).max(200),
  event_type: raceEventType,
  format: raceFormat,
  division: raceDivision,
  gender_category: raceGender,
  age_group: z.string().max(80).nullable(),
  race_date: isoDate, // REAL race date (date_start), never today's date.
  result_time_seconds: z.number().int().positive(),
  run_splits: z.array(z.number().int().min(0).max(7200)).max(8),
  station_splits: z.array(hyroxStationSplitSchema).max(8),
  roxzone_seconds: z.number().int().min(0).max(7200).nullable(),
  run_total_seconds: z.number().int().min(0).max(14400).nullable(),
  best_run_lap_seconds: z.number().int().min(0).max(3600).nullable(),
  overall_rank: z.number().int().positive().nullable(),
  age_group_rank: z.number().int().positive().nullable(),
  nationality: z.string().max(8).nullable(),
  source: raceSource,
  source_idp: z.string().max(120),
  source_season: z.string().max(40).nullable(),
  source_url: z.string().max(500).nullable(),
  // true = a new row was inserted; false = an existing import was refreshed.
  was_inserted: z.boolean(),
  partners: z.array(hyresultPartnerSchema),
});
export type HyresultImportedRace = z.infer<typeof hyresultImportedRaceSchema>;

export const hyresultImportAllResult = z.object({
  imported: z.number().int().nonnegative(), // newly inserted
  updated: z.number().int().nonnegative(), // refreshed in place
  races: z.array(hyresultImportedRaceSchema),
});
export type HyresultImportAllResult = z.infer<typeof hyresultImportAllResult>;
