// Per-segment running compliance for the coach (#66) — the WIRE that marries a
// run session's PRESCRIPTION to its EXECUTION, tramo by tramo, and hands each
// pair to the pure verdict engine (`@fahybrid/shared/domain/adherence`).
//
// WHAT MAPS TO WHAT
// -----------------
// A logged lap (`segment_executions` → `SegmentActual`) is attributed to the
// prescribed line it belongs to by the shared uid `segment-{template_segment_id}`
// (`item_uid`) — the same join the drawer already renders prescrito↔hecho on. In
// today's data each run tramo (warm-up, each interval rep) is its OWN
// template_segment, so the mapping is 1 item ↔ 1 lap. When a single template_segment
// instead holds a NATIVE #61 structure executed as several laps, we enumerate its
// work segments structure-first (reusing `legacyToStructure`/`flattenSegments`) and
// zip them to the laps in order.
//
// ZONE RESOLUTION (single source of truth)
// ----------------------------------------
// A run zone target ("@Z4") is judged against the SAME per-athlete pace band the
// athlete was shown: `AssignmentDetailItem.resolved_intensity`, resolved once from
// the versioned `athlete_zone_profiles` snapshot in the assignment-detail loader.
// We reuse it rather than re-resolving live, so the compliance band can never drift
// from the prescribed band in the same drawer. Explicit pace / HR / RPE targets are
// absolute and read straight off the prescription. A zone with no snapshot (athlete
// untested) → no band → 'sin_dato' (honest, never fabricated).
//
// Client-safe: pure functions + type-only imports. No I/O.

import {
  evaluateRunSegment,
  hrBandFromTarget,
  paceBandFromResolvedZone,
  paceBandFromTarget,
  rpeBandFromTarget,
  summarizeRunCompliance,
  type ComplianceBand,
  type ComplianceSample,
  type RunComplianceSummary,
  type RunComplianceVerdict,
} from '@fahybrid/shared/domain/adherence';
import {
  flattenSegments,
  legacyToStructure,
  prescriptionTarget,
  setTarget,
  type Prescription,
  type Segment,
  type Target,
} from '@fahybrid/shared/domain/prescription';
import type {
  AssignmentDetailItem,
  AssignmentDetailWorkout,
  ResolvedIntensity,
} from '@/lib/athlete/assignment-detail';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';

/** One tramo's verdict, keyed back to the drawer's rows. */
export interface RunComplianceTramo {
  /** The prescribed item this tramo belongs to (`segment-{id}`). */
  item_uid: string;
  /** Position of the executed lap this verdict grades; null = a prescribed run
   *  tramo with no execution (counts as 'sin_dato'). */
  position: number | null;
  verdict: RunComplianceVerdict;
}

export interface RunComplianceResult {
  summary: RunComplianceSummary;
  tramos: RunComplianceTramo[];
}

// The representative intensity target for a line: block-level, else the first
// per-set target. Mirrors assignment-detail's `lineTarget` / `prescriptionToParams`
// precedence so the band we judge matches the scalar the item already exposes.
function representativeTarget(p: Prescription | null): Target | undefined {
  if (!p) return undefined;
  const block = prescriptionTarget(p);
  if (block) return block;
  for (const s of p.sets ?? []) {
    const t = setTarget(s);
    if (t) return t;
  }
  return undefined;
}

// Executed sample from a logged lap. Pace prefers the device value, else derives
// s/km from distance + duration (the same COALESCE the running analytics use), so
// a lap that recorded distance+time but no pace is still evaluable.
function sampleFromActual(a: SegmentActual): ComplianceSample {
  let pace = a.avg_pace_s_per_km;
  if (
    (pace == null || !Number.isFinite(pace)) &&
    a.distance_meters != null &&
    a.distance_meters > 0 &&
    a.duration_seconds != null &&
    a.duration_seconds > 0
  ) {
    pace = a.duration_seconds / (a.distance_meters / 1000);
  }
  // No per-segment RPE column exists (session-level only) → rpe is never sampled here.
  return { pace_s: pace ?? null, hr_bpm: a.avg_hr ?? null, rpe: null };
}

// A resolved zone band → a pace comparison band. Only per_km (running) feeds run
// compliance; row/ski/bike resolve to per_500m and aren't run tramos.
function bandFromResolvedIntensity(ri: ResolvedIntensity | null): ComplianceBand | null {
  if (!ri || ri.pace_unit !== 'per_km') return null;
  return paceBandFromResolvedZone(ri.fast_s, ri.slow_s);
}

