// target — the INTENSITY micro-grammar this grammar did not yet speak: pace
// (moved here from dose.ts in the prior commit — that file sat at the repo's
// 500-line ceiling), heart rate in bpm, watts, calories AS A GOAL (distinct
// from calories as the unit of work measured — see ./measure.ts), a
// bodyweight marker, a time-to-beat cap, and a kg BAND. Every reader is pure
// and extraction-only, same honesty contract as ./dose.ts: a number that is
// IN the text, or nothing.
//
// Owns the fix for the two most dangerous bugs found reproducing the brief's
// baseline: a pace/pulse/kg RANGE ("130-150 ppm", "@150-170 kg") was being
// silently swallowed by dose.ts's unit-blind `parseRepSeq` as a two-set REP
// sequence (verde, but fabricated numbers with no relation to the text).
// `stripKnownTargetRanges` removes every range/point this module can read
// from the text BEFORE strength.ts ever tries a rep-sequence read — the same
// "strip before you read reps" pattern `stripLoadPct`/`stripTargetTokens`
// already use for `%`/RPE/zone.
//
// Enum discipline: `PaceUnit` is exactly `per_km | per_500m | per_mile`
// (types.ts). A coach's `/1000m` (rowing sometimes paces per 1000m) is a
// REAL notation this module will see and must NOT invent a fourth unit or
// silently misconvert onto one of the three that exist — `paceUnitFrom`
// simply returns null for it, same as any other unit outside the model, and
// the line stays honest review.

import { type PaceCap, type PaceUnit, type Target } from '../prescription/types';
import { parseClockSeconds } from './dose';

// ── Pace ──────────────────────────────────────────────────────────────────

export function paceUnitFrom(raw: string): PaceUnit | null {
  if (/\/\s*500\s*m?/i.test(raw)) return 'per_500m';
  if (/\/\s*(?:mi|mile|milla)/i.test(raw)) return 'per_mile';
  if (/\/\s*km/i.test(raw)) return 'per_km';
  return null;
}

/** A clock immediately followed by "/<unit>", ANY unit — not gated to the
 *  three PaceUnit recognizes. Used ONLY by result.ts's residue guard to
 *  catch an out-of-model pace ("3:50/1000m") that `paceUnitFrom` correctly
 *  refuses to resolve: without this, the clock silently vanished (no target,
 *  no error) and the line still shipped green with just the distance —
 *  exactly the "objetivo perdido" failure this module exists to close, just
 *  for a unit the model does not carry instead of one it does. */
export const OUT_OF_MODEL_PACE_RE =
  /\d+(?:'\s*(?:\d+\s*(?:'')?)?|:[0-5]?\d)\s*(?:min\s*)?\/\s*\d*[a-záéíóúñ]+\b/i;

/** "15,5km/h" / "17 km/h" → seconds-per-km pace. */
export function parsePaceKmh(raw: string): { unit: PaceUnit; value_s: number } | null {
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*km\s*\/\s*h/i);
  if (!m) return null;
  const kmh = parseFloat(m[1]!.replace(',', '.'));
  if (!(kmh > 0)) return null;
  return { unit: 'per_km', value_s: Math.round(3600 / kmh) };
}

/** An explicit clock pace with a unit — prime ("3'50/km", "6'/km") or
 *  TrainingPeaks colon ("3:45 min/km") vocabulary, point or RANGE
 *  ("3'40-3'50/km", "4:30-4:45/km", "1:50-1:55/500m"). Seconds are OPTIONAL
 *  in both vocabularies — a coach who paces in whole minutes ("6'/km") is
 *  common and was previously unreadable as a PRIMARY target (only
 *  parsePaceCap's own regex allowed it). Range tried first in each
 *  vocabulary so its own second half is never mis-read as a lone point. */
