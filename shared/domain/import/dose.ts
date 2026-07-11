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
    .replace(/"/g, "''"); // straight double-quote → ''
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

/** Any single clock literal → seconds: "1h15'"→4500 · "3'30''"→210 · "3'"→180 ·
 *  "30''"→30 · "1h"→3600. Order matters: the compound forms first so a `''`
 *  never loses a quote to the minutes reader. */
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
  return undefined;
}

/** A continuous bout duration in minutes/hours — never a rest clock ("1'15''",
 *  guarded), never a seconds literal, never a pace ("6'/km", unit lookahead). */
export function parseDuration(raw: string): number | undefined {
  const hm = raw.match(/(\d+)\s*h\s*(\d+)\s*'/);
  if (hm) return parseInt(hm[1]!, 10) * 3600 + parseInt(hm[2]!, 10) * 60;
  const h = raw.match(/(\d+)\s*h(?!\d)/);
  if (h) return parseInt(h[1]!, 10) * 3600;
  const min = raw.match(/(\d+)\s*'(?!')(?!\s*\d)(?!\s*\/\s*(?:km|500|mi|milla))/);
  if (min) return parseInt(min[1]!, 10) * 60;
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
  const target = parseZoneTarget(parts[0]!) ?? parseRpeTarget(parts[0]!)?.target;
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

/** Rest: "45'' rest", "1'15'' walking rest", "2' rest", "90'' float", "c/2'30''"
 *  → seconds. Conservative: needs an explicit rest cue OR the "c/" (cada) form.
 *  The cada seconds part requires its own `''` so "c/2': 3 Power Clean" reads
 *  120s, never 123. */
export function parseRest(raw: string): number | undefined {
  const cada = raw.match(/c\/\s*(\d+)\s*'\s*(?:(\d+)\s*'')?/i);
  if (cada) return parseInt(cada[1]!, 10) * 60 + (cada[2] ? parseInt(cada[2], 10) : 0);
  const cue = /(?:rest|descanso|walking|float|trote|est[aá]tico|off|caminando)/i;
  const mm = raw.match(/(\d+)\s*'\s*(\d+)\s*''/);
  if (mm && cue.test(raw)) return parseInt(mm[1]!, 10) * 60 + parseInt(mm[2]!, 10);
  const min = raw.match(/[/\-]?\s*(\d+)\s*'(?!')\s*(?:rest|descanso|trote|caminando|off|float|est[aá]tico)/i);
  if (min) return parseInt(min[1]!, 10) * 60;
  const sec = raw.match(/(\d+)\s*''\s*(?:rest|descanso|walking|float|trote|est[aá]tico|off)/i);
  if (sec) return parseInt(sec[1]!, 10);
  return undefined;
}

/** A segment that IS only a rest clause ("1' rest", "— 2' de descanso"). */
export function isPureRest(seg: string): boolean {
  return /^[\s—–-]*\d+\s*'{1,2}\s*(?:de\s+)?(?:rest|descanso|recuperaci[oó]n|recovery)\s*$/i.test(
    seg,
  );
}

// ── Intensity targets ────────────────────────────────────────────────────────

/** "RPE 8" / "RPE8" / "RPE 3-4" → a point or RANGE rpe Target + its verbatim
 *  text (for the note when another target wins the primary slot). Class-2 fix:
 *  ranges are read here so they can never masquerade as a rep sequence. */
export function parseRpeTarget(raw: string): { target: Target; text: string } | null {
  // The range's second number must be a BARE rpe value — "RPE8 – 45'' rest" is
  // a point RPE followed by a rest clock, not a range (the unit lookahead).
  const m = raw.match(/\brpe\s*(\d{1,2})(?:\s*[-–—]\s*(\d{1,2})(?!\d)(?!\s*['%]|\s*kg\b|\s*k?m\b))?/i);
  if (!m) return null;
  const lo = parseInt(m[1]!, 10);
  if (lo > 10) return null; // not a real RPE
  const hi = m[2] !== undefined ? parseInt(m[2], 10) : undefined;
  if (hi !== undefined && hi >= lo && hi <= 10) {
    return { target: { kind: 'rpe', min: lo, max: hi }, text: `RPE ${lo}-${hi}` };
  }
  return { target: { kind: 'rpe', value: lo }, text: `RPE ${lo}` };
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

/** Per-set rep scheme "10/10/8/8/6" or "10-10-8-6" → [10,10,8,8,6]. Intra-list
 *  separators carry NO spaces, so a spaced " / " never bleeds lists together.
 *  A sequence ending AT a quote is a clock range ("5-8' descanso"), not reps. */
export function parseRepSeq(raw: string): number[] | null {
  const m = raw.match(/(\d+(?:[/\-]\d+)+)(?!\s*')/);
  if (!m) return null;
  const parts = m[1]!.split(/[/\-]/).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
  return parts.length >= 2 ? parts : null;
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

/** Number of sets from "N rounds/rondas/series" or "Nr" anywhere in the seg. */
export function parseSetCount(raw: string): number | undefined {
  const m = raw.match(/(\d+)\s*(?:rounds|rondas|series|r)\b/i);
  return m ? parseInt(m[1]!, 10) : undefined;
}

/** "4x8" (sets × uniform reps) — reps capped at 2 digits so "2x1200" can never
 *  read as 1200 reps (3-4 digit values after x are DISTANCES, never reps), and
 *  NOT "4x6'" (interval) or "4x400m" (distance). */
export function parseSetsByReps(seg: string): { sets: number; reps: number } | null {
  const m = seg.match(/(\d+)\s*x\s*(\d{1,2})(?!\d)(?!\s*(?:'|''|m\b|km|cal|kg))/i);
  if (!m) return null;
  return { sets: parseInt(m[1]!, 10), reps: parseInt(m[2]!, 10) };
}
