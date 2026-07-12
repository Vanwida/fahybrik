// Legacy ⇄ RunStructure conversion (#61).
//
// TWO DIRECTIONS, TWO CONSUMERS:
//
//   legacyToStructure(p)  — SEED the coach editor from an OLD run block that has
//     no `structure` yet (a steady/intervals prescription authored before #61, or
//     imported from the Excel #28). Runs ONCE when the block is first opened; from
//     then on the block carries a real `structure` and is edited directly. Returns
//     null when the prescription is not a run steady/intervals, or is too under-
//     specified to become a VALID structure (e.g. an interval with rounds+rest but
//     no work measure) — the editor then keeps the legacy simple form (no data is
//     lost; `structure` is simply not offered).
//
//   structureToLegacy(structure) — FLATTEN a structured run back onto the legacy
//     scalar fields (scheme/rounds/work_s/rest_s/sets/total_s/target) so the
//     ALREADY-INSTALLED iOS app (which decodes only the legacy shape) keeps showing
//     a sensible workout. Best-effort per the closed spec: a NESTED series → total
//     rounds + the first work; a heterogeneous (progresivo/pirámide) body → the
//     first work + its target; a zone → the single legacy `hr_zone` channel (which
//     the athlete resolver renders as a pace band for a run). The RICH detail lives
//     in `structure`; this is the compatibility summary.
//
// ZONE SEMANTICS: on a RUN the athlete zone resolver renders a zone as a PACE band,
// and coaches author run "Z2" as a pace/effort zone — so legacyToStructure maps a
// legacy run `hr_zone` target to a `pace_zone` (see DEVIATION note in the resolver
// discussion). structureToLegacy maps BOTH pace_zone and hr_zone back to the single
// legacy `hr_zone` channel so the old app + resolver behave exactly as before.

import type { Measure, Prescription, PrescriptionSet, Target } from './types';
import { prescriptionTarget, setMeasure, setTarget } from './types';
import {
  type Element,
  type RunStructure,
  type Segment,
  type SegmentMeasure,
  type SegmentTarget,
  flattenSegments,
  isRepeat,
  safeParseRunStructure,
} from './run-structure';

const MAX_REPEAT_TIMES = 20; // mirror the schema bound; over this we can't fold into a Repeat

// ── legacy Target → SegmentTarget ────────────────────────────────────────────
// A three-way result so the caller can distinguish "no target" (fine) from "had a
// target we can't represent as a run objetivo" (bail — never silently drop it).
type TargetConv = { ok: true; target: SegmentTarget | null } | { ok: false };

function clampZone(z: number): number | null {
  const n = Math.round(z);
  return n >= 1 && n <= 5 ? n : null;
}

function legacyTargetToSegment(t: Target | undefined): TargetConv {
  if (!t) return { ok: true, target: null };
  switch (t.kind) {
    case 'pace': {
      // Structure pace is per km (running). A non-km unit can't be faithfully
      // re-expressed here → bail so we never mislabel the pace.
      if (t.unit !== 'per_km') return { ok: false };
      const out: SegmentTarget = { type: 'pace' };
      if (t.value_s !== undefined) out.value_s = Math.round(t.value_s);
      if (t.min_s !== undefined) out.min_s = Math.round(t.min_s);
      if (t.max_s !== undefined) out.max_s = Math.round(t.max_s);
      if (out.value_s === undefined && out.min_s === undefined && out.max_s === undefined) return { ok: false };
      return { ok: true, target: out };
    }
    case 'hr_zone': {
      const z = t.value ?? t.min ?? t.max;
      if (z === undefined) return { ok: false };
      const zone = clampZone(z);
      // Run zone → pace zone (the resolver renders run zones as pace).
      return zone ? { ok: true, target: { type: 'pace_zone', zone } } : { ok: false };
    }
    case 'rpe': {
      const out: SegmentTarget = { type: 'rpe' };
      if (t.value !== undefined) out.value = t.value;
      if (t.min !== undefined) out.min = t.min;
      if (t.max !== undefined) out.max = t.max;
      if (out.value === undefined && out.min === undefined && out.max === undefined) return { ok: false };
      return { ok: true, target: out };
    }
    default:
      // percent_rm / kg / rir / bodyweight / hr_bpm / calories / watts are not run
      // objetivos. Present-but-unconvertible → bail (keep the legacy form intact).
      return { ok: false };
  }
}

// ── legacy Measure → SegmentMeasure ──────────────────────────────────────────
function legacyMeasureToSegment(m: Measure | undefined): SegmentMeasure | null {
  if (!m) return null;
  if (m.kind === 'distance') {
    const meters = Math.round(m.meters);
    return meters > 0 ? { type: 'distance', m: meters } : null;
  }
  if (m.kind === 'duration') {
    const s = Math.round(m.seconds);
    return s > 0 ? { type: 'duration', s } : null;
  }
  return null; // reps / calories are not run segment measures
}

