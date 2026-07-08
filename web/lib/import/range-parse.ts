/**
 * Parse a coach's natural-language week selection into a concrete list of week
 * numbers, for the plan importer (#28).
 *
 * A "week range" the coach types is one of three shapes:
 *   1. RANGE   — two weeks joined by a connector: "de la 1 a la 4", "1-4",
 *                "semanas 1 hasta 4"  → inclusive [1,2,3,4].
 *   2. SINGLE  — one week: "solo la semana 1", "la semana 1", "1"  → [1].
 *   3. LIST    — explicit weeks separated by comma / "y" / "e":
 *                "semanas 1, 3 y 5"  → [1,3,5].
 *
 * Trailing prose is tolerated ("1 a 4, que es este microciclo" → [1,2,3,4]).
 * Anything else (no week found, out of the 1..12 season, ambiguous) returns an
 * `{ error }` the caller can surface verbatim. Pure — no I/O — so it is unit
 * tested in isolation.
 */

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