// An explicit (already-absolute) target → a comparison band. A zone target with no
// resolved snapshot returns null → 'sin_dato'.
function bandFromTarget(t: Target | undefined): ComplianceBand | null {
  if (!t) return null;
  switch (t.kind) {
    case 'pace':
      return t.unit === 'per_km' ? paceBandFromTarget(t) : null; // run compliance is per km
    case 'hr_bpm':
      return hrBandFromTarget(t);
    case 'rpe':
      return rpeBandFromTarget(t);
    default:
      // hr_zone / pace_zone without a snapshot, %RM / kg / … → not a run band.
      return null;
  }
}

// The band for the ITEM as a whole (its representative tramo): the resolved zone
// band (the same band the athlete saw) wins; else the explicit target.
function itemBand(item: AssignmentDetailItem): ComplianceBand | null {
  return (
    bandFromResolvedIntensity(item.resolved_intensity) ??
    bandFromTarget(representativeTarget(item.prescription_json))
  );
}

// The band for one flattened structure WORK segment (native multi-rep block): an
// explicit pace/RPE target resolves standalone; a zone segment falls back to the
// item's resolved snapshot band, pending native per-segment resolution once
// structured execution lands.
function segmentBand(seg: Segment, item: AssignmentDetailItem): ComplianceBand | null {
  const t = seg.target;
  if (!t) return null;
  if (t.type === 'pace') return paceBandFromTarget(t);
  if (t.type === 'rpe') return rpeBandFromTarget(t);
  return bandFromResolvedIntensity(item.resolved_intensity); // pace_zone / hr_zone
}

// Prescribed WORK segments of an item, structure-first (native `structure`, else
// `legacyToStructure`). Empty when the item isn't a run steady/intervals form.
function workSegmentsOf(p: Prescription | null): Segment[] {
  if (!p) return [];
  const structure = p.structure && p.structure.length > 0 ? p.structure : legacyToStructure(p);
  if (!structure) return [];
  return flattenSegments(structure).filter((seg) => seg.kind === 'work');
}

// A tramo is part of RUN compliance when the prescription is a run (intent), or —
// for legacy lines with no prescription modality — when its logged laps are runs.
function isRunItem(item: AssignmentDetailItem, actuals: SegmentActual[]): boolean {
  const m = item.prescription_json?.modality;
  if (m) return m === 'run';
  return actuals.some((a) => a.modality === 'run');
}

/**
 * Build the per-tramo running-compliance verdicts + session aggregate for a coach
 * session detail. Pure: give it the assembled workout blocks + the logged actuals
 * and it returns verdicts keyed by (item, lap) plus the % of evaluable tramos in
 * band. Non-run tramos are ignored; a prescribed run tramo with no execution is a
 * 'sin_dato' (counted, never in-band).
 */
export function buildRunCompliance(
  workout: AssignmentDetailWorkout | null,
  actuals: readonly SegmentActual[],
): RunComplianceResult {
  const byItem = new Map<string, SegmentActual[]>();
  for (const a of actuals) {
    if (!a.item_uid) continue;
    const list = byItem.get(a.item_uid) ?? [];
    list.push(a);
    byItem.set(a.item_uid, list);
  }
  for (const list of byItem.values()) list.sort((x, y) => x.position - y.position);

  const tramos: RunComplianceTramo[] = [];
  const verdicts: RunComplianceVerdict[] = [];
  const push = (item_uid: string, position: number | null, verdict: RunComplianceVerdict) => {
    tramos.push({ item_uid, position, verdict });
    verdicts.push(verdict);
  };

  for (const block of workout?.blocks ?? []) {
    for (const item of block.items) {
      const itemActuals = byItem.get(item.uid) ?? [];
      if (!isRunItem(item, itemActuals)) continue;

      if (itemActuals.length === 0) {
        push(item.uid, null, 'sin_dato'); // prescribed run tramo, not executed
        continue;
      }

      // Native multi-rep block executed as several laps → align work segments to
      // laps in order. Reduces to the single-tramo path when there is one lap.
      const work = itemActuals.length > 1 ? workSegmentsOf(item.prescription_json) : [];
      if (work.length > 1 && work.length === itemActuals.length) {
        work.forEach((seg, i) => {
          const a = itemActuals[i]!;
          push(item.uid, a.position, evaluateRunSegment(segmentBand(seg, item), sampleFromActual(a)));
        });
      } else {
        // One lap, or a lap count that doesn't align to the structure → judge each
        // lap against the item's representative band (uniform set / honest fallback).
        const band = itemBand(item);
        for (const a of itemActuals) {
          push(item.uid, a.position, evaluateRunSegment(band, sampleFromActual(a)));
        }
      }
    }
  }

  return { summary: summarizeRunCompliance(verdicts), tramos };
}
