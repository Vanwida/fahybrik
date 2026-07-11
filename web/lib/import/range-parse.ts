/**
 * Parse a coach's natural-language destination for the plan importer (#28). Two
 * granularities, one per import source:
 *
 *   · `parseWeekRange` — the EXCEL flow imports whole weeks, so the coach picks a
 *     RANGE of week numbers ("de la 1 a la 4" → [1,2,3,4]).
 *   · `parseDayDestination` — the PASTE flow imports a single session, so the
 *     destination is one concrete DAY = a week + a weekday ("semana 1 jueves" →
 *     { week: 1, weekday: 4 }). The UI drives this with a structured selector;
 *     the parser is the tolerant fallback for a free-typed hint.
 *
 * Pure — no I/O — so both are unit tested in isolation.
 */

import { DAY_LABELS_FULL } from '@/lib/dashboard/constants/calendar';

/** The season is a fixed 12-week template; weeks live in [1..12]. */
export const MIN_WEEK = 1;
export const MAX_WEEK = 12;

export type WeekRangeResult = { weeks: number[] } | { error: string };

/** Lowercase + strip accents + collapse whitespace, so matching is robust to
 * "Sólo", "número", double spaces, etc. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining accents
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A RANGE = two 1–2 digit numbers joined by a connector. The connector is
 * either a dash (1-4) or a range word (a / al / hasta) as a whole word. Between
 * the connector and the second number we tolerate filler the coach naturally
 * types: "la"/"el"/"semana(s)" ("de la 1 a la 4", "1 a la semana 4"). We take
 * the FIRST such match, so trailing prose after the range is ignored.
 */
const RANGE_RE =
  /(\d{1,2})\s*(?:[-–—]\s*|\b(?:a|al|hasta)\b\s+)(?:(?:la|el)\s+)?(?:semanas?\s+)?(?:(?:la|el)\s+)?(\d{1,2})/;

/** List separators: comma, or the Spanish "y"/"e" conjunctions as whole words. */
const LIST_SEP_RE = /,|\b(?:y|e)\b/;

/** Every 1–2 digit run in the text. */
const NUMBER_RE = /\d{1,2}/g;

function inBounds(w: number): boolean {
  return Number.isInteger(w) && w >= MIN_WEEK && w <= MAX_WEEK;
}

function boundsError(weeks: number[]): string | null {
  const bad = weeks.find((w) => !inBounds(w));
  if (bad === undefined) return null;
  return `La semana ${bad} está fuera de la temporada (${MIN_WEEK}–${MAX_WEEK}).`;
}

/**
 * A week RANGE the coach types is one of three shapes:
 *   1. RANGE   — two weeks joined by a connector: "de la 1 a la 4", "1-4" → [1..4].
 *   2. SINGLE  — one week: "solo la semana 1", "1" → [1].
 *   3. LIST    — explicit weeks: "semanas 1, 3 y 5" → [1,3,5].
 * Trailing prose is tolerated; out-of-season / ambiguous input returns `{ error }`.
 */
export function parseWeekRange(text: string): WeekRangeResult {
  const norm = normalize(text ?? '');
  if (!norm) return { error: 'No indicaste ninguna semana.' };

  // 1) RANGE takes priority — a connector between two numbers is unambiguous
  //    intent, even with prose trailing it ("1 a 4, que es este microciclo").
  const range = norm.match(RANGE_RE);
  if (range) {
    const a = Number.parseInt(range[1]!, 10);
    const b = Number.parseInt(range[2]!, 10);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const weeks = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const err = boundsError(weeks);
    if (err) return { error: err };
    return { weeks };
  }

  // 2) No connector → SINGLE or an explicit LIST.
  const nums = (norm.match(NUMBER_RE) ?? []).map((n) => Number.parseInt(n, 10));
  if (nums.length === 0) {
    return { error: `No reconocí ninguna semana en "${text}".` };
  }
  if (nums.length === 1) {
    const err = boundsError(nums);
    if (err) return { error: err };
    return { weeks: nums };
  }

  // Multiple numbers with no range connector: only a real list (comma / "y")
  // is unambiguous. Otherwise we refuse rather than guess.
  if (!LIST_SEP_RE.test(norm)) {
    return {
      error: `No entendí qué semanas quieres en "${text}". Prueba "de la 1 a la 4" o "semanas 1, 3 y 5".`,
    };
  }
  const weeks = [...new Set(nums)].sort((x, y) => x - y);
  const err = boundsError(weeks);
  if (err) return { error: err };
  return { weeks };
}

// ── Single-day destination (PASTE flow) ─────────────────────────────────────────

export type DayDestinationResult =
  | { week: number | null; weekday: number }
  | { error: string };

/** Accent-stripped weekday names, index+1 == weekday (1=Lunes … 7=Domingo). */
const DAY_NAME_NORM = DAY_LABELS_FULL.map((d) => normalize(d));

/** A weekday given as "día 4" / "dia 4" (1..7). */
const DAY_NUMBER_RE = /\bdias?\s+([1-7])\b/;

/**
 * Parse a single-day destination: a weekday (required) plus an optional week.
 * Accepts "semana 1 jueves", "semana 1 día 4", "s1 jueves", "jueves" (week null).
 * The weekday is either a Spanish day name or "día N"; the week is the first 1–2
 * digit number left once the weekday token is removed ("semana"/"s" is just prose
 * around it). Returns `{ error }` when no weekday is present or the week is out of
 * season — the caller surfaces it verbatim.
 */
export function parseDayDestination(text: string): DayDestinationResult {
  const norm = normalize(text ?? '');
  if (!norm) return { error: 'No indicaste el día.' };

  let weekday: number | null = null;
  let remainder = norm;

  // (a) A weekday NAME ("jueves").
  for (let i = 0; i < DAY_NAME_NORM.length; i++) {
    const re = new RegExp(`\\b${DAY_NAME_NORM[i]}\\b`);
    if (re.test(norm)) {
      weekday = i + 1;
      remainder = norm.replace(re, ' ');
      break;
    }
  }
  // (b) Or a weekday NUMBER ("día 4").
  if (weekday === null) {
    const m = norm.match(DAY_NUMBER_RE);
    if (m) {
      weekday = Number.parseInt(m[1]!, 10);
      remainder = norm.replace(m[0], ' ');
    }
  }
  if (weekday === null) {
    return {
      error: `No reconocí el día en "${text}". Prueba "semana 1 jueves" o "semana 1 día 4".`,
    };
  }

  // The week is optional: the first 1–2 digit number left after removing the day.
  const wk = remainder.match(NUMBER_RE);
  if (!wk || wk.length === 0) return { week: null, weekday };
  const week = Number.parseInt(wk[0]!, 10);
  if (!inBounds(week)) {
    return { error: `La semana ${week} está fuera de la temporada (${MIN_WEEK}–${MAX_WEEK}).` };
  }
  return { week, weekday };
}
