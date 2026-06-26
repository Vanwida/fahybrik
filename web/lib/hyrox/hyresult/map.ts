import 'server-only';

import {
  STATION_INDEX_STATION,
  type HyresultRace,
  type HyroxStationSplit,
  type RaceDivision,
  type RaceFormat,
  type RaceGender,
} from '@fahybrid/shared/schema';
import type { RaceUpsertRow } from '../upsert';
import { hyresultResultUrl } from './constants';

// =============================================================================
// Map a verbatim hyresult race → our normalized `races` row + its teammates.
//
// The machine `dg` composite (e.g. "pro-doubles-men", "doubles-mixed",
// "elite-men", "team-relay-women", "pro-doubles-elite-women") is the source of
// truth for format/division/gender — parsed by TOKEN, not by string matching the
// localized human label. Splits arrive TEAM-level for doubles/relay; we store
// them as-is (format encodes that) and never invent per-partner data.
// =============================================================================

const GENDER_BY_TOKEN: Record<string, RaceGender> = {
  men: 'men',
  women: 'women',
  mixed: 'mixed',
};

/**
 * A placing is only meaningful when strictly positive. hyresult records a missing
 * placing as 0 (and, defensively, never below), so 0/negative → null. This keeps
 * ingestion in agreement with both the DB CHECK (races_overall_rank_chk:
 * overall_rank > 0 or null, migration 0054) and the response projection
 * (overall_rank/age_group_rank `.positive().nullable()`): a no-rank entry imports
 * with a null rank instead of poisoning the whole batch.
 */
function rankOrNull(n: number | null | undefined): number | null {
  return n != null && n > 0 ? n : null;
}

/**
 * Parse a `dg` composite into format/division/gender.
 *   format   — relay if the token set has 'relay', else doubles if 'doubles',
 *              else singles.
 *   division — precedence elite > pro > open. A dg may carry BOTH 'pro' and
 *              'elite' (e.g. "pro-doubles-elite-women" = HYROX PRO DOUBLES
 *              ELITE); the elite heat is the more specific bracket, so it wins
 *              the single division slot.
 *   gender   — the LAST token (always men|women|mixed); falls back to the
 *              explicit `gender` field, then 'men', if ever absent.
 */
export function parseDg(
  dg: string,
  genderFallback?: string | null,
): { format: RaceFormat; division: RaceDivision; gender_category: RaceGender } {
  const tokens = dg.toLowerCase().split('-').filter(Boolean);
  const format: RaceFormat = tokens.includes('relay')
    ? 'relay'
    : tokens.includes('doubles')
      ? 'doubles'
      : 'singles';
  const division: RaceDivision = tokens.includes('elite')
    ? 'elite'
    : tokens.includes('pro')
      ? 'pro'
      : 'open';
  const last = tokens[tokens.length - 1] ?? '';
  const gender_category: RaceGender =
    GENDER_BY_TOKEN[last] ?? GENDER_BY_TOKEN[(genderFallback ?? '').toLowerCase()] ?? 'men';
  return { format, division, gender_category };
}

/**
 * Normalize a display name to hyresult's slug form (lowercase, accent-stripped,
 * non-alphanumeric runs → a single hyphen, trimmed). Used to recognise a self
 * team entry whose slug is null/empty by matching its name against the profile
 * slug, so the athlete never partners themselves.
 */
function nameToSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface MappedPartner {
  position: number;
  name: string;
  slug: string | null;
  nation: string | null;
  source_idp: string | null;
}

export interface MappedRace {
  row: RaceUpsertRow;
  partners: MappedPartner[];
}

/**
 * Map one hyresult race to the `races` upsert shape + its teammates.
 * `selfSlug` is the profile slug being imported: the athlete is removed from the
 * team[] (a partner is never yourself), so singles → 0 partners, doubles → 1,
 * relay → 3. Positions follow the source team order after that removal.
 */
