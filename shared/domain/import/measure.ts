// measure — the WORK-DONE micro-grammar this grammar did not yet speak: an
// interval work-window in any clock vocabulary (not just the prime quote
// ./dose.ts's parseInterval reads), calories as the per-set/per-round unit of
// work (distinct from calories as a bout-level GOAL — see ./target.ts), a
// distance-interval RANGE ("6x800-1000m", the ceiling no longer silently
// dropped), and a movement timed/counted-in-calories with NO load and NO
// modality (a plank, a hollow hold) — the shape neither bout.ts (needs a
// modality/zone/rpe signal) nor strength.ts's reps-only reading can type.
//
// Same honesty contract as ./dose.ts and ./target.ts: pure, extraction-only,
// a number that is IN the text or nothing. Every range here is a BAND the
// athlete closes inside (`measure.max`), never two silently-fabricated points
// and never the single "hard extreme" dose.ts's old readers used to keep.

import { type Measure, type Prescription, type PrescriptionSet } from '../prescription/types';
import { parseClockSeconds, parseImplementLoad, parseKg } from './dose';
import { doseFirstLabel, extractLabel } from './label';
import { type Parsed } from './result';

// ── Interval work-window, any clock vocabulary ───────────────────────────────
// dose.ts's parseInterval only reads the prime-quote form ("5x3'", "6x30''").
// A coach who writes the SAME shape in words ("Remo 3x4 min") or a range
// ("Remo 3x4-5 min") fell through to a fabricated rep-sequence read via
// parseRepSeq (the same bug class ./target.ts closes for pace/pulse/kg) —
// "4-5" alone, with the "3x" repeat count silently dropped entirely.

export interface ClockInterval {
  rounds: number;
  work_s: number;
  work_s_max?: number;
}

const CLOCK_UNIT_ALT = "min(?:utos?)?\\b|seg(?:undos?)?\\.?\\b|s\\b|horas?\\b";

/** "3x4 min" / "3x90 seg" / "3x4-5 min" (band, not two rounds) → rounds + a
 *  work window. Prime-quote lines never reach here — dose.ts's parseInterval
 *  already owns "5x3'" and this is only tried when that returns null. */
export function parseIntervalWordClock(raw: string): ClockInterval | null {
  const head = raw.match(/(\d+)\s*x\s*(?=\d)/i);
  if (!head) return null;
  const tail = raw.slice(head.index! + head[0].length);
  const range = tail.match(new RegExp(`^(\\d+)\\s*[-–]\\s*(\\d+)\\s*(${CLOCK_UNIT_ALT})`, 'i'));
  if (range) {
    const unit = range[3]!;
    const lo = parseClockSeconds(`${range[1]}${unit}`);
    const hi = parseClockSeconds(`${range[2]}${unit}`);
    if (lo !== undefined && hi !== undefined && lo > 0 && lo <= hi) {
      return { rounds: parseInt(head[1]!, 10), work_s: lo, work_s_max: hi };
    }
  }
  const point = tail.match(new RegExp(`^(\\d+)\\s*(${CLOCK_UNIT_ALT})`, 'i'));
  if (point) {
    const seconds = parseClockSeconds(`${point[1]}${point[2]}`);
    if (seconds !== undefined && seconds > 0) {
      return { rounds: parseInt(head[1]!, 10), work_s: seconds };
    }
  }
  return null;
}

// ── Calories AS THE MEASURE ──────────────────────────────────────────────────
// "Assault bike 5x15 cal" — 5 rounds, each measured in calories burned, not
// reps. "5x12-15 cal" → a per-round BAND. Requires the leading "Nx" — a bare
// "150 cal" with no multiplier is the bout-level GOAL (./target.ts), never
// this.

export interface CalorieInterval {
  rounds: number;
  calories: number;
  caloriesMax?: number;
}

export function parseCaloriesInterval(raw: string): CalorieInterval | null {
  const range = raw.match(/(\d+)\s*x\s*(\d{1,4})\s*[-–—]\s*(\d{1,4})\s*cal(?:or[ií]as?)?\b/i);
  if (range) {
    const lo = parseInt(range[2]!, 10);
    const hi = parseInt(range[3]!, 10);
    if (hi >= lo) {
      return {
        rounds: parseInt(range[1]!, 10),
        calories: lo,
        ...(hi > lo ? { caloriesMax: hi } : {}),
      };
    }
  }
  const point = raw.match(/(\d+)\s*x\s*(\d{1,4})\s*cal(?:or[ií]as?)?\b/i);
  if (point) {
    return { rounds: parseInt(point[1]!, 10), calories: parseInt(point[2]!, 10) };
  }
  return null;
}