export function parsePaceClockTarget(raw: string): Target | null {
  const unit = paceUnitFrom(raw);
  if (!unit) return null;
  // No inline unit requirement here, matching the pre-existing (tested)
  // coupling style: `unit` above already confirmed a pace unit exists
  // SOMEWHERE in the raw text; this only needs to find the clock-range shape.
  const primeRange = raw.match(/(\d+)\s*'\s*(?:(\d+)\s*''?)?\s*[-–]\s*(\d+)\s*'\s*(?:(\d+)\s*(?:'')?)?/);
  if (primeRange) {
    const lo = parseInt(primeRange[1]!, 10) * 60 + (primeRange[2] ? parseInt(primeRange[2], 10) : 0);
    const hi = parseInt(primeRange[3]!, 10) * 60 + (primeRange[4] ? parseInt(primeRange[4], 10) : 0);
    if (lo <= hi) return { kind: 'pace', unit, min_s: lo, max_s: hi };
  }
  const colonRange = raw.match(
    /(\d+):([0-5]?\d)\s*[-–]\s*(\d+):([0-5]?\d)\s*(?:min\s*)?\/\s*(?:km|500\s*m?|mi|milla)/i,
  );
  if (colonRange) {
    const lo = parseInt(colonRange[1]!, 10) * 60 + parseInt(colonRange[2]!, 10);
    const hi = parseInt(colonRange[3]!, 10) * 60 + parseInt(colonRange[4]!, 10);
    if (lo <= hi) return { kind: 'pace', unit, min_s: lo, max_s: hi };
  }
  const point = raw.match(/(\d+)\s*'\s*(?:(\d+)\s*(?:'')?)?\s*\/\s*(?:km|500|mi|milla)/i);
  if (point) {
    return {
      kind: 'pace',
      unit,
      value_s: parseInt(point[1]!, 10) * 60 + (point[2] ? parseInt(point[2], 10) : 0),
    };
  }
  // TrainingPeaks colon form: "3:45 min/km" → 225 s/km; "1:54 /500m" → 114
  // s/500m. A pace clock is always m:ss (never h:mm:ss — nobody paces per hour).
  const colonPoint = raw.match(/(\d+):([0-5]?\d)\s*(?:min\s*)?\/\s*(?:km|500\s*m?|mi|milla)/i);
  if (colonPoint) {
    return {
      kind: 'pace',
      unit,
      value_s: parseInt(colonPoint[1]!, 10) * 60 + parseInt(colonPoint[2]!, 10),
    };
  }
  return null;
}

/** A secondary PACE CAP: "(no más de 6'/km)" ⇒ slowest-allowed ceiling (max_s);
 *  "(no más rápido de 6'/km)" ⇒ fastest-allowed floor (min_s). Only fires when a
 *  cap PHRASE sits near a clock+unit pace. */
export function parsePaceCap(raw: string): PaceCap | null {
  const unit = paceUnitFrom(raw);
  if (!unit) return null;
  const clock = raw.match(/(\d+)\s*'\s*(?:(\d+)\s*(?:'')?)?\s*\/\s*(?:km|500|mi|milla)/i);
  if (!clock) return null;
  const seconds = parseInt(clock[1]!, 10) * 60 + (clock[2] ? parseInt(clock[2], 10) : 0);
  if (!(seconds > 0)) return null;
  const n = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const faster = /no m[aá]s rapido|no bajar de|minimo|mas rapido que/.test(n);
  const slower = /no m[aá]s lento|no m[aá]s de|maximo|sin pasar de|no pasar de|no superar/.test(n);
  if (faster) return { unit, min_s: seconds };
  if (slower) return { unit, max_s: seconds };
  return null;
}

/** Distance in MILES, converted to meters (1 mile = 1609.344 m, rounded) — the
 *  companion to a `/mile` pace target: a run prescribed in miles needs its own
 *  distance typed too, same as "10 km" already converts to meters. Spelled-out
 *  forms only ("miles", "millas") — the bare "mi" abbreviation is excluded on
 *  purpose: it collides with the common Spanish word "mi" ("my"), and no real
 *  corpus line has ever needed the shorter spelling. */
export function parseMilesMeters(raw: string): number | undefined {
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:miles?|millas?)\b/i);
  if (!m) return undefined;
  return Math.round(parseFloat(m[1]!.replace(',', '.')) * 1609.344);
}