// The block-level work measure for a scheme-driven (no explicit sets) run.
function blockMeasure(p: Prescription): Measure | undefined {
  if (p.total_s !== undefined) return { kind: 'duration', seconds: p.total_s }; // steady
  if (p.work_s !== undefined) return { kind: 'duration', seconds: p.work_s }; // intervals
  return undefined;
}

// Fold consecutive IDENTICAL bouts (a work + optional recovery) into a Repeat, so
// "6×1000 rec 60″" reloads as one "Repetir ×6" instead of six separate rows.
// Heterogeneous bodies (pirámide, alternancia) stay flat — losslessly. Compares
// bouts by canonical JSON (we construct segment keys in a stable order).
function foldBouts(bouts: Element[][]): Element[] {
  const out: Element[] = [];
  let i = 0;
  while (i < bouts.length) {
    const cur = bouts[i]!;
    const sig = JSON.stringify(cur);
    let j = i + 1;
    while (j < bouts.length && JSON.stringify(bouts[j]) === sig) j++;
    const count = j - i;
    if (count >= 2 && count <= MAX_REPEAT_TIMES) {
      out.push({ times: count, elements: cur });
    } else {
      // count === 1, or a run longer than a Repeat can hold → emit flat.
      for (let k = i; k < j; k++) out.push(...bouts[k]!);
    }
    i = j;
  }
  return out;
}

function recoveryFromRestSeconds(rest_s: number): Segment {
  return { kind: 'recovery', measure: { type: 'duration', s: Math.round(rest_s) }, target: null, recovery_mode: 'parado' };
}

// One "bout" (a work + its optional recovery) from a legacy set. Rest is the set's
// own rest_s, else the `fallbackRest` (block-level rest, for the representative
// single-set convention). Returns null when the set can't be represented.
function boutFromSet(
  s: PrescriptionSet,
  blockTarget: SegmentTarget | null,
  fallbackRest: number | undefined,
): Element[] | null {
  if (s.note) return null; // a per-set note can't be represented → keep legacy form
  if (s.modality && s.modality !== 'run') return null; // mixed-modality block, not a pure run
  const measure = legacyMeasureToSegment(setMeasure(s));
  if (!measure) return null; // a set with no measure → cannot be a valid work segment
  const setT = legacyTargetToSegment(setTarget(s));
  if (!setT.ok) return null;
  const bout: Element[] = [{ kind: 'work', measure, target: setT.target ?? blockTarget }];
  const rest = s.rest_s ?? fallbackRest;
  if (rest !== undefined && rest > 0) bout.push(recoveryFromRestSeconds(rest));
  return bout;
}

// Build the ordered elements of the `main` phase, or null if not representable.
function buildMainElements(p: Prescription): Element[] | null {
  const blockT = legacyTargetToSegment(prescriptionTarget(p));
  if (!blockT.ok) return null;
  const blockTarget = blockT.target;

  // Path A — explicit per-set sequence (pyramids, alternancia, uniform series).
  if (p.sets && p.sets.length > 0) {
    // Convention: ONE representative set + `rounds` N = N identical bouts (how the
    // editor stores a uniform DISTANCE series; rest lives at block level).
    if (p.sets.length === 1 && (p.rounds ?? 1) > 1) {
      const times = p.rounds!;
      if (times > MAX_REPEAT_TIMES) return null;
      const bout = boutFromSet(p.sets[0]!, blockTarget, p.rest_s);
      if (!bout) return null;
      return times >= 2 ? [{ times, elements: bout }] : bout;
    }
    const bouts: Element[][] = [];
    for (const s of p.sets) {
      const bout = boutFromSet(s, blockTarget, undefined);
      if (!bout) return null;
      bouts.push(bout);
    }
    return foldBouts(bouts);
  }

  // Path B — scheme-driven (no explicit sets).
  const measure = legacyMeasureToSegment(blockMeasure(p));
  if (p.scheme === 'steady') {
    if (!measure) return null;
    return [{ kind: 'work', measure, target: blockTarget }];
  }
  if (p.scheme === 'intervals') {
    if (!measure) return null; // rounds+rest without a work measure → underspecified legacy
    const times = p.rounds ?? 1;
    if (times > MAX_REPEAT_TIMES) return null; // can't fold into a single Repeat
    const bout: Element[] = [{ kind: 'work', measure, target: blockTarget }];
    if (p.rest_s !== undefined && p.rest_s > 0) bout.push(recoveryFromRestSeconds(p.rest_s));
    return times >= 2 ? [{ times, elements: bout }] : bout;
  }
  return null;
}

