import 'server-only';

import * as cheerio from 'cheerio';
import {
  HYROX_RESULTS_HOST,
  STATION_INDEX_STATION,
  type HyroxStationSplit,
} from '@fahybrid/shared/schema';

// =============================================================================
// HYROX results.hyrox.com parser.
//
// The detail page is static, server-rendered HTML (~55KB). It is fetched with a
// FULL desktop Chrome User-Agent — a bare/short UA is rejected 403 by the AWS
// ELB UA filter. No headless browser, no JS, no cookies.
//
// The splits table keys off STABLE `f-*` CSS class suffixes (the visible label
// text is localized and unreliable). In a row the f-time_* class is on BOTH the
// <tr> and the value <td>, so we always select the VALUE cell as `td.f-time_NN`,
// then read the row's trailing rank cell from that td's parent <tr>.
// =============================================================================

// Full desktop Chrome UA. A short/bare UA → 403 (ELB filter). Keep current.
export const HYROX_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// The 8 HYROX stations in FIXED page order (f-time_11 … f-time_18) → their
// canonical 16-element station_index (2,4,…,16). This is the bridge to
// race_plan station_pacing / station_actuals. Labels are documentation only;
// the importer never trusts page label text.
export const HYROX_STATION_FCLASS: ReadonlyArray<{
  fclass: string;
  // canonical station_index (one of STATION_INDEX_STATION)
  index: number;
  label: string;
}> = [
  { fclass: 'f-time_11', index: STATION_INDEX_STATION[0], label: 'SkiErg 1000m' },
  { fclass: 'f-time_12', index: STATION_INDEX_STATION[1], label: 'Sled Push 50m' },
  { fclass: 'f-time_13', index: STATION_INDEX_STATION[2], label: 'Sled Pull 50m' },
  { fclass: 'f-time_14', index: STATION_INDEX_STATION[3], label: 'Burpee Broad Jump 80m' },
  { fclass: 'f-time_15', index: STATION_INDEX_STATION[4], label: 'Row 1000m' },
  { fclass: 'f-time_16', index: STATION_INDEX_STATION[5], label: 'Farmers Carry 200m' },
  { fclass: 'f-time_17', index: STATION_INDEX_STATION[6], label: 'Sandbag Lunges 100m' },
  { fclass: 'f-time_18', index: STATION_INDEX_STATION[7], label: 'Wall Balls' },
] as const;

// The 8 run-lap f-classes in order (run 1 … run 8).
export const HYROX_RUN_FCLASS: ReadonlyArray<string> = [
  'f-time_01',
  'f-time_02',
  'f-time_03',
  'f-time_04',
  'f-time_05',
  'f-time_06',
  'f-time_07',
  'f-time_08',
] as const;

// Detail-page meta cells, keyed off stable f-* suffixes (label text varies by
// language). Single source of truth for the selectors.
const FCLASS = {
  fullName: 'f-__fullname',
  bib: 'f-start_no_text',
  ageClass: 'f-_type_age_class',
  nation: 'f-__nation',
  meeting: 'f-__meeting',
  event: 'f-__event',
  overallRank: 'f-place_all',
  ageRank: 'f-place_age',
  finishNetto: 'f-time_finish_netto',
  runTotal: 'f-time_49',
  bestRunLap: 'f-time_50',
  roxzone: 'f-time_60',
} as const;

/**
 * Parse a HYROX time cell (HH:MM:SS or MM:SS) to seconds. Returns null for an
 * em-dash / empty / unparseable value (the page uses &ndash; / – for "no data").
 */
export function parseHmsToSeconds(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  // Strip tags + normalize the en/em-dash placeholders to empty.
  const text = raw
    .replace(/&ndash;|&mdash;|[–—]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  const parts = text.split(':').map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  let seconds = 0;
  for (const n of nums) seconds = seconds * 60 + n;
  return Math.round(seconds);
}

/** Parse a positive integer cell (rank, count) or null. */
function parsePositiveInt(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const m = raw.replace(/[^\d]/g, '');
  if (!m) return null;
  const n = Number(m);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Trim text, treating an em-dash-only / empty cell as null. */
function cleanText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const text = raw.replace(/&ndash;|&mdash;|[–—]/g, '').replace(/\s+/g, ' ').trim();
  return text || null;
}

// =============================================================================
// URL parsing + host allowlist (SSRF guard).
// =============================================================================

export interface HyroxResultRef {
  season: string; // path segment, e.g. "season-8"
  idp: string; // ?idp=… opaque per-event athlete id
  event: string; // ?event=… event code
}

export class HyroxParseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HyroxParseError';
  }
}

/**
 * Validate the host is EXACTLY results.hyrox.com (allowlist — blocks SSRF) and
 * extract { season, idp, event } from the detail URL. Throws HyroxParseError on
 * any deviation.
 */
export function parseHyroxUrl(rawUrl: string): HyroxResultRef {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HyroxParseError('invalid_url', 'URL no válida.');
  }
  if (url.protocol !== 'https:') {
    throw new HyroxParseError('invalid_host', 'El enlace debe ser https.');
  }
  // Exact host match — no subdomain wildcards, no userinfo tricks.
  if (url.hostname.toLowerCase() !== HYROX_RESULTS_HOST) {
    throw new HyroxParseError(
      'invalid_host',
      `El enlace debe ser de ${HYROX_RESULTS_HOST}.`,
    );
  }
  // Season is the first path segment: /season-8/
  const season = url.pathname.split('/').filter(Boolean)[0] ?? '';
  const idp = url.searchParams.get('idp') ?? '';
  const event = url.searchParams.get('event') ?? '';
  if (!/^season-\w[\w-]*$/.test(season)) {
    throw new HyroxParseError('invalid_url', 'No se reconoce la temporada en el enlace.');
  }
  if (!idp || !event) {
    throw new HyroxParseError(
      'invalid_url',
      'El enlace no es una página de resultado de atleta (faltan idp/event).',
    );
  }
  return { season, idp, event };
}