// ── Heart rate in beats-per-minute ───────────────────────────────────────────
// Distinct from `hr_zone` (Z1-Z5, a coach-defined band) — this is the coach
// writing the raw number: "140 ppm" (Spanish, pulsaciones por minuto) / "140
// bpm". 2-3 digits only — a real human pulse, never a 1-digit rep count or a
// 4-digit distance that happens to sit near an unrelated "m". `(?<!\d)`
// anchors the match to the number's OWN start — without it a longer number
// sitting right before (e.g. the "5" of "45 min") can't fool this into
// reading just its trailing digits, the same mid-number fabrication class
// dose.ts's own parseDuration doc comment warns about.

export function parseHrBpmTarget(raw: string): Target | null {
  const cap = raw.match(/\b(?:maximo|máximo|max|tope)\s*(\d{2,3})\s*(?:ppm|bpm)\b/i);
  if (cap) return { kind: 'hr_bpm', max: parseInt(cap[1]!, 10) };
  const range = raw.match(/(?<!\d)(\d{2,3})\s*[-–—]\s*(\d{2,3})\s*(?:ppm|bpm)\b/i);
  if (range) {
    const lo = parseInt(range[1]!, 10);
    const hi = parseInt(range[2]!, 10);
    if (lo <= hi) return { kind: 'hr_bpm', min: lo, max: hi };
  }
  const point = raw.match(/(?<!\d)(\d{2,3})\s*(?:ppm|bpm)\b/i);
  if (point) return { kind: 'hr_bpm', value: parseInt(point[1]!, 10) };
  return null;
}

/** "72% FCmax" / "70-75% FCmax" / "72% HRmax" — a percent-of-MAX-heart-rate
 *  phrase. Resolving it to a real bpm number needs the athlete's OWN measured
 *  max HR, which this pure, DB-free grammar never has — so it is NEVER typed
 *  as `hr_bpm` (that would be a formula-derived guess, not a read number; see
 *  docs/DECISIONS.md on measured vs estimated HR anchors). Recognized only so
 *  a caller can give an honest review reason and — via result.ts's residue
 *  guard — refuse to ship a line green with no target at all when the coach
 *  plainly wrote one. Same spirit as REFERENCE_TARGET_RE for "a split de
 *  carrera" in result.ts. */
export const PERCENT_MAX_HR_RE =
  /\d+(?:\s*[-–—]\s*\d+)?\s*%\s*(?:de\s+)?(?:fc\s*m[aá]x(?:ima)?|fcm[aá]x|hr\s*max|hrmax|frecuencia\s*card[ií]aca\s*m[aá]x(?:ima)?)\b/i;

// ── Watts ─────────────────────────────────────────────────────────────────
// Erg/bike power target: "250 W" / "250w" / "220-250 W". 2-4 digits — a real
// erg/bike wattage never drops to single digits nor climbs past four.

export function parseWattsTarget(raw: string): Target | null {
  const range = raw.match(/(?<!\d)(\d{2,4})\s*[-–—]\s*(\d{2,4})\s*w(?:atts?)?\b/i);
  if (range) {
    const lo = parseInt(range[1]!, 10);
    const hi = parseInt(range[2]!, 10);
    if (lo <= hi) return { kind: 'watts', min: lo, max: hi };
  }
  const point = raw.match(/(?<!\d)(\d{2,4})\s*w(?:atts?)?\b/i);
  if (point) return { kind: 'watts', value: parseInt(point[1]!, 10) };
  return null;
}

