// dose — the NUMERIC micro-grammar of Pablo's notation: clocks, distances,
// paces, rests, targets (RPE / zones / %RM / kg), rep schemes and interval
// shapes. Every parser is pure and extraction-only: it returns a number that is
// IN the text or nothing — never a guess (the honesty contract, see
// ./notation.ts). Ported/extended from infra/scripts/parse_blocks_lib.ts.
//
// THE QUOTE RULE (class-1 fix): after normalization `''` (double prime) is
// SECONDS — always; a single `'` is MINUTES. No parser may consume one quote of
// a `''` pair (the old parseInterval bug read 6x30'' as 30 MINUTES).

import type { PaceCap, PaceUnit, Target } from '../prescription/types';

// ── Text normalization ───────────────────────────────────────────────────────
// Pablo writes seconds as a straight double-quote (45"), two single-quotes
// (45''), or a Unicode double-prime. Unify them so ONE grammar covers all.

export function normalizeNotation(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[′ʹ]/g, "'") // ′ ʹ (prime) → '
    .replace(/[″‶]/g, "''") // ″ ‶ (double prime) → ''
    .replace(/[‘’‛]/g, "'") // ‘ ’ ‛ → '
    .replace(/[“”]/g, "''") // “ ” → ''
    .replace(/"/g, "''") // straight double-quote → ''
    // "10 × 400m" — the multiplication sign is what a calendar UI (and anyone
    // typing on iOS) produces for "x". Every parser below matches ASCII `x`, so
    // WITHOUT this the whole line falls to `review` for a purely typographic
    // reason. Same for the multiplication asterisk forms.
    .replace(/[×✕✖⨯]/g, 'x')
    .replace(/ /g, ' '); // non-breaking space (pasted text / OCR)
}

/** Lowercase, accent-fold, collapse whitespace — the comparison form. */
export const foldText = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// ── Clocks & durations ───────────────────────────────────────────────────────

/** h/m/s colon groups (the 3rd, seconds, group optional: 2 parts = m:ss, 3 =
 *  h:mm:ss) → total seconds. Shared by parseClockSeconds and parseRest so the
 *  TrainingPeaks colon vocabulary is read identically everywhere. */
function colonClockToSeconds(hOrM: string, mOrS: string, s: string | undefined): number {
  if (s !== undefined) return parseInt(hOrM, 10) * 3600 + parseInt(mOrS, 10) * 60 + parseInt(s, 10);
  return parseInt(hOrM, 10) * 60 + parseInt(mOrS, 10);
}

/** A number + its unit WORD ("hora(s)", "min(utos)", "segundos"/"seg"/"s") →
 *  seconds. Shared by parseClockSeconds and parseRest. */
function wordClockToSeconds(n: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith('hora')) return n * 3600;
  if (u.startsWith('min')) return n * 60;
  return n; // segundos / seg / s
}

/** Any single clock literal → seconds: "1h15'"→4500 · "3'30''"→210 · "3'"→180 ·
 *  "30''"→30 · "1h"→3600 · "90 seg"/"90s"→90 · "2 min"→120 · "1 hora"→3600 ·
 *  "1:30"→90 (m:ss) · "1:20:00"→4800 (h:mm:ss). Order matters: the compound
 *  prime forms first so a `''` never loses a quote to the minutes reader; the
 *  word/colon forms are TrainingPeaks' vocabulary, tried only once no prime
 *  form matched. A pace clock ("3:45 min/km") is NOT a duration — both new
 *  forms refuse to fire immediately before a pace unit, and the word form
 *  refuses to fire on a number that is itself the ss half of an m:ss pace
 *  (the `(?<!:)` lookbehind), so "3:45 min/km" is never misread as 45 min.
 *  `(?<!\d)` on every new form anchors the number to ITS OWN start — without
 *  it, a lookbehind that blocks the true start of a number (e.g. the "9" of
 *  "90") lets the engine backtrack into the number's OWN trailing digit (the
 *  "0" of "90") and fabricate a match from a digit that was never a number on
 *  its own. */