// ── Distance interval, RANGE ─────────────────────────────────────────────────
// "6x800-1000m" — dose.ts's parseDistanceInterval only ever read the bare
// "6x800" half (its second alternative has no "-1000m" awareness at all), so
// the ceiling silently vanished while the line still shipped green. A
// dedicated range reader, tried BEFORE the point one so its own second half
// is never independently re-read.

export interface DistanceInterval {
  rounds: number;
  meters: number;
  metersMax?: number;
}

export function parseDistanceIntervalRange(raw: string): DistanceInterval | null {
  const m = raw.match(/(\d+)\s*x\s*(\d{3,4})\s*[-–—]\s*(\d{3,4})\s*m?\b/i);
  if (!m) return null;
  const lo = parseInt(m[2]!, 10);
  const hi = parseInt(m[3]!, 10);
  if (hi <= lo) return null;
  return { rounds: parseInt(m[1]!, 10), meters: lo, metersMax: hi };
}

// ── Bare timed / calorie SETS (no load, no modality) ─────────────────────────
// "Plancha 3x45 s" / "Plancha 3x40-45 s" — an isometric/timed hold with no
// load and no cardio modality. bout.ts refuses it (no modality/zone/rpe
// signal); strength.ts's own rep-sequence reader used to grab the range's
// raw digits as fabricated reps ("40 REPS", the bug this module exists to
// close). parseSetsByLoadedMeasure (strength.ts) is the loaded sibling of
// this shape; this is the UNLOADED one — tried only when that one refuses
// (no "@"/kg present), so the two never compete for the same line.

function parseSetsByBareMeasure(seg: string): { count: number; measure: Measure } | null {
  const head = seg.match(/(\d+)\s*x\s*(?=\d)/i);
  if (!head) return null;
  const tail = seg.slice(head.index! + head[0].length);
  const count = parseInt(head[1]!, 10);

  const clockRange = tail.match(new RegExp(`^(\\d+)\\s*[-–]\\s*(\\d+)\\s*(${CLOCK_UNIT_ALT})`, 'i'));
  if (clockRange) {
    const unit = clockRange[3]!;
    const lo = parseClockSeconds(`${clockRange[1]}${unit}`);
    const hi = parseClockSeconds(`${clockRange[2]}${unit}`);
    if (lo !== undefined && hi !== undefined && lo > 0 && lo <= hi) {
      return { count, measure: { kind: 'duration', seconds: lo, ...(hi > lo ? { max: hi } : {}) } };
    }
  }
  const clockPoint = tail.match(
    new RegExp(`^(\\d+)\\s*(''|'{1,2}|${CLOCK_UNIT_ALT})`, 'i'),
  );
  if (clockPoint) {
    const seconds = parseClockSeconds(`${clockPoint[1]}${clockPoint[2]}`);
    if (seconds !== undefined && seconds > 0) {
      return { count, measure: { kind: 'duration', seconds } };
    }
  }

  const calRange = tail.match(/^(\d{1,4})\s*[-–—]\s*(\d{1,4})\s*cal(?:or[ií]as?)?\b/i);
  if (calRange) {
    const lo = parseInt(calRange[1]!, 10);
    const hi = parseInt(calRange[2]!, 10);
    if (hi >= lo) {
      return { count, measure: { kind: 'calories', value: lo, ...(hi > lo ? { max: hi } : {}) } };
    }
  }
  const calPoint = tail.match(/^(\d{1,4})\s*cal(?:or[ií]as?)?\b/i);
  if (calPoint) {
    return { count, measure: { kind: 'calories', value: parseInt(calPoint[1]!, 10) } };
  }
  return null;
}

/** "Plancha 3x45 s" / "Plancha 3x40-45 s" / "Burpees 3x10-12 cal" → a
 *  `scheme:'sets'` line, each set carrying the SAME timed/calorie measure —
 *  see the module comment above. Refuses when a load ("@"/kg) is present
 *  (parseSetsByLoadedMeasure in strength.ts owns that shape) so the two
 *  readers never claim the same line. `modality` is left UNSET: this reader
 *  has no cardio/strength signal of its own to name one, and inventing
 *  "strength" for a plank would be a guess this grammar does not make. */
export function parseBareTimedOrCalorieSets(seg: string): Parsed | null {
  // A load present ("@…" or a plain "…kg") means strength.ts's
  // parseSetsByLoadedMeasure owns this line (the SAME deference bout.ts's
  // own interval guard already uses) — refuse first so the two readers
  // never compete for it.
  if (parseImplementLoad(seg) || parseKg(seg) !== undefined) return null;
  const parsed = parseSetsByBareMeasure(seg);
  if (!parsed) return null;
  const sets: PrescriptionSet[] = Array.from({ length: parsed.count }, () => ({
    measure: parsed.measure,
  }));
  const p: Prescription = { scheme: 'sets', sets };
  return { token: extractLabel(seg) || doseFirstLabel(seg).token, prescription: p };
}