// ── Calories AS THE GOAL ──────────────────────────────────────────────────
// "Remo 10 min 150 cal" — burn 150 cal; "10 min" is the bout's own duration
// and coexists with this target, same as a steady bout already carries
// total_s AND a zone target together. The `(?<!x\s{0,3})` guard is the
// mirror image of ./measure.ts's calorie MEASURE reader: an "Nx15 cal" is
// per-set work, a bare "150 cal" is the whole bout's finish line — the two
// shapes never collide because one requires the leading "x" and the other
// forbids it.
//
// `(?<!\d)` is the SECOND, independent guard, and just as load-bearing: on
// its own, `(?<!x\s{0,3})` only blocks the position RIGHT AFTER "x" — it
// does nothing to stop the engine retrying ONE digit further in, which is
// exactly how "Assault bike 5x15 cal" used to read as "5 cal" (the "1" of
// "15" quietly dropped, "5" reinterpreted as its own number) once the "x15"
// start was refused. Anchoring the match to a genuine number BOUNDARY (not
// mid-digit-run either) closes both holes at once.
//
// The POINT reader needs a THIRD guard the range reader does not: an
// "Nx<lo>-<hi> cal" MEASURE (./measure.ts) has its UPPER bound preceded by
// "-", not "x" or a digit — neither existing guard sees that as forbidden,
// so "Assault bike 5x12-15 cal" used to also read a phantom GOAL of "15 cal"
// on top of the correct per-round measure. `NOT_MEASURE_RANGE_TAIL` checks
// the fuller shape behind the dash ("x12-") so only a genuine Nx-range's own
// ceiling is excluded — a real standalone goal like "150 cal" (nothing
// "x<digits>-" before it) is untouched.
const NOT_MEASURE_RANGE_TAIL = '(?<!x\\s{0,3}\\d{1,4}\\s*[-–—]\\s*)';

export function parseCaloriesGoalTarget(raw: string): Target | null {
  const range = raw.match(
    /(?<!\d)(?<!x\s{0,3})(\d{1,4})\s*[-–—]\s*(\d{1,4})\s*cal(?:or[ií]as?)?\b/i,
  );
  if (range) {
    const lo = parseInt(range[1]!, 10);
    const hi = parseInt(range[2]!, 10);
    if (lo <= hi) return { kind: 'calories', min: lo, max: hi };
  }
  const point = raw.match(
    new RegExp(`(?<!\\d)(?<!x\\s{0,3})${NOT_MEASURE_RANGE_TAIL}(\\d{1,4})\\s*cal(?:or[ií]as?)?\\b`, 'i'),
  );
  if (point) return { kind: 'calories', value: parseInt(point[1]!, 10) };
  return null;
}

// ── Bodyweight ────────────────────────────────────────────────────────────
// A LOAD marker with no number — the athlete's own weight IS the resistance
// ("Fondos 4x12 peso corporal"). Curated phrases only, never inferred from a
// movement's name — inventing "this is bodyweight" from the exercise catalog
// is a LATER, separate concern, not this grammar's.

export function hasBodyweightMarker(raw: string): boolean {
  return /\b(?:peso\s+corporal|peso\s+propio|bodyweight|body\s*weight)\b/i.test(raw);
}

// ── Time cap ──────────────────────────────────────────────────────────────
// A CLOCK TO BEAT ("cap 8'", "TC 90''", "cap 8-9'", "TC55'") — see
// Target.time_cap's doc comment in types.ts (born for the roxzone,
// generalizes to any capped single effort). A WOD-level "(TC 12')" on a
// multi-station line never reaches this reader: hasMetconKeyword's own
// `\(tc\b` trigger already routes that whole line to review before dispatch
// gets here (notation.ts) — so this only ever fires on the single-bout/
// single-movement shape the kind was built for, or on ./structure.ts's own
// WOD-level extraction (which reuses this exact cue).
//
// `(?![a-záéíóúñ])` replaces a trailing `\b`: Pablo glues the cue straight to
// its digits ("TC55'", no space), and `\b` requires a WORD→NON-WORD
// transition — between "C" and "5" both sides are word characters, so a
// plain `\bcap|tc\b` never fires on the glued form at all (the same class of
// gap as "simulaci"/"intercal" elsewhere in this grammar not matching their
// own longer host words). The lookahead only forbids another LETTER right
// after the cue (so "capitán"/"capacidad" still correctly never match) while
// freely allowing a digit, punctuation, whitespace or end-of-string — and the
// LEADING `\b` is untouched, so "handicap2" still refuses (no boundary before
// "cap" inside it).
export const TIME_CAP_CUE_RE = /\b(?:cap|tc)(?![a-záéíóúñ])\.?\s*:?\s*/i;
const CLOCK_UNIT_ALT = "'{1,2}|min(?:utos?)?\\b|seg(?:undos?)?\\.?\\b|s\\b|horas?\\b";

