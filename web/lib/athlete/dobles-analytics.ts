import 'server-only';

// =============================================================================
// Dobles SHARED ANALYTICS resolver
//
// Powers GET /api/athlete/dobles/analytics — the iOS DoblesSharedAnalytics
// contract. Two connected athletes (Dobles modality) SEE each other's training
// and SHARE analytics. This screen compares each partner's OWN INDIVIDUAL
// single-race results: the per-athlete imported HYROX rows we already store
// (`races` with source in ('hyrox_import','hyresult_import') AND format='singles'
// — run/station splits + ranks). It reuses the exact stored-row read + parse
// contract documented in race-context.ts. SINGLES only on purpose: doubles/relay
// splits are TEAM-level (the team's combined time, not this athlete's), so they
// would misread as this athlete's individual performance in the head-to-head.
//
// DESIGN DECISION (owner): there is NO separate "joint doubles result" entry.
// `doubles_mark` and `doubles_delta` are therefore ALWAYS null — we never
// fabricate a joint mark. The shared signal IS the head-to-head between each
// athlete's best individual race.
//
// Domain model (everything derived ONLY from real stored data; honest-null otherwise):
//   best_self / best_partner
//     Each athlete's BEST (fastest) individual HYROX finish across their
//     imports → "H:MM:SS". Null when that athlete has no imported race.
//   head_to_head[]  (per HYROX STATION)
//     From each athlete's best race, the 8 stations' times side by side
//     (self vs partner). A station row appears when EITHER athlete has a time
//     for it; the missing side reads null. Faster = lower seconds.
//   contributions[]  ("who's stronger" per discipline GROUP, self_share 0..1)
//     The 8 stations + the run total folded into discipline groups. For a group
//     where BOTH athletes have a comparable time, self_share = partner_time /
//     (self_time + partner_time): the FASTER athlete carries the larger share
//     (i.e. is "stronger" there). A group with only one side's time is omitted
//     (a 100/0 bar would misread as a doubles split, not a strength signal).
//   weekly[]  (friendly per-athlete comparison the screen draws as a table)
//     Honest, derivable-from-existing-data rows: best individual HYROX finish,
//     and completed sessions in the trailing 7 days (recent volume) per athlete.
//     A row is included only when at least one side has a value.
//   doubles_mark / doubles_delta → null (no joint result, by decision).
//
// HONEST-EMPTY: the route returns null (→ iOS empty state) when the athlete has
// NO partner, or when NEITHER athlete has an imported race. With a partner but
// only one side holding races, we still return the contract with that side's
// bests + the weekly rows; head_to_head/contributions degrade honestly.
// =============================================================================

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  HYROX_STATION_LABELS,
  STATION_INDEX_STATION,
  hyroxStationSplitSchema,
  type HyroxStationSplit,
} from '@fahybrid/shared/schema';
import { z } from 'zod';

// ── Wire contract (matches iOS DoblesSharedAnalytics, snake_case) ────────────

export interface DoblesH2HRowDTO {
  id: string;
  metric: string;
  self_value: string | null;
  partner_value: string | null;
}

export interface DoblesContributionDTO {
  id: string;
  group: string;
  /** Share the self athlete carries, 0..1 (partner = 1 − this). */
  self_share: number;
}

export interface DoblesSharedAnalyticsDTO {
  partner_name: string | null;
  best_self: string | null;
  best_partner: string | null;
  /** No joint doubles result exists (by decision) — always null. */
  doubles_mark: string | null;
  doubles_delta: string | null;
  contributions: DoblesContributionDTO[];
  weekly: DoblesH2HRowDTO[];
  head_to_head: DoblesH2HRowDTO[];
  contribution_summary: string | null;
}

// ── Discipline grouping (HYROX station_index → group) ────────────────────────
// The 8 even-index stations folded into the discipline groups the screen reads.
// Running is its own group, fed by each best race's run_total_seconds. Order is
// the canonical race order so the bars read top-to-bottom as the event flows.
const RUNNING_GROUP = 'Running';

const STATION_GROUPS: ReadonlyArray<{ label: string; indexes: readonly number[] }> = [
  { label: 'Erg / cardio', indexes: [2, 10] }, //  SkiErg, Row
  { label: 'Trineos', indexes: [4, 6] }, //         Sled push, Sled pull
  { label: 'Burpees / wall balls', indexes: [8, 16] }, // Burpee broad jump, Wall ball
  { label: 'Carries / lunges', indexes: [12, 14] }, // Farmer carry, Sandbag lunge
] as const;

// Within ±this fraction of an even 50/50 split, treat a group as "parejos"
// rather than crediting either athlete (mirrors the iOS ±8-point parity band).
const PARITY_BAND = 0.08;

// Trailing window (days) for the "recent volume" weekly row.
const RECENT_VOLUME_DAYS = 7;