/** Build the canonical detail URL from a ref (used for storage + leaderboard). */
export function buildDetailUrl(ref: HyroxResultRef): string {
  const u = new URL(`https://${HYROX_RESULTS_HOST}/${ref.season}/`);
  u.searchParams.set('content', 'detail');
  u.searchParams.set('idp', ref.idp);
  u.searchParams.set('event', ref.event);
  return u.toString();
}

/** Build the leaderboard list URL for the gender field (for field_size). */
export function buildLeaderboardUrl(ref: HyroxResultRef, sex: 'M' | 'W'): string {
  const u = new URL(`https://${HYROX_RESULTS_HOST}/${ref.season}/`);
  u.searchParams.set('content', 'list');
  u.searchParams.set('event', ref.event);
  u.searchParams.set('num_results', '100');
  u.searchParams.set('search[sex]', sex);
  u.searchParams.set('search[age_class]', '%');
  return u.toString();
}

// =============================================================================
// HTML parsing.
// =============================================================================

export interface HyroxParsedDetail {
  name: string;
  bib: string | null;
  age_group: string | null;
  nationality: string | null;
  meeting: string | null; // race name, e.g. "2026 Amsterdam"
  event_label: string | null; // division label, e.g. "HYROX PRO - Overall"
  overall_rank: number | null;
  age_group_rank: number | null;
  finish_time_seconds: number;
  run_splits: number[]; // ordered, the runs that were present
  station_splits: HyroxStationSplit[]; // 8 stations, fixed order
  run_total_seconds: number | null;
  best_run_lap_seconds: number | null;
  roxzone_seconds: number | null;
  // Inferred division/gender (best-effort from the event label + code).
  division: 'open' | 'pro';
  gender_category: 'men' | 'women' | 'mixed';
}

// Read a cell's text by f-* class. We target the VALUE <td> (td.f-…) because the
// same f-class also sits on the parent <tr>; td.f-… is unambiguous.
function tdText($: cheerio.CheerioAPI, fclass: string): string | null {
  const el = $(`td.${fclass}`).first();
  if (el.length === 0) return null;
  return cleanText(el.text());
}

function tdTime($: cheerio.CheerioAPI, fclass: string): number | null {
  const el = $(`td.${fclass}`).first();
  if (el.length === 0) return null;
  return parseHmsToSeconds(el.text());
}

// For a station value cell td.f-time_NN, the RANK is the row's last <td>.
function stationRank($: cheerio.CheerioAPI, fclass: string): number | null {
  const valueTd = $(`td.${fclass}`).first();
  if (valueTd.length === 0) return null;
  const row = valueTd.closest('tr');
  const tds = row.find('td');
  // Rows are: <th>label</th> <td>value</td> <td>rank</td>. Rank = last td.
  const rankTd = tds.last();
  if (rankTd.length === 0 || rankTd.is(valueTd)) return null;
  return parsePositiveInt(rankTd.text());
}

/**
 * Parse a HYROX detail page (raw HTML) into a structured result. Throws
 * HyroxParseError if the finish time is absent (not a valid result page).
 */
export function parseHyroxDetail(html: string): HyroxParsedDetail {
  const $ = cheerio.load(html);

  const name = tdText($, FCLASS.fullName);
  const finish = tdTime($, FCLASS.finishNetto);
  if (!name || finish == null || finish <= 0) {
    throw new HyroxParseError(
      'parse_failed',
      'No se pudo leer el resultado (¿enlace de detalle correcto?).',
    );
  }

  const run_splits: number[] = [];
  for (const fclass of HYROX_RUN_FCLASS) {
    const s = tdTime($, fclass);
    if (s != null) run_splits.push(s);
  }

  const station_splits: HyroxStationSplit[] = HYROX_STATION_FCLASS.map((st) => ({
    index: st.index,
    seconds: tdTime($, st.fclass),
    rank: stationRank($, st.fclass),
  }));

  const eventLabel = tdText($, FCLASS.event);
  const division: 'open' | 'pro' = /\bpro\b/i.test(eventLabel ?? '') ? 'pro' : 'open';

  return {
    name,
    bib: tdText($, FCLASS.bib),
    age_group: tdText($, FCLASS.ageClass),
    nationality: tdText($, FCLASS.nation),
    meeting: tdText($, FCLASS.meeting),
    event_label: eventLabel,
    overall_rank: parsePositiveInt(tdText($, FCLASS.overallRank)),
    age_group_rank: parsePositiveInt(tdText($, FCLASS.ageRank)),
    finish_time_seconds: finish,
    run_splits,
    station_splits,
    run_total_seconds: tdTime($, FCLASS.runTotal),
    best_run_lap_seconds: tdTime($, FCLASS.bestRunLap),
    roxzone_seconds: tdTime($, FCLASS.roxzone),
    division,
    // Detail page doesn't expose gender directly; inferred at the endpoint from
    // the leaderboard probe (M vs W field). Default 'men' until refined there.
    gender_category: 'men',
  };
}

/** Extract the field size ("456 Results") from a leaderboard list page. */
export function parseFieldSize(html: string): number | null {
  const $ = cheerio.load(html);
  const el = $('.list-info__text.str_num').first();
  const text = el.length ? el.text() : '';
  const n = parsePositiveInt(text);
  return n;
}
