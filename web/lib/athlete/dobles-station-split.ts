import 'server-only';

// =============================================================================
// Dobles HYROX station split (reparto) — DERIVED at read for the workout engine
//
// Powers the `station_assignment` field on GET /api/athlete/assignments/[id]/
// detail. For a HYROX Doubles pair running a HYROX-simulation session, this
// resolves HOW the 8 functional stations are split between the two athletes and
// maps each station onto the SESSION's own template_segment so the iOS workout
// engine can execute exactly the reading athlete's half.
//
// SINGLE SOURCE OF TRUTH = dobles_simulations (coach-authored, migration 0055).
// The reparto is DERIVED here at read; it is NEVER stored on
// workout_assignments.station_assignment (that column is legacy / no-writer —
// see migration 0091 + shared/schema/workouts.ts). Deriving means the athlete's
// executed reparto always tracks the coach's current strategy with no write-path
// drift.
//
// GATING — returns null (→ the endpoint emits station_assignment: null, iOS runs
// the full session) UNLESS ALL hold:
//   1. the session's template format is 'hyrox_sim';
//   2. the reading athlete has a linked Dobles partner (users.partner_id, via the
//      same loadPartner used by the other /api/athlete/dobles/* endpoints);
//   3. a dobles_simulations row exists for the {self, partner} pair.
//
// READER PERSPECTIVE — storage is A-centric (self_share = athlete A's share);
// this flips it to the reading athlete exactly as loadDoblesSimulation does
// (reader-is-A → stored; reader-is-B → 1 − stored). `assigned_to` stays in the
// stored neutral frame ('a'|'b'|'split'); `my_role` tells iOS which side the
// reader is, so the pair (my_role, assigned_to, self_share) is unambiguous.
//
// STATION ↔ SEGMENT — each canonical station_index (2,4,…,16) is mapped to the
// session line that IS that station by matching template_segments.exercise
// slug/name against the canonical STATION_CATALOGUE (slug + aliases + label,
// case-insensitive). A station whose segment is NOT in this session is OMITTED
// (honest: iOS has no line to attribute, so it runs that station in full) rather
// than fabricated.
// =============================================================================

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadPartner } from '@/lib/partner/invitations';
import { STATION_CATALOGUE, type StationEntry } from '@/lib/athlete/station-detail';
import {
  loadDoblesSimulationRow,
  resolveReaderStationSplits,
} from '@/lib/athlete/dobles-simulation';
import type { DoblesAssignedTo } from '@fahybrid/shared/schema/dobles-simulation';

// The template format that carries a Dobles reparto. Only a HYROX simulation is
// run station-by-station as a pair; every other format has no per-station split.
const HYROX_SIM_FORMAT = 'hyrox_sim';

// ── Wire shape (snake_case; becomes assignment.station_assignment on the detail
//    payload — see shared/schema/workouts.ts stationAssignmentSchema) ──────────

export interface DoblesStationSplitEntry {
  /** template_segments.id of the session line that IS this station. */
  template_segment_id: number;
  /** Canonical HYROX station index (2,4,…,16). */
  station_index: number;
  /**
   * Canonical station label ("SkiErg 1km"). Emitted as BOTH `name` (back-compat
   * with the current iOS StationAssignmentEntry.name) and `label` (canonical).
   */
  name: string;
  label: string;
  /** Stored neutral frame: 'a'/'b' = that athlete carries it; 'split' = shared. */
  assigned_to: DoblesAssignedTo;
  /** The READING athlete's share of this station, 0..1 (partner = 1 − this). */
  self_share: number;
  /** Coach's reparto note for this station ("alterna 250m"), or null. */
  note: string | null;
}

export interface DoblesStationSplit {
  /** Which side of the pair the reading user is (== dobles_simulations A/B). */
  my_role: 'a' | 'b';
  /** Partner's first name for the live relay line ("{name} hace SkiErg"). */
  partner_first_name: string | null;
  /** Only the stations whose segment is present in THIS session (honest). */
  stations: DoblesStationSplitEntry[];
}