export function mapToRaceRow(race: HyresultRace, athleteId: number, selfSlug: string): MappedRace {
  const { format, division, gender_category } = parseDg(race.dg, race.gender);

  // run splits: t_r1..t_r8, present (non-null) in order.
  const runTimes = [
    race.t_r1,
    race.t_r2,
    race.t_r3,
    race.t_r4,
    race.t_r5,
    race.t_r6,
    race.t_r7,
    race.t_r8,
  ];
  const run_splits: number[] = [];
  for (const v of runTimes) if (v != null) run_splits.push(v);

  // station splits: t_w1..t_w8 → canonical station_index (2,4,…,16). hyresult
  // carries no per-station rank, so rank is null.
  const stationTimes = [
    race.t_w1,
    race.t_w2,
    race.t_w3,
    race.t_w4,
    race.t_w5,
    race.t_w6,
    race.t_w7,
    race.t_w8,
  ];
  const station_splits: HyroxStationSplit[] = [];
  stationTimes.forEach((v, i) => {
    if (v != null) station_splits.push({ index: STATION_INDEX_STATION[i], seconds: v, rank: null });
  });

  // Best run lap = the fastest present 1km split (a definitional derivation of
  // the splits, not invented data). Null when no runs were recorded.
  const best_run_lap_seconds = run_splits.length ? Math.min(...run_splits) : null;

  // Empty strings are treated as absent (|| not ??): an empty `location` would
  // pass `??` and reach the read-schema; here it falls through to null.
  const location = race.location || race.loc || null;
  // Event name: the source `name` is the team/entry name, not the event — build
  // from championship/location (race_date disambiguates same-venue editions).
  // `||` so an empty championship/location falls through instead of producing a
  // trailing "HYROX ".
  const eventLabel = race.championship || race.location || race.loc || 'Event';
  const name = `HYROX ${eventLabel}`.trim();

  // partners = team members minus the athlete themselves. Matched by slug; when a
  // self entry carries a null/empty slug (singles rows, or some doubles entries),
  // fall back to matching the normalized name against the profile slug — otherwise
  // the athlete would phantom-partner themselves. A real partner (different slug or
  // different name) is never dropped.
  const partners: MappedPartner[] = [];
  const team = race.team ?? [];
  const self = selfSlug.toLowerCase();
  for (const m of team) {
    const memberSlug = m.slug ? m.slug.toLowerCase() : '';
    if (memberSlug === self) continue;
    if (!memberSlug && nameToSlug(m.name) === self) continue;
    partners.push({
      position: partners.length,
      name: m.name,
      slug: m.slug ?? null,
      nation: m.nation ?? null,
      source_idp: m.idp ?? null,
    });
  }

  const row: RaceUpsertRow = {
    athlete_id: athleteId,
    name,
    event_type: 'hyrox',
    format,
    division,
    gender_category,
    // Historical, completed races: never the upcoming target. priority is the
    // coach-owned periodization role; 'tune_up' keeps them out of the target
    // countdown (they are also past, so the upcoming-race lookups skip them).
    priority: 'tune_up',
    age_group: race.agegroup ?? null,
    race_date: race.date_start, // REAL race date, never today.
    location,
    result_time_seconds: race.t_total,
    status: 'completed',
    run_splits,
    station_splits,
    roxzone_seconds: race.t_rx ?? null,
    run_total_seconds: race.t_ra ?? null,
    best_run_lap_seconds,
    overall_rank: rankOrNull(race.rank),
    age_group_rank: rankOrNull(race.rank_ag),
    // hyresult does not expose the field size → no percentile from this source.
    field_size: null,
    // `|| null`: an empty `code` ("") would violate races_nationality_chk
    // (length 1-8) and roll back the per-race savepoint, silently dropping the
    // race. Empty → null instead.
    nationality: race.code || null,
    bib: null,
    source: 'hyresult_import',
    source_idp: race.idp,
    source_event: null,
    source_season: `season-${race.season}`,
    source_url: hyresultResultUrl(race.idp),
  };

  return { row, partners };
}