export function parseTimeCapTarget(raw: string): Target | null {
  const cue = raw.match(TIME_CAP_CUE_RE);
  if (!cue) return null;
  const tail = raw.slice(cue.index! + cue[0].length);
  const range = tail.match(new RegExp(`^(\\d+)\\s*[-–]\\s*(\\d+)\\s*(${CLOCK_UNIT_ALT})`, 'i'));
  if (range) {
    const unit = range[3]!;
    const lo = parseClockSeconds(`${range[1]}${unit}`);
    const hi = parseClockSeconds(`${range[2]}${unit}`);
    if (lo !== undefined && hi !== undefined && lo > 0 && lo <= hi) {
      return { kind: 'time_cap', min_s: lo, max_s: hi };
    }
  }
  const value_s = parseClockSeconds(tail);
  if (value_s !== undefined && value_s > 0) return { kind: 'time_cap', value_s };
  return null;
}

// ── Kg BAND ───────────────────────────────────────────────────────────────
// "@150-170 kg" / "150-170 kg" (no "@") — a load RANGE, never the single
// "extreme" dose.ts's `parseKg` alone would read, and never the raw material
// for a fabricated two-set rep sequence (the class of bug this whole module
// exists to close — see the module doc comment). Ascending only, same
// convention as every other range in this grammar.

export function parseKgRange(raw: string): { min: number; max: number } | null {
  const m = raw.match(/(?<!\d)(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (!m) return null;
  const lo = parseFloat(m[1]!.replace(',', '.'));
  const hi = parseFloat(m[2]!.replace(',', '.'));
  return hi > lo ? { min: lo, max: hi } : null;
}

// ── Strip-before-you-read-reps ───────────────────────────────────────────
// Every range/point this module can read is removed from the text BEFORE
// strength.ts's rep-sequence reader ever sees it — the fix for the
// catastrophic bug this module exists to close (see module doc comment).
// Mirrors dose.ts's own `stripLoadPct`/`stripTargetTokens`, just for the
// axes THIS file introduced. Ranges before points in each family (a range's
// own second half must never survive to be re-read as a lone point).

export function stripKnownTargetRanges(raw: string): string {
  return raw
    .replace(
      /(?<!\d)\d+\s*'\s*(?:\d+\s*''?)?\s*[-–]\s*\d+\s*'\s*(?:\d+\s*(?:'')?)?\s*\/\s*(?:km|500|mi|milla)/gi,
      ' ',
    )
    .replace(
      /(?<!\d)\d+:[0-5]?\d\s*[-–]\s*\d+:[0-5]?\d\s*(?:min\s*)?\/\s*(?:km|500\s*m?|mi|milla)/gi,
      ' ',
    )
    .replace(/(?<!\d)\d+\s*'\s*(?:\d+\s*(?:'')?)?\s*\/\s*(?:km|500|mi|milla)/gi, ' ')
    .replace(/(?<!\d)\d+:[0-5]?\d\s*(?:min\s*)?\/\s*(?:km|500\s*m?|mi|milla)/gi, ' ')
    .replace(/(?<!\d)\d+(?:[.,]\d+)?\s*[-–—]\s*\d+(?:[.,]\d+)?\s*kg\b/gi, ' ')
    .replace(/(?<!\d)\d{2,3}\s*[-–—]\s*\d{2,3}\s*(?:ppm|bpm)\b/gi, ' ')
    .replace(/(?<!\d)\d{2,3}\s*(?:ppm|bpm)\b/gi, ' ')
    .replace(/(?<!\d)\d{2,4}\s*[-–—]\s*\d{2,4}\s*w(?:atts?)?\b/gi, ' ')
    .replace(/(?<!\d)\d{2,4}\s*w(?:atts?)?\b/gi, ' ')
    .replace(/(?<!\d)(?<!x\s{0,3})\d{1,4}\s*[-–—]\s*\d{1,4}\s*cal(?:or[ií]as?)?\b/gi, ' ')
    .replace(
      new RegExp(`(?<!\\d)(?<!x\\s{0,3})${NOT_MEASURE_RANGE_TAIL}\\d{1,4}\\s*cal(?:or[ií]as?)?\\b`, 'gi'),
      ' ',
    )
    .replace(PERCENT_MAX_HR_RE, ' ');
}