export interface ResolveDoblesStationSplitInput {
  sql?: Sql;
  /** The authenticated (reading) athlete's user id — used to resolve the pair. */
  self_user_id: bigint;
  /**
   * The reading athlete's id. Reserved for signature symmetry with the other
   * dobles resolvers (loadDoblesSession); the pair is resolved via user_id to
   * match the dobles simulation surface (which keys on athlete_*_user_id).
   */
  self_athlete_id: bigint;
  assignment: {
    /** The session template format — a reparto applies ONLY to 'hyrox_sim'. */
    template_format: string | null;
    /**
     * The session's partner visibility ('shared' | 'self_only'). A `self_only`
     * session is an INDIVIDUAL session inside a dobles plan — the athlete does the
     * full station alone, so it has NO reparto (no partner relays). Guarding on it
     * keeps honesty independent of whether a self_only session happens to lack an
     * authored simulation. Null/undefined → treated as shareable (the common case).
     */
    partner_visibility?: string | null;
    /** This session's resolved segments (id + exercise slug/name) to map onto. */
    segments: ReadonlyArray<{
      id: number;
      exercise_slug: string;
      exercise_name: string;
    }>;
  };
}

/** Normalize an exercise slug/name for tolerant matching (mirrors resolveStation). */
function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Does this session segment represent the given HYROX station? Matches the
 * segment's DB slug against the catalogue slug (the strong, canonical match),
 * then its name/slug against the catalogue label + aliases (case-insensitive)
 * as a tolerant fallback for label-form seeds. Runs never match (they aren't in
 * STATION_CATALOGUE), so they're excluded automatically.
 */
function segmentMatchesStation(
  seg: { exercise_slug: string; exercise_name: string },
  entry: StationEntry,
): boolean {
  const slug = normalize(seg.exercise_slug);
  if (slug === normalize(entry.slug)) return true;
  const name = normalize(seg.exercise_name);
  if (name === entry.label.toLowerCase()) return true;
  // Catalogue aliases are already lowercased, whitespace-collapsed label forms.
  if (entry.aliases.includes(name)) return true;
  if (entry.aliases.includes(slug)) return true;
  return false;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Resolve the Dobles station split (reparto) for the reading athlete's session,
 * from the coach's dobles_simulations strategy. Returns null when the gating
 * conditions aren't ALL met (individual athlete, non-simulation session, or no
 * authored simulation) — the caller then emits station_assignment: null.
 */
export async function resolveDoblesStationSplit(
  input: ResolveDoblesStationSplitInput,
): Promise<DoblesStationSplit | null> {
  const sql = input.sql ?? defaultSql;
  const { template_format, partner_visibility, segments } = input.assignment;

  // Gate 0 — visibility. A self_only session is INDIVIDUAL (the athlete does the
  // full station alone): no reparto, regardless of any authored simulation.
  if (partner_visibility?.toLowerCase() === 'self_only') return null;

  // Gate 1 — format. Cheap, no DB: skip everything for the individual majority.
  if (template_format !== HYROX_SIM_FORMAT) return null;

  // Gate 2 — a linked Dobles partner (same resolver the other dobles endpoints
  // use). No partner → no reparto.
  const partner = await loadPartner(input.self_user_id, sql);
  if (!partner) return null;

  // Gate 3 — an authored simulation for this pair (A/B-neutral match).
  const row = await loadDoblesSimulationRow(
    input.self_user_id,
    partner.user_id,
    sql,
  );
  if (!row) return null;

  // Resolve the stored A-centric splits to the reader's perspective, indexed by
  // station_index. Reused from the strategy surface so the flip never diverges.
  const readerSplits = resolveReaderStationSplits(
    row.station_splits,
    row.reader_is_a,
  );

  // Map each canonical station to the session line that IS it. Only stations
  // whose segment appears in THIS session are emitted (unmapped → iOS runs full).
  const stations: DoblesStationSplitEntry[] = [];
  for (const entry of STATION_CATALOGUE) {
    const seg = segments.find((s) => segmentMatchesStation(s, entry));
    if (!seg) continue;

    const resolved = readerSplits.get(entry.index);
    // A simulation always stores all 8 stations (Zod-enforced on write); a
    // defensively-missing one degrades to an even 50/50 split, mirroring the
    // coach default — never fabricated beyond that neutral baseline.
    const assigned_to: DoblesAssignedTo = resolved?.assigned_to ?? 'split';
    const self_share = resolved ? resolved.self_share : 0.5;
    const note = resolved?.note ?? null;

    stations.push({
      template_segment_id: seg.id,
      station_index: entry.index,
      name: entry.label,
      label: entry.label,
      assigned_to,
      self_share,
      note,
    });
  }

  return {
    my_role: row.reader_is_a ? 'a' : 'b',
    partner_first_name: partner.full_name?.trim().split(/\s+/)[0] ?? null,
    stations,
  };
}
