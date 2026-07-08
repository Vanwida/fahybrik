// @fahybrid/shared/domain/execution-merge — the PURE fusion policy (#36).
//
// Given the set of sources that touched ONE workout — a device skeleton, a
// screenshot→IA capture, a manual log, the athlete's own edits — decide the
// SINGLE fused result: which value wins each field, which provider owns each
// group (for honest provenance), which assignment the fused execution belongs
// to, and the roster of contributing sources.
//
// This module is CONFIG + PURE LOGIC ONLY. It reads no data, touches no db, is
// framework-free, and is the same on web (Fase 2 ingest merge) and — mirrored —
// on iOS. The wiring that BUILDS contributions from the HealthKit ingest / the
// vision confirm / the athlete edits lands in Fase 2/3; this is the brain they
// both call.

import type { BiometricSource } from '../../schema/_primitives';
import { fidelityRank, type MergeChannel, type MergeFieldClass } from './channel';

// The measured totals block. Every field independently nullable — a source may
// carry some and not others (an indoor run skeleton has duration+HR but no
// distance; a strength log has none of these).
export interface MergeTotals {
  duration_s: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  started_at: string | null;
  ended_at: string | null;
}

// The metcon/HYROX final score. One family populated per format (time XOR rounds
// [+reps]); the merge treats each field independently.
export interface MergeScore {
  time_s: number | null;
  rounds: number | null;
  reps: number | null;
}

const TOTALS_KEYS: readonly (keyof MergeTotals)[] = [
  'duration_s',
  'distance_m',
  'avg_hr',
  'max_hr',
  'calories',
  'started_at',
  'ended_at',
];
const SCORE_KEYS: readonly (keyof MergeScore)[] = ['time_s', 'rounds', 'reps'];

// One source's proposal for a single workout.
export interface SourceContribution {
  // Who produced the data — persisted for provenance/display (`biometric_source`).
  provider: BiometricSource;
  // How it was measured — the fidelity axis the merge ranks by (see channel.ts).
  channel: MergeChannel;
  // Field keys this source's HUMAN explicitly overrode (e.g. the athlete fixed a
  // mis-OCR'd duration in review). An explicit field beats every channel for
  // THAT field — the last deliberate human touch wins. Keys are MergeTotals /
  // MergeScore keys, or 'rpe'.
  explicitFields?: readonly string[];
  // The athlete opened the capture FROM a specific prescribed session and
  // attached it there. Fork D: this human intent beats a device's heuristic
  // day-pick when the two disagree on which assignment owns the fused execution.
  assignmentAttach?: boolean;
  assignmentId?: number | null;
  totals?: Partial<MergeTotals>;
  score?: Partial<MergeScore>;
  rpe?: number | null;
  // Whether this source carries per-segment detail (splits/laps/sets). The merge
  // picks WHICH source's segments win wholesale (it never interleaves two
  // sources' splits); the actual rows are upserted by the segment ingest.
  hasSegments?: boolean;
}

export interface MergedExecution {
  totals: MergeTotals;
  totals_source: BiometricSource | null;
  score: MergeScore;
  score_source: BiometricSource | null;
  // The winning per-segment source (its splits/sets are the ones to keep), or
  // null when no source carried segments.
  segments_source: BiometricSource | null;
  rpe: number | null;
  // Always the athlete's provider ('manual') when present — never a device.
  rpe_source: BiometricSource | null;
  // Every provider that supplied ≥1 value. Length ≥ 2 ⇒ a genuine FUSION.
  contributing_sources: BiometricSource[];
  // Which assignment the fused execution belongs to (Fork D resolution).
  resolved_assignment_id: number | null;
  // The sources disagreed on the assignment (e.g. a device linked to the day's
  // other session while the athlete attached the capture here). Signals the
  // caller to re-point a mis-linked execution onto `resolved_assignment_id`.
  assignment_conflict: boolean;
}

// Rank a contribution FOR a specific field: an explicit human override on that
// field trumps everything; otherwise it is the channel's fidelity for the class.
function rankForField(
  c: SourceContribution,
  cls: MergeFieldClass,
  fieldKey: string,
): number {
  if (c.explicitFields?.includes(fieldKey)) return Number.POSITIVE_INFINITY;
  return fidelityRank(cls, c.channel);
}

