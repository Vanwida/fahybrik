// Deterministic linkage: screenshot-detected segments → prescribed template_segments.
//
// The capture flow (photo of a PM5/Garmin/Strava summary → LLM proposes segments)
// must attach each detected segment to the PRESCRIBED block it belongs to
// (`template_segment_id`), so the confirmed execution inherits its exercise +
// prescription context (migration 0120) instead of degrading to 'session'.
//
// We do NOT trust the LLM's self-reported mapping, and we do NOT link by blind
// position (a screenshot's lap numbering ≠ the prescription's item order). We
// match on three honest, auditable signals:
//   1. MODALITY — a detected split only ever links to a prescribed item of the
//      same discipline (a run split never claims a row block).
//   2. RELATIVE ORDER within a modality — with equal counts, the k-th detected
//      split of a modality maps to the k-th prescribed item of that modality.
//   3. EXPECTED MEASURE with tolerance — the prescription's distance/duration vs
//      the detected one refines the pairing (reorders when the app lists laps
//      out of prescribed order) and vetoes gross mismatches.
//
// HONESTY IS THE RULE: no clear match → null. A wrong link poisons analytics
// worse than a missing one, so granularity mismatches (8 detected laps vs 1
// prescribed run) and out-of-tolerance pairs resolve to null, never a guess.
//
// PURE + DB-FREE by design: it takes plain data (no prescription_json blobs, no
// `server-only`), so it is unit-tested without a database.

import type { Modality } from '@fahybrid/shared/domain/prescription';

// The unit of work a prescribed line measures. Mirrors `PrescribedMeasure` in
// workout-vision-context (kept as a local literal union so this module stays a
// pure, server-free leaf that tests can import directly).
export type MatchMeasure = 'reps' | 'distance' | 'time' | 'cals';

// One prescribed block, distilled to what linkage needs. `measure_value` is the
// prescribed magnitude in the measure's native unit (meters | seconds | reps |
// kcal). The array order IS the prescription order (relative-order signal).
export interface PrescribedSegmentForMatch {
  template_segment_id: number;
  modality: Modality | null;
  measure_kind: MatchMeasure | null;
  measure_value: number | null;
}

// One screenshot-detected split, distilled to what linkage needs. The array
// order IS the detection order (relative-order signal). Only measures that a
// cardio summary actually exposes are comparable to a prescription.
export interface DetectedSegmentForMatch {
  modality: Modality;
  distance_meters: number | null;
  duration_seconds: number | null;
  calories: number | null;
}

export interface MatchOptions {
  /**
   * Max |detected − prescribed| / prescribed accepted as "the same work".
   * Generous on purpose: it must forgive honest under/over-performance (a 5 km
   * run finished at 4.2 km is the same segment) while still rejecting a
   * cross-magnitude misattribution (a 500 m piece paired to a 1000 m block).
   */
  toleranceRatio?: number;
}

// ±60%: forgives under/over-performance, rejects order-of-2 magnitude swaps.
const DEFAULT_TOLERANCE_RATIO = 0.6;

/**
 * Relative error between a detected segment and a prescribed one on their
 * shared measure axis, or null when they share no comparable measure (or the
 * prescribed magnitude is missing/zero). 'reps' prescriptions have no cardio
 * counterpart in a detected split → null (fall back to order).
 */
function measureRelError(det: DetectedSegmentForMatch, presc: PrescribedSegmentForMatch): number | null {
  if (presc.measure_kind == null || presc.measure_value == null || presc.measure_value <= 0) return null;
  let detected: number | null;
  switch (presc.measure_kind) {
    case 'distance':
      detected = det.distance_meters;
      break;
    case 'time':
      detected = det.duration_seconds;
      break;
    case 'cals':
      detected = det.calories;
      break;
    case 'reps':
    default:
      return null; // reps aren't measured on a cardio split
  }
  if (detected == null) return null;
  return Math.abs(detected - presc.measure_value) / presc.measure_value;
}