/**
 * Seed a RunStructure from a legacy run steady/intervals prescription. Returns the
 * existing `structure` if already present; null when the block is not a run
 * steady/intervals or is too underspecified to become a VALID structure.
 */
export function legacyToStructure(p: Prescription): RunStructure | null {
  if (p.structure && p.structure.length > 0) return p.structure;
  if (p.scheme !== 'steady' && p.scheme !== 'intervals') return null;
  const elements = buildMainElements(p);
  if (!elements || elements.length === 0) return null;
  const structure: RunStructure = [{ role: 'main', elements }];
  const parsed = safeParseRunStructure(structure);
  return parsed.success ? parsed.data : null;
}

// ── SegmentTarget → legacy Target (the flatten target) ───────────────────────
function segmentTargetToLegacy(t: SegmentTarget | null): Target | undefined {
  if (!t) return undefined;
  switch (t.type) {
    case 'pace': {
      const out: Target = { kind: 'pace', unit: 'per_km' };
      if (t.value_s !== undefined) out.value_s = t.value_s;
      if (t.min_s !== undefined) out.min_s = t.min_s;
      if (t.max_s !== undefined) out.max_s = t.max_s;
      return out;
    }
    // Both zone kinds collapse to the single legacy zone channel — on a run the
    // athlete resolver turns it into a pace band, which is what a pace_zone wants.
    case 'pace_zone':
    case 'hr_zone':
      return { kind: 'hr_zone', value: t.zone };
    case 'rpe': {
      const out: Target = { kind: 'rpe' };
      if (t.value !== undefined) out.value = t.value;
      if (t.min !== undefined) out.min = t.min;
      if (t.max !== undefined) out.max = t.max;
      return out;
    }
  }
}

// Put the first work's measure onto the right legacy field for the flatten scheme.
// `restS` (intervals only) is attached to the representative distance SET so the
// scalar summary (prescriptionToParams, which reads per-set rest for a set-bearing
// block) surfaces the rest for the installed iOS app.
function applyFlattenMeasure(
  out: Partial<Prescription>,
  m: SegmentMeasure,
  scheme: 'steady' | 'intervals',
  restS?: number,
): void {
  if (m.type === 'duration') {
    if (scheme === 'steady') out.total_s = m.s;
    else out.work_s = m.s;
  } else {
    // distance has no native scheme field — carry it on a single representative
    // set, exactly as the steady/intervals forms already store distance work.
    out.sets = [{ measure: { kind: 'distance', meters: m.m }, ...(restS !== undefined ? { rest_s: restS } : {}) }];
  }
}

/**
 * Flatten a RunStructure onto the legacy scalar Prescription fields, so the
 * installed iOS app keeps decoding. Best-effort:
 *   · single work → scheme 'steady' (+ total_s | representative distance set)
 *   · multiple works → scheme 'intervals' (rounds = total work bouts, first work's
 *     measure on work_s|set, first duration recovery → rest_s)
 *   · target = the FIRST work's target (zone → legacy hr_zone channel)
 * Returns only the fields it can fill; the caller keeps `modality`/`note` and adds
 * `structure`.
 */
export function structureToLegacy(structure: RunStructure): Partial<Prescription> {
  const flat = flattenSegments(structure);
  const works = flat.filter((seg) => seg.kind === 'work');
  const firstWork = works[0];
  if (!firstWork) return { scheme: 'steady' }; // degenerate (a valid structure always has a work)

  const out: Partial<Prescription> = {};
  const target = segmentTargetToLegacy(firstWork.target);

  if (works.length > 1) {
    out.scheme = 'intervals';
    out.rounds = works.length; // nested/heterogeneous → TOTAL work bouts
    const firstRest = flat.find((seg) => seg.kind === 'recovery' && seg.measure.type === 'duration');
    const restS = firstRest && firstRest.measure.type === 'duration' ? firstRest.measure.s : undefined;
    applyFlattenMeasure(out, firstWork.measure, 'intervals', restS);
    if (restS !== undefined) out.rest_s = restS;
    if (target) out.target = target;
  } else {
    out.scheme = 'steady';
    applyFlattenMeasure(out, firstWork.measure, 'steady');
    if (target) out.target = target;
  }
  return out;
}

/**
 * Compose the full prescription a structured run block persists: the best-effort
 * legacy flatten (for old iOS) + the rich `structure` + modality/note. This is the
 * single writer the editor/serializer uses so the two views never drift.
 */
export function prescriptionFromStructure(
  structure: RunStructure,
  extras?: { note?: string },
): Prescription {
  const legacy = structureToLegacy(structure);
  const p: Prescription = {
    scheme: legacy.scheme ?? 'steady',
    modality: 'run',
    ...legacy,
    structure,
  };
  if (extras?.note) p.note = extras.note;
  return p;
}

// Re-export for callers that only import the convert module.
export { isRepeat };
