import 'server-only';

import { hyresultRaceSchema, type HyresultRace } from '@fahybrid/shared/schema';
import { HYROX_CHROME_UA } from '../parse';
import { hyresultAthleteUrl } from './constants';

// =============================================================================
// hyresult.com athlete-profile parser.
//
// hyresult is a Next.js App Router site. The race history is NOT in
// __NEXT_DATA__ — it streams as React Flight chunks:
//   self.__next_f.push([1,"<json-string>"])
// We (1) decode + concat every chunk's JSON string payload, then (2) lift the
// `races` array out of the reconstructed flight text. The array sits deep in the
// element tree as a `races` prop, so it is NOT chunk-aligned — we locate it by
// the `"races":[{` anchor and read it with a string-aware balanced-bracket scan.
// A bare User-Agent is 403'd, so we reuse the official importer's Chrome UA.
// =============================================================================

const FETCH_TIMEOUT_MS = 15_000;

export class HyresultError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HyresultError';
  }
}

// Matches a JSON string literal robustly (handles escaped quotes/backslashes);
// newlines inside the payload are escaped, so this never over-/under-matches.
const FLIGHT_CHUNK_RE = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

/** Decode + concatenate the RSC flight payload from the page HTML. */
export function decodeFlight(html: string): string {
  let out = '';
  let m: RegExpExecArray | null;
  FLIGHT_CHUNK_RE.lastIndex = 0;
  while ((m = FLIGHT_CHUNK_RE.exec(html)) !== null) {
    try {
      out += JSON.parse(m[1]) as string;
    } catch {
      // Skip a single malformed chunk rather than fail the whole decode.
    }
  }
  return out;
}

/**
 * String-aware balanced scan of a JSON array starting at `start` (a '['). Returns
 * the array's source slice, or null when it never closes within `flight`
 * (truncated flight). Quotes/escapes are tracked so brackets inside strings are
 * ignored.
 */
function scanBalancedArray(flight: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < flight.length; i++) {
    const c = flight[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return flight.slice(start, i + 1);
    }
  }
  return null; // never balanced → truncated
}

/**
 * Extract the `races` array (array of race objects) from the flight text.
 * Anchored on `"races":[{` — the page's other `races` occurrences are a lazy
 * reference ("$L…") or scalar counts, never an array of objects.
 *
 * The page may render more than one array-of-objects `races` prop (e.g. a partial
 * "recent" list alongside the full history). We scan ALL anchors, balance + parse
 * each, and return the LARGEST valid array — the full history. Returns [] when no
 * anchor exists (0-race profile); throws HyresultError when anchors exist but none
 * yields a valid array (truncated/garbled flight).
 */
export function extractRacesArray(flight: string): unknown[] {
  const anchorRe = /"races":\s*\[\s*\{/g;
  let best: unknown[] | null = null;
  let sawAnchor = false;
  let truncated = false;
  let m: RegExpExecArray | null;
  anchorRe.lastIndex = 0;
  while ((m = anchorRe.exec(flight)) !== null) {
    sawAnchor = true;
    const start = flight.indexOf('[', m.index);
    if (start === -1) continue;
    const json = scanBalancedArray(flight, start);
    if (json === null) {
      truncated = true; // this anchor ran off the end; try the next
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      continue; // not valid JSON at this anchor; try the next
    }
    if (Array.isArray(parsed) && (best === null || parsed.length > best.length)) {
      best = parsed;
    }
  }
  if (best !== null) return best;
  if (!sawAnchor) return []; // 0-race profile — honest empty, not an error
  // Anchor(s) present but none parsed to an array → the flight is incomplete.
  throw new HyresultError(
    'parse_failed',
    truncated
      ? 'No se pudo leer el historial (RSC incompleto).'
      : 'No se pudo leer el historial (JSON).',
  );
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': HYROX_CHROME_UA, Accept: 'text/html' },
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
    });
    // 404 = the slug has no hyresult profile (athlete not found) — a distinct,
    // client-actionable case the route maps to 404, NOT a 502 upstream failure.
    if (res.status === 404) {
      throw new HyresultError('not_found', 'No se encontró el atleta en hyresult.');
    }
    if (!res.ok) {
      throw new HyresultError('fetch_failed', `No se pudo descargar el perfil (HTTP ${res.status}).`);
    }
    return await res.text();
  } catch (err) {
    if (err instanceof HyresultError) throw err;
    throw new HyresultError('fetch_failed', 'No se pudo conectar con hyresult.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch an athlete profile by slug and return its FULL race history, validated.
 * A single malformed historical race is skipped (best-effort across a long
 * history); the caller can compare the returned count against expectations.
 */
export async function fetchAthleteRaces(slug: string): Promise<HyresultRace[]> {
  const html = await fetchHtml(hyresultAthleteUrl(slug));
  const flight = decodeFlight(html);
  const raw = extractRacesArray(flight);
  const races: HyresultRace[] = [];
  for (const item of raw) {
    const parsed = hyresultRaceSchema.safeParse(item);
    if (parsed.success) races.push(parsed.data);
  }
  return races;
}
