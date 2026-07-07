import 'server-only';

// =============================================================================
// Dobles SIMULATION resolver (athlete-facing read)
//
// Powers GET /api/athlete/dobles/simulation — the iOS DoblesSimulation contract
// (ios/FAHYBRIK/Dobles/DoblesService.swift → DoblesSimulation / DoblesStationSplit).
// The COACH authors the joint HYROX Doubles strategy A/B-neutrally (migration
// 0055 + shared/schema/dobles-simulation.ts): each station carries
// `assigned_to` ('a'|'b'|'split') and, when split, `self_share` = ATHLETE A's
// share (0..1; B = 1 - self_share). This resolver flips that to the READER's
// point of view so the iOS view colours the bar from the caller's perspective.
//
// THE FLIP (storage A-centric → read reader-centric)
// --------------------------------------------------
// The authenticated athlete may be stored as A OR B for the pair. We find the
// single simulation row for the {self, partner} pair regardless of orientation:
//   • reader IS athlete A  → self_share = stored self_share
//   • reader IS athlete B  → self_share = 1 - stored self_share
// `self_name` / `partner_name` are always the reader's name / their partner's.
//
// HONEST-EMPTY / HONEST-NULL
// --------------------------
//   • no linked partner                         → caller returns 404 no_partner
//   • partner linked but coach authored nothing → 404 no_simulation
// Fields the 0055 storage does NOT carry are emitted as honest nulls/defaults —
// we NEVER fabricate them:
//   • title / day_label / intro → null (no DB source; iOS supplies its own
//     "Simulación Doubles" title default and assembles the intro line).
//   • station_splits[].detail   → null (0055 stores share + note, not per-station
//     volume/units).
//   • station_splits[].flagged  → false (0055 has no per-station weak-spot flag;
//     see MODEL GAP below).
//   • coach_note ← tactical_note (the single one-line tactical summary).
//
// MODEL GAP (flagged): the iOS contract has a `flagged` weak-spot marker per
// station, but the coach simulation editor / 0055 schema do not author it. Until
// the coach side captures it, every station reads flagged=false — honest, never
// fabricated. Surfaced to the coach side as a follow-up.
// =============================================================================

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  DOBLES_STATIONS,
  doblesAssignedTo,
  storedToReaderCarrier,
  type DoblesAssignedTo,
  type DoblesCarrier,
  type DoblesEditorKind,
} from '@fahybrid/shared/schema/dobles-simulation';
import { z } from 'zod';

// ── Wire contract (matches iOS DoblesSimulation / DoblesStationSplit, snake_case) ──

export interface DoblesSimulationStationDTO {
  /** Stable row id for SwiftUI ForEach (e.g. "station-10"). */
  id: string;
  /** Canonical station index (2..16) — so the app edit can PUT it back. */
  station_index: number;
  /** Localized station label, e.g. "Remo" / "Wall balls". */
  station: string;
  /** The reading athlete's frame: they do it / partner does it / shared. Lets the
   *  app editor open with the right segment selected (self/partner/split). */
  carrier: DoblesCarrier;
  /** Share the READING athlete carries, 0..1 (partner = 1 − this). */
  self_share: number;
  /** Volume/units label — not stored by 0055, always null (honest). */
  detail: string | null;
  /** Explicit reparto note, e.g. "alterna 250m". From the stored split note. */
  split_note: string | null;
  /** Weak-spot marker — not authored by the coach yet, always false (honest). */
  flagged: boolean;
}

export interface DoblesSimulationDTO {
  /** No DB source — null; iOS shows its own "Simulación Doubles" default. */
  title: string | null;
  /** No DB source — null; iOS assembles the intro line itself. */
  day_label: string | null;
  intro: string | null;
  /** The reading athlete's display name (first name), null when unknown. */
  self_name: string | null;
  /** The partner's display name (first name), null when unknown. */
  partner_name: string | null;
  /** The coach's one-line tactical note (← tactical_note). */
  coach_note: string | null;
  /** The 8 stations in canonical race order, from the reader's perspective. */
  station_splits: DoblesSimulationStationDTO[];
  // Edit provenance (mig 0099) — the reparto is pair-owned, so the app shows who
  // last touched it ("Propuesta de Pablo" / "Ajustado por Guillem"). Null kind →
  // a legacy row → the app renders the coach-authored default label.
  last_edited_by_kind: DoblesEditorKind | null;
  last_edited_by_name: string | null;
  updated_at: string | null;
}

