// Run-structure VIEW math (editor redesign): the sentence each row shows when
// closed, and the intensity bars of the whole block.
//
// WHY THIS EXISTS. The old editor exposed every decision as always-on chips —
// twelve visible controls per segment. The redesign shows each element as the
// SENTENCE the athlete will read and opens one element at a time; these helpers
// are that sentence and the bar strip. Pure functions, no React, unit-tested.
//
// The sentence must match how the athlete's preview reads (same vocabulary as
// shared/domain/prescription/to-text.ts) — if it reads wrong here, it reads
// wrong on the phone, which makes the editor the quality gate.

import type {
  Element,
  Phase,
  RunStructure,
  Segment,
  SegmentMeasure,
  SegmentTarget,
} from '@fahybrid/shared/domain/prescription';
import { isRepeat } from '@fahybrid/shared/domain/prescription';

// ── Formatting atoms ──────────────────────────────────────────────────────────

/** 270 → "4:30". Seconds under an hour, the pace/clock notation coaches write. */
function clock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = `${m}:${String(sec).padStart(2, '0')}`;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : mm;
}

/** Duration for a sentence: 600 → "10'", 90 → "1'30\"", 45 → "45\"". */
function durationText(s: number): string {
  if (s % 60 === 0) return `${s / 60}'`;
  if (s < 60) return `${s}"`;
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`;
}

function measureText(m: SegmentMeasure): string {
  if (m.type === 'distance') {
    return m.m >= 1000 && m.m % 100 === 0 ? `${trimZeros(m.m / 1000)} km` : `${m.m} m`;
  }
  return durationText(m.s);
}

function trimZeros(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** The objetivo as the coach says it out loud. null → "libre" (by feel). */
export function targetText(t: SegmentTarget | null): string {
  if (!t) return 'libre';
  switch (t.type) {
    case 'pace': {
      if (t.value_s !== undefined) return `@ ${clock(t.value_s)}/km`;
      if (t.min_s !== undefined && t.max_s !== undefined)
        return `@ ${clock(t.min_s)}–${clock(t.max_s)}/km`;
      if (t.min_s !== undefined) return `@ ≥${clock(t.min_s)}/km`;
      if (t.max_s !== undefined) return `@ ≤${clock(t.max_s)}/km`;
      return 'libre';
    }
    case 'pace_zone':
      return `ritmo Z${t.zone}`;
    case 'hr_zone':
      return `FC Z${t.zone}`;
    case 'rpe': {
      if (t.value !== undefined) return `RPE ${t.value}`;
      if (t.min !== undefined && t.max !== undefined) return `RPE ${t.min}–${t.max}`;
      return 'RPE';
    }
  }
}

// ── The sentence ──────────────────────────────────────────────────────────────

/** One segment as a sentence: "1000 m @ 4:30/km · 5% · 180 spm" / "rec 2' parado". */
export function segmentSentence(seg: Segment): string {
  const parts: string[] = [];
  if (seg.kind === 'recovery') {
    parts.push(`rec ${measureText(seg.measure)}`);
    parts.push(seg.recovery_mode ?? 'parado');
    // A recovery with an explicit target (e.g. Z1 jog) says so; "libre" is implied.
    if (seg.target) parts.push(targetText(seg.target));
  } else {
    parts.push(measureText(seg.measure));
    parts.push(targetText(seg.target));
    if (seg.incline_pct !== undefined) parts.push(`${trimZeros(seg.incline_pct)}%`);
    if (seg.cadence_spm !== undefined) parts.push(`${seg.cadence_spm} spm`);
  }
  return parts.join(' · ').replace(' · @', ' @');
}

/** An element (segment or repeat) as one line: "6 × 1000 m @ 4:30/km · rec 2' parado". */
export function elementSentence(el: Element): string {
  if (!isRepeat(el)) return segmentSentence(el);
  const inner = el.elements.map(elementSentence).join(' · ');
  return `${el.times} × ${inner}`;
}

// ── Intensity bars (the block profile) ───────────────────────────────────────

export interface IntensityBar {
  kind: 'work' | 'recovery';
  /** Estimated seconds — drives the bar WIDTH. */
  seconds: number;
  /** 0..1 — drives the bar HEIGHT. */
  intensity: number;
}

// Pace assumptions when a segment has no explicit pace: the bars only need to be
// SHAPED right (long easy vs short hard), never physiologically exact.
const ASSUMED_WORK_PACE_S = 300; // 5:00/km
const ASSUMED_RECOVERY_PACE_S = 420; // 7:00/km walk/jog
/** Zone → rough pace s/km, for width only. Z1 slowest → Z5 fastest. */
const ZONE_PACE_S: Record<number, number> = { 1: 390, 2: 350, 3: 315, 4: 280, 5: 250 };

function paceFor(seg: Segment): number {
  const t = seg.target;
  if (t?.type === 'pace') {
    if (t.value_s !== undefined) return t.value_s;
    if (t.min_s !== undefined && t.max_s !== undefined) return (t.min_s + t.max_s) / 2;
    return t.min_s ?? t.max_s ?? ASSUMED_WORK_PACE_S;
  }
  if (t?.type === 'pace_zone' || t?.type === 'hr_zone') {
    return ZONE_PACE_S[t.zone] ?? ASSUMED_WORK_PACE_S;
  }
  return seg.kind === 'recovery' ? ASSUMED_RECOVERY_PACE_S : ASSUMED_WORK_PACE_S;
}

/** Estimated seconds of one segment (duration as-is; distance via its pace). */
export function segmentSeconds(seg: Segment): number {
  if (seg.measure.type === 'duration') return seg.measure.s;
  return Math.round((seg.measure.m / 1000) * paceFor(seg));
}

/** 0..1 height. Recovery is flat-low; work scales by how hard the target reads. */
function intensityOf(seg: Segment): number {
  if (seg.kind === 'recovery') return 0.16;
  const t = seg.target;
  if (!t) return 0.42;
  switch (t.type) {
    case 'pace_zone':
    case 'hr_zone':
      return 0.28 + 0.13 * Math.min(5, Math.max(1, t.zone)); // Z1 .41 → Z5 .93
    case 'rpe': {
      const v = t.value ?? ((t.min ?? 5) + (t.max ?? t.min ?? 5)) / 2;
      return Math.min(0.95, Math.max(0.25, v / 10));
    }
    case 'pace': {
      // Faster pace → taller bar. 6:30/km ≈ .40 … 3:00/km ≈ .95, clamped.
      const pace = paceFor(seg);
      const scaled = 0.4 + ((390 - pace) / (390 - 180)) * 0.55;
      return Math.min(0.95, Math.max(0.35, scaled));
    }
  }
}

/** Cap so a 20× repeat cannot render 80 slivers: beyond this, repeats aggregate. */
const MAX_BARS = 48;

function elementBars(el: Element): IntensityBar[] {
  if (!isRepeat(el)) {
    return [{ kind: el.kind, seconds: segmentSeconds(el), intensity: intensityOf(el) }];
  }
  const once = el.elements.flatMap(elementBars);
  return Array.from({ length: el.times }, () => once).flat();
}

/**
 * The whole structure as bars, in execution order (warmup → main → cooldown).
 * When full expansion would exceed MAX_BARS, each repeat collapses to its single
 * pass with the width multiplied — the profile stays honest, the DOM stays sane.
 */
export function structureBars(structure: RunStructure): IntensityBar[] {
  const ordered: Phase[] = [...structure].sort((a, b) => rank(a) - rank(b));
  const expanded = ordered.flatMap((p) => p.elements.flatMap(elementBars));
  if (expanded.length <= MAX_BARS) return expanded;

  const aggregated = ordered.flatMap((p) =>
    p.elements.flatMap((el): IntensityBar[] => {
      if (!isRepeat(el)) {
        return [{ kind: el.kind, seconds: segmentSeconds(el), intensity: intensityOf(el) }];
      }
      const once = el.elements.flatMap(elementBars);
      return once.map((b) => ({ ...b, seconds: b.seconds * el.times }));
    }),
  );
  return aggregated;
}

function rank(p: Phase): number {
  return p.role === 'warmup' ? 0 : p.role === 'main' ? 1 : 2;
}

// ── Totals (la sesión suma) ──────────────────────────────────────────────────

export interface StructureTotals {
  /** Total estimated meters (duration segments estimated via their pace). */
  total_m: number;
  total_s: number;
  /** Meters of WORK at an explicit quality target (the "km de calidad"). */
  quality_m: number;
  /** 0..100 — share of time spent working (vs recovering). */
  work_pct: number;
}

export function structureTotals(structure: RunStructure): StructureTotals {
  let total_m = 0;
  let total_s = 0;
  let quality_m = 0;
  let work_s = 0;

  const walk = (el: Element, times = 1): void => {
    if (isRepeat(el)) {
      el.elements.forEach((child) => walk(child, times * el.times));
      return;
    }
    const secs = segmentSeconds(el) * times;
    // A standing rest covers ZERO ground — estimating meters for it via a walking
    // pace inflated every session with phantom distance (caught by the totals test).
    const standing = el.kind === 'recovery' && (el.recovery_mode ?? 'parado') === 'parado';
    const meters = standing
      ? 0
      : el.measure.type === 'distance'
        ? el.measure.m * times
        : Math.round((el.measure.s / paceFor(el)) * 1000) * times;
    total_s += secs;
    total_m += meters;
    if (el.kind === 'work') {
      work_s += secs;
      if (el.target) quality_m += meters;
    }
  };

  structure.forEach((p) => p.elements.forEach((el) => walk(el)));
  return {
    total_m,
    total_s,
    quality_m,
    work_pct: total_s > 0 ? Math.round((work_s / total_s) * 100) : 0,
  };
}

/** "8,2 km · ≈ 42 min · 6 km de calidad · 74% trabajo" — the coach's mental math. */
export function totalsSentence(t: StructureTotals): string {
  const km = trimZeros(t.total_m / 1000);
  const min = Math.round(t.total_s / 60);
  const parts = [`${km} km`, `≈ ${min} min`];
  if (t.quality_m >= 500) parts.push(`${trimZeros(Math.round(t.quality_m / 100) / 10)} km de calidad`);
  parts.push(`${t.work_pct}% trabajo`);
  return parts.join(' · ');
}