// The contribution that wins a single field = highest rank among those that
// actually supply a non-null value for it. Ties (same channel supplying the
// same field) break by input order → deterministic. Returns null if nobody has it.
function winnerForField<T>(
  contribs: readonly SourceContribution[],
  cls: MergeFieldClass,
  fieldKey: string,
  getValue: (c: SourceContribution) => T | null | undefined,
): SourceContribution | null {
  let best: SourceContribution | null = null;
  let bestRank = -1;
  for (const c of contribs) {
    const v = getValue(c);
    if (v === null || v === undefined) continue;
    const rank = rankForField(c, cls, fieldKey);
    if (rank < 0) continue; // channel cannot supply this class
    if (rank > bestRank) {
      best = c;
      bestRank = rank;
    }
  }
  return best;
}

// The provider that OWNS a group = the highest-FIDELITY source that supplied any
// field of the group (ignoring per-field explicit overrides, which show up in
// contributing_sources rather than relabelling the whole group). Deterministic
// tie-break by input order.
function groupSource(
  contribs: readonly SourceContribution[],
  cls: MergeFieldClass,
  supplies: (c: SourceContribution) => boolean,
): BiometricSource | null {
  let best: SourceContribution | null = null;
  let bestRank = -1;
  for (const c of contribs) {
    if (!supplies(c)) continue;
    const rank = fidelityRank(cls, c.channel);
    if (rank < 0) continue;
    if (rank > bestRank) {
      best = c;
      bestRank = rank;
    }
  }
  return best?.provider ?? null;
}

function hasAnyTotals(c: SourceContribution): boolean {
  return !!c.totals && TOTALS_KEYS.some((k) => c.totals?.[k] != null);
}
function hasAnyScore(c: SourceContribution): boolean {
  return !!c.score && SCORE_KEYS.some((k) => c.score?.[k] != null);
}
function suppliesAnything(c: SourceContribution): boolean {
  return hasAnyTotals(c) || hasAnyScore(c) || c.rpe != null || !!c.hasSegments;
}

/**
 * Fuse every source that touched a workout into ONE result with per-group
 * provenance. Pure and order-stable. Empty input → an all-null execution.
 */
export function mergeContributions(contribs: readonly SourceContribution[]): MergedExecution {
  // ---- totals: per-field fidelity winner (device replaces OCR, explicit wins) ----
  const totals = {} as MergeTotals;
  for (const key of TOTALS_KEYS) {
    const w = winnerForField(contribs, 'totals', key, (c) => c.totals?.[key]);
    (totals[key] as MergeTotals[typeof key]) = (w?.totals?.[key] ?? null) as MergeTotals[typeof key];
  }
  const totals_source = groupSource(contribs, 'totals', hasAnyTotals);

  // ---- score: same per-field pattern ----
  const score = {} as MergeScore;
  for (const key of SCORE_KEYS) {
    const w = winnerForField(contribs, 'score', key, (c) => c.score?.[key]);
    (score[key] as MergeScore[typeof key]) = (w?.score?.[key] ?? null) as MergeScore[typeof key];
  }
  const score_source = groupSource(contribs, 'score', hasAnyScore);

  // ---- segments: one source wins wholesale (never interleave splits) ----
  const segments_source = groupSource(contribs, 'segments', (c) => !!c.hasSegments);

  // ---- rpe: athlete only ----
  const rpeWinner = winnerForField(contribs, 'rpe', 'rpe', (c) => c.rpe);
  const rpe = rpeWinner?.rpe ?? null;
  const rpe_source = rpeWinner?.provider ?? null;

  // ---- contributing sources: distinct providers that supplied ≥1 value ----
  const contributing_sources: BiometricSource[] = [];
  for (const c of contribs) {
    if (suppliesAnything(c) && !contributing_sources.includes(c.provider)) {
      contributing_sources.push(c.provider);
    }
  }

  // ---- assignment resolution (Fork D: an explicit capture attach wins) ----
  const attacher = contribs.find((c) => c.assignmentAttach && c.assignmentId != null);
  const anyWithId = contribs.find((c) => c.assignmentId != null);
  const resolved_assignment_id = (attacher ?? anyWithId)?.assignmentId ?? null;
  const distinctAssignments = new Set(
    contribs.filter((c) => c.assignmentId != null).map((c) => c.assignmentId),
  );
  const assignment_conflict = distinctAssignments.size > 1;

  return {
    totals,
    totals_source,
    score,
    score_source,
    segments_source,
    rpe,
    rpe_source,
    contributing_sources,
    resolved_assignment_id,
    assignment_conflict,
  };
}