// Canonical station label per index (race order is enforced by DOBLES_STATIONS).
const STATION_LABEL = new Map<number, string>(
  DOBLES_STATIONS.map((s) => [s.station_index, s.label]),
);

// ── Stored station-split row (jsonb element) ─────────────────────────────────
// Validated defensively when read back from the DB. We accept extra keys (the
// stored shape may grow) but require the fields we map.
const storedStationSplitSchema = z.object({
  station_index: z.number().int(),
  assigned_to: doblesAssignedTo,
  self_share: z.number().min(0).max(1),
  note: z.string().nullable().optional(),
});
type StoredStationSplit = z.infer<typeof storedStationSplitSchema>;

// The raw simulation row for a pair, resolved to which side the reader is on.
// Exported so the Dobles station-split resolver (execution-facing) reuses the
// SAME pair-matching query — one source of truth for "which simulation is this
// pair's" and "is the reader A or B".
export interface DoblesSimulationRow {
  reader_is_a: boolean;
  station_splits: unknown;
  tactical_note: string | null;
  // Provenance (mig 0099), null on legacy rows.
  last_edited_by_kind: DoblesEditorKind | null;
  last_edited_by_user_id: string | null;
  updated_at: string | null;
}

export interface DoblesSimulationInput {
  sql?: Sql;
  /** The authenticated (reading) athlete's user id. */
  self_user_id: bigint;
  /** The linked partner's user id (caller resolves via users.partner_id). */
  partner_user_id: bigint;
  /** Reader's display name (first name) for the legend / accessibility. */
  self_name: string | null;
  /** Partner's display name (first name). */
  partner_name: string | null;
  /** The pair's coach first name — resolves a coach-authored provenance label. */
  coach_name?: string | null;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Resolve the joint simulation for the reading athlete's Dobles pair, flipped to
 * the reader's perspective. Returns null when the coach has authored no
 * simulation for this pair (→ route emits 404 no_simulation → iOS empty state).
 */
/**
 * Load the single authoritative simulation row for the {self, partner} pair,
 * A/B-neutral, telling the caller which side the reader is on. Returns null when
 * the coach hasn't authored a simulation for this pair. Shared by BOTH the
 * strategy read (loadDoblesSimulation) and the execution reparto resolver
 * (resolveDoblesStationSplit) so the pair-matching + orientation never diverge.
 */
export async function loadDoblesSimulationRow(
  self_user_id: bigint,
  partner_user_id: bigint,
  client: Sql = defaultSql,
): Promise<DoblesSimulationRow | null> {
  // The pair is stored A/B-neutrally; the reader may be either side. Match the
  // row in either orientation and tell us which side the reader is on. There is
  // at most one generic simulation per pair (the 0055 unique index), so a single
  // most-recent row is the authoritative strategy.
  const rows = await client<DoblesSimulationRow[]>`
    select
      (athlete_a_user_id = ${self_user_id}) as reader_is_a,
      station_splits,
      tactical_note,
      last_edited_by_kind,
      last_edited_by_user_id::text as last_edited_by_user_id,
      updated_at::text as updated_at
    from dobles_simulations
    where (
            athlete_a_user_id = ${self_user_id}
        and athlete_b_user_id = ${partner_user_id}
          )
       or (
            athlete_a_user_id = ${partner_user_id}
        and athlete_b_user_id = ${self_user_id}
          )
    order by updated_at desc
    limit 1
  `;
  return rows[0] ?? null;
}

export async function loadDoblesSimulation(
  input: DoblesSimulationInput,
): Promise<DoblesSimulationDTO | null> {
  const sql = input.sql ?? defaultSql;

  const row = await loadDoblesSimulationRow(
    input.self_user_id,
    input.partner_user_id,
    sql,
  );
  if (!row) return null;

  // Resolve the provenance display name from the reader's own frame: a coach edit
  // → the coach's name; an athlete edit → self or partner by matching user id.
  let last_edited_by_name: string | null = null;
  if (row.last_edited_by_kind === 'coach') {
    last_edited_by_name = input.coach_name ?? null;
  } else if (row.last_edited_by_kind === 'athlete' && row.last_edited_by_user_id != null) {
    const editorId = BigInt(row.last_edited_by_user_id);
    if (editorId === input.self_user_id) last_edited_by_name = input.self_name;
    else if (editorId === input.partner_user_id) last_edited_by_name = input.partner_name;
  }

  return {
    title: null,
    day_label: null,
    intro: null,
    self_name: input.self_name,
    partner_name: input.partner_name,
    coach_note: emptyToNull(row.tactical_note),
    station_splits: resolveStationSplits(row.station_splits, row.reader_is_a),
    last_edited_by_kind: row.last_edited_by_kind ?? null,
    last_edited_by_name,
    updated_at: row.updated_at ?? null,
  };
}

// =============================================================================
// Pure mapping (testable without a DB)
// =============================================================================

/**
 * One station's split resolved to the READER's perspective, keyed by station
 * index. `assigned_to` stays in the stored neutral frame ('a'|'b'|'split') —
 * pair it with the reader's role to decide who executes. `self_share` is the
 * reader's fraction (0..1), flipped for a B-reader.
 */
export interface ReaderStationSplit {
  station_index: number;
  assigned_to: DoblesAssignedTo;
  self_share: number;
  note: string | null;
}

/**
 * Resolve the A-centric stored splits to the reader's perspective, indexed by
 * station_index. The reader's share is the stored A-share when the reader is A,
 * or its complement (1 - stored) when the reader is B (the SINGLE flip helper,
 * reused by both the strategy DTO and the execution reparto so they never
 * diverge). Malformed elements are skipped. Stations absent from the stored
 * array are simply absent here — each caller applies its own missing-station
 * default.
 */
export function resolveReaderStationSplits(
  rawSplits: unknown,
  readerIsA: boolean,
): Map<number, ReaderStationSplit> {
  const byIndex = parseStoredSplits(rawSplits);
  const out = new Map<number, ReaderStationSplit>();
  for (const [index, stored] of byIndex) {
    const aShare = normalizeAShare(stored);
    out.set(index, {
      station_index: index,
      assigned_to: stored.assigned_to,
      self_share: clamp01(readerIsA ? aShare : 1 - aShare),
      note: emptyToNull(stored.note ?? null),
    });
  }
  return out;
}

/**
 * Map the A-centric stored splits to the reader's perspective, in canonical
 * race order. The reader's share is the stored A-share when the reader is A, or
 * its complement (1 - stored) when the reader is B. A station missing from the
 * stored array degrades to an even 50/50 split (mirrors the coach default) so
 * the strategy always renders all 8 stations rather than a partial list.
 */
export function resolveStationSplits(
  rawSplits: unknown,
  readerIsA: boolean,
): DoblesSimulationStationDTO[] {
  const byIndex = resolveReaderStationSplits(rawSplits, readerIsA);

  return DOBLES_STATIONS.map((station) => {
    const resolved = byIndex.get(station.station_index);
    return {
      id: `station-${station.station_index}`,
      station_index: station.station_index,
      station: STATION_LABEL.get(station.station_index) ?? station.label,
      // Reader-frame carrier so the app editor opens with the right segment; a
      // missing station degrades to an even 'split' (matches the 50/50 default).
      carrier: resolved ? storedToReaderCarrier(resolved.assigned_to, readerIsA) : 'split',
      self_share: resolved ? resolved.self_share : 0.5,
      detail: null,
      split_note: resolved?.note ?? null,
      flagged: false,
    };
  });
}

/** Parse + index the stored jsonb array; skip any malformed element. */
function parseStoredSplits(raw: unknown): Map<number, StoredStationSplit> {
  const map = new Map<number, StoredStationSplit>();
  if (!Array.isArray(raw)) return map;
  for (const el of raw) {
    const parsed = storedStationSplitSchema.safeParse(el);
    if (parsed.success) map.set(parsed.data.station_index, parsed.data);
  }
  return map;
}

/**
 * The athlete-A share that the stored row represents, made consistent with
 * `assigned_to` (mirrors the write-side normalizeStationSplit invariant so a
 * legacy/contradictory row still reads correctly): 'a' → 1, 'b' → 0,
 * 'split' → the stored share.
 */
function normalizeAShare(split: {
  assigned_to: DoblesAssignedTo;
  self_share: number;
}): number {
  if (split.assigned_to === 'a') return 1;
  if (split.assigned_to === 'b') return 0;
  return clamp01(split.self_share);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function emptyToNull(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}