export function parseClockSeconds(raw: string): number | undefined {
  const hm = raw.match(/(\d+)\s*h\s*(\d+)\s*'/i);
  if (hm) return parseInt(hm[1]!, 10) * 3600 + parseInt(hm[2]!, 10) * 60;
  const h = raw.match(/(\d+)\s*h(?!\d)/i);
  if (h) return parseInt(h[1]!, 10) * 3600;
  const ms = raw.match(/(\d+)\s*'\s*(\d+)\s*''/);
  if (ms) return parseInt(ms[1]!, 10) * 60 + parseInt(ms[2]!, 10);
  const min = raw.match(/(\d+)\s*'(?!')/);
  if (min) return parseInt(min[1]!, 10) * 60;
  const sec = raw.match(/(\d+)\s*''/);
  if (sec) return parseInt(sec[1]!, 10);
  const PACE_GUARD = '(?!\\s*(?:min\\s*)?\\/\\s*(?:km|500\\s*m?|mi|milla))';
  const word = raw.match(
    new RegExp(
      `(?<!\\d)(?<!:)(\\d+)\\s*(horas?|min(?:utos?)?|segundos?|seg\\.?|s)\\b${PACE_GUARD}`,
      'i',
    ),
  );
  if (word) return wordClockToSeconds(parseInt(word[1]!, 10), word[2]!);
  const hms = raw.match(new RegExp(`(?<!\\d)\\b(\\d+):([0-5]?\\d):([0-5]?\\d)\\b${PACE_GUARD}`));
  if (hms) return colonClockToSeconds(hms[1]!, hms[2]!, hms[3]);
  const msColon = raw.match(new RegExp(`(?<!\\d)\\b(\\d+):([0-5]\\d)\\b${PACE_GUARD}`));
  if (msColon) return colonClockToSeconds(msColon[1]!, msColon[2]!, undefined);
  return undefined;
}

/** A continuous bout duration in minutes/hours — never a rest clock ("1'15''",
 *  guarded), never a seconds literal, never a pace ("6'/km", unit lookahead).
 *  Also reads the TrainingPeaks word/colon vocabulary ("2 min", "90 seg",
 *  "1:30"), guarded the same way as parseClockSeconds so a pace's "45" in
 *  "3:45 min/km" is never misread as 45 minutes. "1 hora" already matches the
 *  bare `h` branch above (a coach's "h" and the "h" starting "hora" are the
 *  same literal), so no separate hour-word branch is needed. The new forms
 *  also refuse a number still attached to an "Nx" this function does not
 *  itself consume: "6x90 seg" is a ROUNDS×CLOCK interval (no word-interval
 *  reader exists yet — see parseInterval), and reading just its "90 seg" half
 *  as a bare 90s duration would silently drop the "6x" repeat count, which is
 *  a fabrication this function must never make; the line stays review. */
export function parseDuration(raw: string): number | undefined {
  const hm = raw.match(/(\d+)\s*h\s*(\d+)\s*'/);
  if (hm) return parseInt(hm[1]!, 10) * 3600 + parseInt(hm[2]!, 10) * 60;
  const h = raw.match(/(\d+)\s*h(?!\d)/);
  if (h) return parseInt(h[1]!, 10) * 3600;
  const min = raw.match(/(\d+)\s*'(?!')(?!\s*\d)(?!\s*\/\s*(?:km|500|mi|milla))/);
  if (min) return parseInt(min[1]!, 10) * 60;
  // `(?<!\d)` is load-bearing, not decorative: without it, when NOT_INTERVAL_
  // GUARD blocks the true start of "90" in "6x90 seg", the engine backtracks
  // and re-tries from "0" (the trailing digit) — which the "x"-lookbehind no
  // longer sees, so it would match a fabricated "0 seg" = 0s instead of
  // refusing the line. Anchoring every number to its OWN start closes that.
  const NOT_INTERVAL_GUARD = '(?<!\\d)(?<!x\\s{0,3})';
  const PACE_GUARD = '(?!\\s*(?:min\\s*)?\\/\\s*(?:km|500\\s*m?|mi|milla))';
  const word = raw.match(
    new RegExp(
      `(?<!:)${NOT_INTERVAL_GUARD}(\\d+)\\s*(min(?:utos?)?|segundos?|seg\\.?|s)\\b${PACE_GUARD}`,
      'i',
    ),
  );
  if (word) return wordClockToSeconds(parseInt(word[1]!, 10), word[2]!);
  const hms = raw.match(
    new RegExp(`${NOT_INTERVAL_GUARD}\\b(\\d+):([0-5]?\\d):([0-5]?\\d)\\b${PACE_GUARD}`),
  );
  if (hms) return colonClockToSeconds(hms[1]!, hms[2]!, hms[3]);
  const msColon = raw.match(new RegExp(`${NOT_INTERVAL_GUARD}\\b(\\d+):([0-5]\\d)\\b${PACE_GUARD}`));
  if (msColon) return colonClockToSeconds(msColon[1]!, msColon[2]!, undefined);
  return undefined;
}

/** "4km" → 4000, "500m" → 500. Never "15,5km/h" (pace) nor a word ("más"). */
export function parseDistanceMeters(raw: string): number | undefined {
  const km = raw.match(/(\d+(?:[.,]\d+)?)\s*km(?!\s*\/?\s*h)/i);
  if (km) return Math.round(parseFloat(km[1]!.replace(',', '.')) * 1000);
  const m = raw.match(/(\d+)\s*m(?![a-záéíóúñ])/i);
  if (m) return parseInt(m[1]!, 10);
  return undefined;
}

// ── Interval shapes ──────────────────────────────────────────────────────────

/** "5x3'" / "5x3'30''" / "6x30''" → rounds + per-interval work SECONDS.
 *  Alternation order enforces the quote rule: min+sec, then seconds-only, then
 *  minutes-only with a `(?!')` guard so `6x30''` can never read as 30 minutes. */
export function parseInterval(raw: string): { rounds: number; work_s: number } | null {
  const m = raw.match(/(\d+)\s*x\s*(?:(\d+)\s*'\s*(\d+)\s*''|(\d+)\s*''|(\d+)\s*'(?!'))/);
  if (!m) return null;
  const rounds = parseInt(m[1]!, 10);
  if (m[2] !== undefined) return { rounds, work_s: parseInt(m[2], 10) * 60 + parseInt(m[3]!, 10) };
  if (m[4] !== undefined) return { rounds, work_s: parseInt(m[4], 10) };
  return { rounds, work_s: parseInt(m[5]!, 10) * 60 };
}

/** "8x400m" / "12 rounds x 400m" → rounds + per-interval distance (meters). */
export function parseDistanceInterval(raw: string): { rounds: number; meters: number } | null {
  const m =
    raw.match(/(\d+)\s*(?:rounds|x)\s*x?\s*(\d+)\s*m\b/i) ?? raw.match(/(\d+)\s*x\s*(\d{3,4})\b/);
  if (!m) return null;
  return { rounds: parseInt(m[1]!, 10), meters: parseInt(m[2]!, 10) };
}

/** Count distinct interval groups ("Nx3'", "Nx400m", bare "Nx1200") — >=2 ⇒ a
 *  heterogeneous ladder that must be typed WHOLE or reviewed, never fused. The
 *  bare 3-4 digit form is included (class-3 fix: `1x1000` used to slip past). */
export function countIntervalGroups(raw: string): number {
  const m = raw.match(/\d+\s*x\s*(?:\d+\s*(?:''|'|m\b)|\d{3,4}\b)/gi);
  return m ? m.length : 0;
}

/** One "NxM[m] [(annotation)]" ladder group, pre-expansion. */
export interface LadderGroup {
  count: number;
  meters: number;
  /** The parenthesized annotation right after the group, verbatim (no parens). */
  paren: string | null;
}

/** A distance LADDER: >=2 "NxM[m]" groups, each with its optional trailing
 *  parenthesized annotation captured. Returns the groups (in text order) + the
 *  leftover text so the caller can verify NOTHING else was dropped (any
 *  unassignable digit in the leftover ⇒ the whole line goes to review). */
export function parseDistanceLadder(
  raw: string,
): { groups: LadderGroup[]; leftover: string } | null {
  const re = /(\d+)\s*x\s*(\d{3,4})\s*m?\b\s*(?:\(([^)]*)\))?/gi;
  const matches = [...raw.matchAll(re)];
  if (matches.length < 2) return null;
  const groups: LadderGroup[] = matches.map((m) => ({
    count: parseInt(m[1]!, 10),
    meters: parseInt(m[2]!, 10),
    paren: m[3] !== undefined ? m[3].trim() : null,
  }));
  return { groups, leftover: raw.replace(re, ' ') };
}

/** A pure recovery clock ("1'45'' rest", "1'30''", "1'", "45''") → seconds, or
 *  undefined when the text carries anything beyond a clock + a rest word. */
export function parseRecoveryClock(raw: string): number | undefined {
  const s = raw.replace(/\b(?:de\s+)?(?:rest|descanso|recovery|rec)\b\.?/gi, ' ').trim();
  if (!/^(?:\d+\s*'\s*\d+\s*''|\d+\s*'{1,2})$/.test(s)) return undefined;
  return parseClockSeconds(s);
}

/** "5x(4' Z3-Z4 / 1' Z2)" — a parenthesized interval: rounds × (work / recovery).
 *  The recovery INTENSITY has no typed field yet, so it is returned verbatim in
 *  `rest_note` (class-6 fix: this used to collapse to a 4' steady bout). */
export interface ParenInterval {
  rounds: number;
  work_s: number;
  target?: Target;
  rest_s?: number;
  rest_note?: string;
}

export function parseParenInterval(raw: string): ParenInterval | null {
  const m = raw.match(/(\d+)\s*x\s*\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[2]!.split('/');
  if (parts.length > 2) return null; // more than work/rest — not provable
  const work_s = parseClockSeconds(parts[0]!);
  if (work_s === undefined) return null;
  const out: ParenInterval = { rounds: parseInt(m[1]!, 10), work_s };
  const target = parseZoneTarget(parts[0]!) ?? parseEffortTarget(parts[0]!)?.target;
  if (target) out.target = target;
  if (parts[1] !== undefined) {
    const rest = parseClockSeconds(parts[1]);
    if (rest === undefined) return null; // a recovery we cannot read → review
    out.rest_s = rest;
    const quality = parts[1].trim();
    if (!/^\d+\s*'{1,2}$/.test(quality)) out.rest_note = quality; // carries intensity
  }
  return out;
}

// ── Rest ─────────────────────────────────────────────────────────────────────

// The rest CUE words that carry a clock rather than merely qualify one — shared
// by parseRest and isPureRest so the two never drift apart (see isPureRest's
// docstring: the reversed order was added to parseRest once and to isPureRest's
// whitelist only later, which is exactly the kind of gap sharing one source
// closes for good).
const REST_CUE_SRC = '(?:rest|descanso|recuperaci[oó]n|recovery)';

/** Rest: "45'' rest", "1'15'' walking rest", "2' rest", "90'' float", "c/2'30''"
 *  → seconds. Conservative: needs an explicit rest cue OR the "c/" (cada) form.
 *  The cada seconds part requires its own `''` so "c/2': 3 Power Clean" reads
 *  120s, never 123. */
export function parseRest(raw: string): number | undefined {
  const cada = raw.match(/c\/\s*(\d+)\s*'\s*(?:(\d+)\s*'')?/i);
  if (cada) return parseInt(cada[1]!, 10) * 60 + (cada[2] ? parseInt(cada[2], 10) : 0);
  // Short PREFIX markers beyond "c/" — "cada", "rec", "r" — read as recovery
  // when they sit DIRECTLY before a clock, in ANY vocabulary this file knows
  // (prime, colon, word), by delegating to parseClockSeconds on the text
  // right after the marker. Tightly anchored — cue, optional ':', optional
  // space, THEN a digit, nothing else between — so a stray "r" elsewhere
  // never fires without ALSO looking like a clock introduction. The bare "r"
  // form additionally needs `\b` on BOTH sides: parseSetCount's "5r" ROUNDS
  // abbreviation sits digit-adjacent with no boundary before "r", so it can
  // never match here regardless of what follows (no separate digit-lookbehind
  // guard needed — one nearly shadowed a REAL case, "Z5 r 2'30''", a zone
  // number that merely happens to sit before this cue for an unrelated
  // reason; "cada"/"rec" never collide with a rounds abbreviation at all).
  const prefixCue = raw.match(/\b(?:cada|rec|r)\b\s*:?\s*(?=\d)/i);
  if (prefixCue) {
    const tail = raw.slice(prefixCue.index! + prefixCue[0].length);
    const clock = parseClockSeconds(tail);
    if (clock !== undefined) return clock;
  }
  const cue = /(?:rest|descanso|walking|float|trote|est[aá]tico|off|caminando)/i;
  const mm = raw.match(/(\d+)\s*'\s*(\d+)\s*''/);
  if (mm && cue.test(raw)) return parseInt(mm[1]!, 10) * 60 + parseInt(mm[2]!, 10);
  const min = raw.match(/[/\-]?\s*(\d+)\s*'(?!')\s*(?:rest|descanso|trote|caminando|off|float|est[aá]tico)/i);
  if (min) return parseInt(min[1]!, 10) * 60;
  const sec = raw.match(/(\d+)\s*''\s*(?:rest|descanso|walking|float|trote|est[aá]tico|off)/i);
  if (sec) return parseInt(sec[1]!, 10);
  // TrainingPeaks vocabulary: a colon or word clock with the rest CUE directly
  // adjacent, either order — "Descanso 1:30", "1:30 descanso", "Rest 90 seg".
  // Scoped tight to the cue's immediate neighbor (not "does this string
  // contain a clock anywhere") so an UNRELATED earlier clock on a merged
  // continuation line ("45' carrera Z2 Descanso 1:30" — see joinContinuations
  // in ./notation.ts) is never misread as the rest.
  const cueThenColon = raw.match(
    new RegExp(`${REST_CUE_SRC}\\s*:?\\s*(\\d+):([0-5]?\\d)(?::([0-5]?\\d))?\\b`, 'i'),
  );
  if (cueThenColon) return colonClockToSeconds(cueThenColon[1]!, cueThenColon[2]!, cueThenColon[3]);
  const colonThenCue = raw.match(
    new RegExp(`(\\d+):([0-5]?\\d)(?::([0-5]?\\d))?\\s*${REST_CUE_SRC}\\b`, 'i'),
  );
  if (colonThenCue) return colonClockToSeconds(colonThenCue[1]!, colonThenCue[2]!, colonThenCue[3]);
  const cueThenWord = raw.match(
    new RegExp(`${REST_CUE_SRC}\\s*:?\\s*(\\d+)\\s*(horas?|min(?:utos?)?|segundos?|seg\\.?|s)\\b`, 'i'),
  );
  if (cueThenWord) return wordClockToSeconds(parseInt(cueThenWord[1]!, 10), cueThenWord[2]!);
  const wordThenCue = raw.match(
    new RegExp(`(\\d+)\\s*(horas?|min(?:utos?)?|segundos?|seg\\.?|s)\\s*(?:de\\s+)?${REST_CUE_SRC}\\b`, 'i'),
  );
  if (wordThenCue) return wordClockToSeconds(parseInt(wordThenCue[1]!, 10), wordThenCue[2]!);
  return undefined;
}

// One clock, any vocabulary (prime, colon, word) — shared by both orders of
// isPureRest so "1:30 descanso" and "descanso 1:30" recognize the SAME set of
// clocks as parseRest actually knows how to read.
const REST_CLOCK_SRC =
  "(?:\\d+\\s*'\\s*\\d+\\s*''|\\d+\\s*'{1,2}|\\d+\\s*:\\s*[0-5]?\\d(?:\\s*:\\s*[0-5]?\\d)?|\\d+\\s*(?:horas?|min(?:utos?)?|segundos?|seg\\.?|s))";

/** A segment that IS only a rest clause — cue + one clock, either order:
 *  "1' rest", "— 2' de descanso" (Pablo's order), "Descanso 1:30", "1:30
 *  descanso", "Rest 90 seg" (TrainingPeaks writes the cue first, often with a
 *  colon or word clock, but not always). */
export function isPureRest(seg: string): boolean {
  const trailing = new RegExp(`^[\\s—–-]*${REST_CLOCK_SRC}\\s*(?:de\\s+)?${REST_CUE_SRC}\\s*$`, 'i');
  const leading = new RegExp(`^[\\s—–-]*${REST_CUE_SRC}\\s*:?\\s*${REST_CLOCK_SRC}\\s*$`, 'i');
  return trailing.test(seg) || leading.test(seg);
}

// ── Intensity targets ────────────────────────────────────────────────────────

/** "RPE 8" / "RPE8" / "RPE 3-4" / "RIR 2" / "RIR 1-2" → a point or RANGE effort
 *  Target + its verbatim text (for the note when another target wins the primary
 *  slot). Class-2 fix: ranges are read here so they can never masquerade as a
 *  rep sequence.
 *
 *  RIR shares this reader because it occupies the SAME slot as RPE — it is the
 *  other way coaches write proximity to failure, and `Target` has carried
 *  `{kind:'rir'}` since the model spec. It used only to be STRIPPED (so a rep
 *  reader could not eat it) and never typed, so every "4x4 | RIR 2" in the
 *  library silently lost its intensity. */
export function parseEffortTarget(raw: string): { target: Target; text: string } | null {
  // The range's second number must be a BARE effort value — "RPE8 – 45'' rest"
  // is a point RPE followed by a rest clock, not a range (the unit lookahead).
  const m = raw.match(
    /\b(rpe|rir)\s*(\d{1,2})(?:\s*[-–—]\s*(\d{1,2})(?!\d)(?!\s*['%]|\s*kg\b|\s*k?m\b))?/i,
  );
  if (!m) return null;
  const kind = m[1]!.toLowerCase() === 'rir' ? ('rir' as const) : ('rpe' as const);
  const ceiling = kind === 'rpe' ? 10 : 10; // beyond 10 reps-in-reserve is not a prescription
  const label = kind.toUpperCase();
  const lo = parseInt(m[2]!, 10);
  if (lo > ceiling) return null;
  const hi = m[3] !== undefined ? parseInt(m[3], 10) : undefined;
  if (hi !== undefined && hi >= lo && hi <= ceiling) {
    return { target: { kind, min: lo, max: hi }, text: `${label} ${lo}-${hi}` };
  }
  return { target: { kind, value: lo }, text: `${label} ${lo}` };
}

/** "Z2" / "zona 2" / "Z3-Z4" / "Z3-4" → a point or RANGE hr_zone Target. */
export function parseZoneTarget(raw: string): Target | undefined {
  const m = foldText(raw).match(/\bz(?:ona)?\s*([1-5])(?:\s*[-–—]\s*z?(?:ona)?\s*([1-5]))?\b/);
  if (!m) return undefined;
  const lo = parseInt(m[1]!, 10);
  if (m[2] !== undefined) {
    const hi = parseInt(m[2], 10);
    if (lo < hi) return { kind: 'hr_zone', min: lo, max: hi };
    if (lo === hi) return { kind: 'hr_zone', value: lo };
    return undefined;
  }
  return { kind: 'hr_zone', value: lo };
}

/** Remove RPE/RIR/zone clauses so a rep-scheme reader can never swallow them
 *  ("5' RPE 3-4" must not become reps 3 and 4 — class 2). */
export function stripTargetTokens(raw: string): string {
  return raw
    .replace(/\b(?:rpe|rir)\s*\d{1,2}(?:\s*[-–—]\s*\d{1,2})?/gi, ' ')
    .replace(/\bz(?:ona)?\s*[1-5](?:\s*[-–—]\s*z?(?:ona)?\s*[1-5])?\b/gi, ' ');
}

// ── Pace ─────────────────────────────────────────────────────────────────────

const SECONDS_PER_HOUR = 3600;

/** "15,5km/h" / "17 km/h" → seconds-per-km pace. */
export function parsePaceKmh(raw: string): { unit: PaceUnit; value_s: number } | null {
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*km\s*\/\s*h/i);
  if (!m) return null;
  const kmh = parseFloat(m[1]!.replace(',', '.'));
  if (!(kmh > 0)) return null;
  return { unit: 'per_km', value_s: Math.round(SECONDS_PER_HOUR / kmh) };
}

export function paceUnitFrom(raw: string): PaceUnit | null {
  if (/\/\s*500\s*m?/i.test(raw)) return 'per_500m';
  if (/\/\s*(?:mi|mile|milla)/i.test(raw)) return 'per_mile';
  if (/\/\s*km/i.test(raw)) return 'per_km';
  return null;
}

/** An explicit clock pace with a unit: "3'50/km" → 230 s/km;
 *  "3'40-3'50/km" → a min/max range. Returns a pace Target or null. */
export function parsePaceClockTarget(raw: string): Target | null {
  const unit = paceUnitFrom(raw);
  if (!unit) return null;
  const range = raw.match(/(\d+)\s*'\s*(\d+)\s*''?\s*[-–]\s*(\d+)\s*'\s*(\d+)/);
  if (range) {
    const lo = parseInt(range[1]!, 10) * 60 + parseInt(range[2]!, 10);
    const hi = parseInt(range[3]!, 10) * 60 + parseInt(range[4]!, 10);
    if (lo <= hi) return { kind: 'pace', unit, min_s: lo, max_s: hi };
  }
  const point = raw.match(/(\d+)\s*'\s*(\d+)\s*(?:'')?\s*\/\s*(?:km|500|mi|milla)/i);
  if (point) {
    return { kind: 'pace', unit, value_s: parseInt(point[1]!, 10) * 60 + parseInt(point[2]!, 10) };
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
  const n = foldText(raw);
  const faster = /no m[aá]s rapido|no bajar de|minimo|mas rapido que/.test(n);
  const slower = /no m[aá]s lento|no m[aá]s de|maximo|sin pasar de|no pasar de|no superar/.test(n);
  if (faster) return { unit, min_s: seconds };
  if (slower) return { unit, max_s: seconds };
  return null;
}

// ── Strength numerics ────────────────────────────────────────────────────────

// Every unit word/mark that means "this number is a CLOCK, not a rep count" —
// shared by parseSetsByReps and parseSetsByRepRange so "6x90 seg" (a 90-
// SECOND interval the grammar doesn't type yet — it stays review rather than
// being fabricated as 6 sets of 90 reps) is excluded the same way "4x400m"
// and "4x6'" already are.
const UNIT_GUARD = "(?!\\s*(?:'|''|m\\b|km|cal|kg|horas?\\b|min(?:utos?)?\\b|segundos?\\b|seg\\.?\\b|s\\b))";

/** Per-set rep scheme "10/10/8/8/6" or "10-10-8-6" → [10,10,8,8,6]. Intra-list
 *  separators carry NO spaces, so a spaced " / " never bleeds lists together.
 *  A sequence ending AT a quote is a clock range ("5-8' descanso"), not reps. */
export function parseRepSeq(raw: string): number[] | null {
  const m = raw.match(/(\d+(?:[/\-]\d+)+)(?!\s*')/);
  if (!m) return null;
  const parts = m[1]!.split(/[/\-]/).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
  return parts.length >= 2 ? parts : null;
}

/** A rep RANGE ("12-15 repeticiones") — a BAND the athlete autoregulates
 *  inside, not two discrete sets. Two dash-joined numbers are ambiguous with a
 *  2-element SEQUENCE ("12-8", one set of 12 then one of 8) on their own, so
 *  this only fires with a reps WORD directly after ("repeticiones"/"reps")
 *  AND only when the numbers ascend (lo < hi) — a descending pair is never a
 *  range, so it correctly falls through to the sequence reader instead. */
export function parseRepRange(raw: string): { value: number; max: number } | null {
  const m = raw.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})(?!\d)\s*(?:repeticiones?|reps?)\b/i);
  if (!m) return null;
  const value = parseInt(m[1]!, 10);
  const max = parseInt(m[2]!, 10);
  return max > value ? { value, max } : null;
}

/** "Sentadilla 4x12-15" — sets × a rep RANGE (band, not two sets). Same
 *  disambiguation as parseRepRange: only an ASCENDING pair counts as a band;
 *  mirrors parseSetsByReps' guards against distances/clocks/loads stealing
 *  the second number. */
export function parseSetsByRepRange(
  seg: string,
): { sets: number; value: number; max: number } | null {
  const m = seg.match(
    new RegExp(`(\\d+)\\s*x\\s*(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})(?!\\d)${UNIT_GUARD}`, 'i'),
  );
  if (!m) return null;
  const sets = parseInt(m[1]!, 10);
  const value = parseInt(m[2]!, 10);
  const max = parseInt(m[3]!, 10);
  return max > value ? { sets, value, max } : null;
}

/** A load list ending in "%": "60/65/70/70/75%" → per-set list; "65-85%" → a
 *  RANGE; "75%" → a point. */
export function parseLoadPctList(raw: string): number[] | null {
  const m = raw.match(/(\d+(?:[/\-]\d+)*)\s*%/);
  if (!m) return null;
  const parts = m[1]!.split(/[/\-]/).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
  return parts.length >= 1 ? parts : null;
}

/** Remove the "…%" load group so the rep-scheme reader can't grab loads. */
export function stripLoadPct(seg: string): string {
  return seg.replace(/\d+(?:[/\-]\d+)*\s*%/g, ' ');
}

export function parseKg(seg: string): number | undefined {
  const m = seg.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  return m ? parseFloat(m[1]!.replace(',', '.')) : undefined;
}

/** "@2x32" / "@2x32kg" (farmers-carry-style, PER IMPLEMENT): N implements × M
 *  kg EACH — "Farmers Carry 4x100 m @2x28" is two 28 kg kettlebells, never
 *  the summed 56 (see Target.kg.implement_count). Requires the "@" — that is
 *  this notation's ONLY intensity marker, so an @-introduced "NxM" can only
 *  be a load; a BARE "2x32" elsewhere keeps its OWN meaning (sets×reps,
 *  parseSetsByReps) and must never be hijacked (the worst of the load bugs:
 *  "3x45 s @2x32" used to read as "2 sets of 32 reps"). `count` must be >=2 —
 *  "@1x32" carries no useful "each" signal over a plain "32 kg".
 */
export function parseImplementLoad(
  raw: string,
): { value: number; implement_count: number } | undefined {
  const m = raw.match(/@\s*(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(?:kg)?\b/i);
  if (!m) return undefined;
  const count = parseInt(m[1]!, 10);
  if (!(count >= 2)) return undefined;
  return { value: parseFloat(m[2]!.replace(',', '.')), implement_count: count };
}

/** Number of sets from "N rounds/rondas/series" or "Nr" anywhere in the seg. */
export function parseSetCount(raw: string): number | undefined {
  const m = raw.match(/(\d+)\s*(?:rounds|rondas|series|r)\b/i);
  return m ? parseInt(m[1]!, 10) : undefined;
}

/** "4x8" (sets × uniform reps) — reps capped at 2 digits so "2x1200" can never
 *  read as 1200 reps (3-4 digit values after x are DISTANCES, never reps), and
 *  NOT "4x6'" (interval), "4x400m" (distance), or "4x90 seg" (a clock — see
 *  UNIT_GUARD). */
export function parseSetsByReps(seg: string): { sets: number; reps: number } | null {
  const m = seg.match(new RegExp(`(\\d+)\\s*x\\s*(\\d{1,2})(?!\\d)${UNIT_GUARD}`, 'i'));
  if (!m) return null;
  return { sets: parseInt(m[1]!, 10), reps: parseInt(m[2]!, 10) };
}