/**
 * Best measure-based bijection for an equal-count modality group: assign each
 * detected split to a distinct prescribed item, greedily taking the globally
 * closest in-tolerance pair first. Returns a full local pairing
 * (detectedLocalIndex → prescribedLocalIndex) ONLY when every detected split
 * lands on a distinct in-tolerance prescription; otherwise null so the caller
 * falls back to relative order. Deterministic (stable sort by error then index).
 */
function measureBijection(
  det: DetectedSegmentForMatch[],
  presc: PrescribedSegmentForMatch[],
  tol: number,
): number[] | null {
  const n = det.length; // caller guarantees det.length === presc.length
  type Cand = { i: number; j: number; err: number };
  const cands: Cand[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const err = measureRelError(det[i]!, presc[j]!);
      if (err == null) return null; // any incomparable pair → measure can't decide
      cands.push({ i, j, err });
    }
  }
  cands.sort((a, b) => a.err - b.err || a.i - b.i || a.j - b.j);

  const pairing = new Array<number>(n).fill(-1);
  const detUsed = new Array<boolean>(n).fill(false);
  const prescUsed = new Array<boolean>(n).fill(false);
  let assigned = 0;
  for (const c of cands) {
    if (c.err > tol) break; // sorted ascending → nothing left can qualify
    if (detUsed[c.i] || prescUsed[c.j]) continue;
    pairing[c.i] = c.j;
    detUsed[c.i] = true;
    prescUsed[c.j] = true;
    assigned += 1;
  }
  return assigned === n ? pairing : null;
}

/**
 * Link each detected segment to a prescribed template_segment_id, or null.
 *
 * @param detected   detected splits, in detection order.
 * @param prescribed prescribed blocks, in prescription order.
 * @returns one entry per detected segment (aligned by index): the matched
 *          template_segment_id, or null when no honest match exists.
 */
export function matchVisionSegments(
  detected: DetectedSegmentForMatch[],
  prescribed: PrescribedSegmentForMatch[],
  opts?: MatchOptions,
): (number | null)[] {
  const tol = opts?.toleranceRatio ?? DEFAULT_TOLERANCE_RATIO;
  const result: (number | null)[] = detected.map(() => null);

  // Prescribed items grouped by modality, prescription order preserved. Items
  // with no modality can't anchor a match (nothing to compare a discipline to).
  const prescByMod = new Map<Modality, PrescribedSegmentForMatch[]>();
  for (const p of prescribed) {
    if (p.modality == null) continue;
    const arr = prescByMod.get(p.modality);
    if (arr) arr.push(p);
    else prescByMod.set(p.modality, [p]);
  }

  // Detected split indices grouped by modality, detection order preserved.
  const detByMod = new Map<Modality, number[]>();
  for (let i = 0; i < detected.length; i++) {
    const m = detected[i]!.modality;
    const arr = detByMod.get(m);
    if (arr) arr.push(i);
    else detByMod.set(m, [i]);
  }

  for (const [mod, detIdxs] of detByMod) {
    const P = prescByMod.get(mod) ?? [];
    // No prescribed item of this modality, or a granularity mismatch (e.g. 8
    // detected laps vs 1 prescribed run) → every split stays null (honest).
    if (P.length === 0 || detIdxs.length !== P.length) continue;

    const detSegs = detIdxs.map((i) => detected[i]!);
    // Prefer a clean measure-based bijection (handles apps that list laps out
    // of prescribed order); fall back to relative order when measures can't
    // decide, then veto any order pair whose measure is grossly off.
    const byMeasure = measureBijection(detSegs, P, tol);
    for (let k = 0; k < detIdxs.length; k++) {
      const prescLocal = byMeasure ? byMeasure[k]! : k;
      const item = P[prescLocal]!;
      const err = byMeasure ? 0 : measureRelError(detSegs[k]!, item);
      // byMeasure pairs are in-tolerance by construction. For the order
      // fallback, accept when measures are incomparable (err null) or within
      // tolerance; reject an out-of-tolerance order pair → null.
      if (err == null || err <= tol) {
        result[detIdxs[k]!] = item.template_segment_id;
      }
    }
  }

  return result;
}