// ── Formatting (identical contract to race-context.ts timeStr) ───────────────

/** Seconds → "H:MM:SS" when ≥1h, else "M:SS". Null-safe. */
function timeStr(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Parse stored station_splits_json into the validated split list (same as race-context). */
function parseStationSplits(raw: unknown): HyroxStationSplit[] {
  const parsed = z.array(hyroxStationSplitSchema).max(8).safeParse(raw ?? []);
  return parsed.success ? parsed.data : [];
}

// ── Per-athlete best race ─────────────────────────────────────────────────────

interface BestRaceRow {
  result_time_seconds: number | null;
  run_total_seconds: number | null;
  station_splits_json: unknown;
}

interface AthleteBest {
  /** Fastest finish across imports, seconds. Null if no imported race. */
  finish_seconds: number | null;
  /** Run total of THAT best race, seconds. */
  run_total_seconds: number | null;
  /** Station index (even, 2..16) → seconds, from the best race. */
  station_seconds: Map<number, number>;
  has_race: boolean;
}

/**
 * Load an athlete's BEST individual HYROX import (lowest result_time_seconds).
 * The chosen race anchors the station head-to-head + the run total — comparing
 * each athlete's own peak performance, station by station. Reuses the same
 * race-row read shape as buildCarrerasOverview.
 */
async function loadAthleteBest(client: Sql, athleteId: bigint): Promise<AthleteBest> {
  const rows = await client<BestRaceRow[]>`
    select
      result_time_seconds,
      run_total_seconds,
      station_splits_json
    from races
    where athlete_id = ${athleteId as unknown as number}
      and source in ('hyrox_import', 'hyresult_import')
      and format = 'singles'
      and result_time_seconds is not null
    order by result_time_seconds asc, race_date desc, id desc
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    return {
      finish_seconds: null,
      run_total_seconds: null,
      station_seconds: new Map(),
      has_race: false,
    };
  }

  const stationSeconds = new Map<number, number>();
  for (const st of parseStationSplits(row.station_splits_json)) {
    if (st.seconds != null && Number.isFinite(st.seconds) && st.seconds >= 0) {
      stationSeconds.set(st.index, st.seconds);
    }
  }

  return {
    finish_seconds: row.result_time_seconds,
    run_total_seconds: row.run_total_seconds,
    station_seconds: stationSeconds,
    has_race: true,
  };
}

/** Count completed sessions (executions with an ended_at) in the trailing N days. */
async function loadRecentVolume(
  client: Sql,
  athleteId: bigint,
  days: number,
): Promise<number> {
  const rows = await client<{ n: string }[]>`
    select count(*)::text as n
    from workout_executions
    where athlete_id = ${athleteId as unknown as number}
      and ended_at is not null
      and ended_at >= now() - (${days}::int * interval '1 day')
  `;
  return Number(rows[0]?.n ?? 0);
}

// ── Pure builders (no DB; unit-testable) ─────────────────────────────────────

/**
 * Per-station head-to-head from each athlete's best race. A row appears when
 * EITHER side has a time; the missing side is null. Stations only (even index),
 * in canonical race order.
 */
export function buildHeadToHead(self: AthleteBest, partner: AthleteBest): DoblesH2HRowDTO[] {
  const rows: DoblesH2HRowDTO[] = [];
  for (const idx of STATION_INDEX_STATION) {
    const selfSec = self.station_seconds.get(idx);
    const partnerSec = partner.station_seconds.get(idx);
    if (selfSec === undefined && partnerSec === undefined) continue;
    rows.push({
      id: `station_${idx}`,
      metric: HYROX_STATION_LABELS[idx] ?? `Estación ${idx}`,
      self_value: timeStr(selfSec ?? null),
      partner_value: timeStr(partnerSec ?? null),
    });
  }
  return rows;
}

/**
 * "Who's stronger" per discipline group as a self_share 0..1. For a group where
 * BOTH athletes have a comparable time (sum of that group's station seconds, or
 * the run total for Running), the faster athlete gets the larger share:
 *   self_share = partner_time / (self_time + partner_time)
 * A group with only one side's data is omitted (no strength comparison possible).
 */
export function buildContributions(
  self: AthleteBest,
  partner: AthleteBest,
): DoblesContributionDTO[] {
  const out: DoblesContributionDTO[] = [];

  const pushShare = (id: string, group: string, selfSec: number, partnerSec: number) => {
    const denom = selfSec + partnerSec;
    if (denom <= 0) return;
    // Faster (lower seconds) → larger share. partner_time / total gives self the
    // bigger slice when self is faster.
    const rawShare = partnerSec / denom;
    out.push({ id, group, self_share: clamp01(rawShare) });
  };

  // Running group from the best-race run totals.
  if (
    self.run_total_seconds != null &&
    self.run_total_seconds > 0 &&
    partner.run_total_seconds != null &&
    partner.run_total_seconds > 0
  ) {
    pushShare('group_running', RUNNING_GROUP, self.run_total_seconds, partner.run_total_seconds);
  }

  // Station-derived groups.
  for (const g of STATION_GROUPS) {
    const selfSec = sumStations(self, g.indexes);
    const partnerSec = sumStations(partner, g.indexes);
    if (selfSec == null || partnerSec == null) continue;
    pushShare(`group_${slug(g.label)}`, g.label, selfSec, partnerSec);
  }

  return out;
}

/**
 * One-line prose from the contributions: the groups where each athlete is the
 * clear leader (outside the parity band). Null when nothing is decisive.
 */
export function buildContributionSummary(
  contributions: DoblesContributionDTO[],
  partnerName: string,
): string | null {
  const selfGroups: string[] = [];
  const partnerGroups: string[] = [];
  for (const c of contributions) {
    if (Math.abs(c.self_share - 0.5) <= PARITY_BAND) continue;
    if (c.self_share > 0.5) selfGroups.push(c.group.toLowerCase());
    else partnerGroups.push(c.group.toLowerCase());
  }
  const parts: string[] = [];
  if (selfGroups.length > 0) parts.push(`tú dominas ${joinEs(selfGroups)}`);
  if (partnerGroups.length > 0) parts.push(`${partnerName} domina ${joinEs(partnerGroups)}`);
  if (parts.length === 0) return null;
  const sentence = parts.join('; ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

/**
 * Friendly weekly comparison rows. Best individual HYROX finish, and recent
 * completed-session volume (trailing window). A row is included only when at
 * least one side has a value — never a fully-empty row.
 */
export function buildWeekly(
  self: AthleteBest,
  partner: AthleteBest,
  selfVolume: number,
  partnerVolume: number,
): DoblesH2HRowDTO[] {
  const rows: DoblesH2HRowDTO[] = [];

  const bestSelf = timeStr(self.finish_seconds);
  const bestPartner = timeStr(partner.finish_seconds);
  if (bestSelf != null || bestPartner != null) {
    rows.push({
      id: 'best_hyrox',
      metric: 'Mejor HYROX',
      self_value: bestSelf,
      partner_value: bestPartner,
    });
  }

  if (selfVolume > 0 || partnerVolume > 0) {
    rows.push({
      id: 'sessions_7d',
      metric: 'Sesiones (7 días)',
      self_value: `${selfVolume}`,
      partner_value: `${partnerVolume}`,
    });
  }

  return rows;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/** Sum a group's station seconds for an athlete; null if any station is missing. */
function sumStations(best: AthleteBest, indexes: readonly number[]): number | null {
  let total = 0;
  for (const idx of indexes) {
    const sec = best.station_seconds.get(idx);
    if (sec === undefined) return null;
    total += sec;
  }
  return total;
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Spanish list join: ["a","b","c"] → "a, b y c". */
function joinEs(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

// ── Builder input + public API ───────────────────────────────────────────────

export interface DoblesAnalyticsInput {
  sql?: Sql;
  self_athlete_id: bigint;
  partner_athlete_id: bigint;
  partner_name: string | null;
}

/**
 * Build the shared analytics for a Dobles pair. Returns null (→ honest empty
 * state) only when NEITHER athlete has an imported race. The caller is
 * responsible for the no-partner honest-empty (it can't even reach here without
 * a partner_athlete_id).
 */
export async function buildDoblesSharedAnalytics(
  input: DoblesAnalyticsInput,
): Promise<DoblesSharedAnalyticsDTO | null> {
  const client = input.sql ?? defaultSql;

  const [self, partner, selfVolume, partnerVolume] = await Promise.all([
    loadAthleteBest(client, input.self_athlete_id),
    loadAthleteBest(client, input.partner_athlete_id),
    loadRecentVolume(client, input.self_athlete_id, RECENT_VOLUME_DAYS),
    loadRecentVolume(client, input.partner_athlete_id, RECENT_VOLUME_DAYS),
  ]);

  // Honest-empty: nothing to compare if neither athlete has imported a race.
  if (!self.has_race && !partner.has_race) return null;

  const contributions = buildContributions(self, partner);
  const partnerLabel = input.partner_name?.trim() || 'tu compañero';

  return {
    partner_name: input.partner_name,
    best_self: timeStr(self.finish_seconds),
    best_partner: timeStr(partner.finish_seconds),
    // No joint doubles result exists (by decision) — never fabricated.
    doubles_mark: null,
    doubles_delta: null,
    contributions,
    weekly: buildWeekly(self, partner, selfVolume, partnerVolume),
    head_to_head: buildHeadToHead(self, partner),
    contribution_summary: buildContributionSummary(contributions, partnerLabel),
  };
}
