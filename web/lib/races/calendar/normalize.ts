// Race-catalog scraper — shared, source-agnostic normalizers.
//
// Pure functions reused across adapters: month parsing, slug + catalog-key
// construction, series→legacy-type mapping, country→region derivation, and a
// conservative country/Spain detector. Everything here is deterministic and
// fabrication-free: a value that can't be derived from the input returns null.

import type { EventRegion } from '@fahybrid/shared/schema/events';
import type { CatalogSeries } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Dates
// ─────────────────────────────────────────────────────────────────────────────

// English month tokens → 1-based month number. Covers 3-letter abbreviations
// (HYROX/DEKA render "Sep", "Oct") and full names, case-insensitively. "Sept"
// and "March"/"April"/etc. full forms included for tolerance across sources.
const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Map an English month token (any case, with/without trailing dot) to 1-12, or null. */
export function monthToNumber(token: string): number | null {
  const key = token.trim().toLowerCase().replace(/\.+$/, '');
  return MONTHS[key] ?? null;
}

/** Compose an ISO date from numeric parts, validating ranges. Null if invalid. */
export function toIsoDate(
  year: number,
  month: number,
  day: number,
): string | null {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Parse a "day month year" English date with arbitrary separators / dots, e.g.
 * "15. Oct. 2026", "4 Sep 2026", "11. November 2026" → "2026-10-15". Returns
 * null when any component is missing or unrecognised (caller treats null date
 * as tentative — never invents one).
 */
export function parseEnglishDate(raw: string): string | null {
  if (!raw) return null;
  // Tokenise on dots, commas and whitespace; keep word/number tokens.
  const tokens = raw
    .replace(/(\d+)(st|nd|rd|th)\b/gi, '$1') // strip ordinals: "15th" → "15"
    .split(/[\s.,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  for (const t of tokens) {
    if (/^\d{1,2}$/.test(t) && day === null && month === null) {
      // A 1-2 digit number seen before the month is the day (DMY order, which
      // is what every target source renders).
      day = Number(t);
      continue;
    }
    if (/^\d{1,2}$/.test(t) && day !== null && month !== null && year === null) {
      continue; // stray small number after we have day+month — ignore
    }
    if (/^\d{4}$/.test(t) && year === null) {
      year = Number(t);
      continue;
    }
    const m = monthToNumber(t);
    if (m !== null && month === null) {
      month = m;
      continue;
    }
  }

  if (day === null || month === null || year === null) return null;
  return toIsoDate(year, month, day);
}

// ─────────────────────────────────────────────────────────────────────────────
// Identity (slug / catalog key)
// ─────────────────────────────────────────────────────────────────────────────

/** Lowercase, ASCII-fold, collapse to [a-z0-9-]. Stable for a given input. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/**
 * Deterministic, globally-unique `events.slug` for a scraped row. Since
 * (series, source_ref) is unique per migration 0077, prefixing the series makes
 * `${series}-${source_ref}` unique across the whole catalog. Only ever set on
 * INSERT — a coach who edits the slug later is never overwritten.
 */
export function catalogSlug(series: CatalogSeries, sourceRef: string): string {
  const ref = slugify(sourceRef) || 'event';
  return slugify(`${series}-${ref}`);
}

/** Collapse runs of whitespace and trim. Empty → null. */
export function cleanText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Series → legacy `events.type` enum
// ─────────────────────────────────────────────────────────────────────────────

// The granular dimension is `series`; the legacy `events.type` enum is coarse
// ('hyrox' | 'crossfit' | 'other'). Everything that isn't HYROX maps to 'other'.
export function seriesToEventType(
  series: CatalogSeries,
): 'hyrox' | 'crossfit' | 'other' {
  return series === 'hyrox' ? 'hyrox' : 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Country / region
// ─────────────────────────────────────────────────────────────────────────────

// ISO 3166-1 alpha-2 → coarse region bucket used by `events.region` (migration
// 0012). Only the buckets the picker filters on. Unmapped country → null region.
const ALPHA2_TO_REGION: Record<string, EventRegion> = {
  // EU
  ES: 'EU', PT: 'EU', FR: 'EU', IT: 'EU', DE: 'EU', GB: 'EU', IE: 'EU',
  NL: 'EU', BE: 'EU', CH: 'EU', AT: 'EU', PL: 'EU', SE: 'EU', NO: 'EU',
  DK: 'EU', FI: 'EU', GR: 'EU', HU: 'EU', CZ: 'EU',
  // NA
  US: 'NA', CA: 'NA',
  // LATAM
  MX: 'LATAM', BR: 'LATAM', AR: 'LATAM', CL: 'LATAM', CO: 'LATAM',
  // APAC
  AU: 'APAC', NZ: 'APAC', SG: 'APAC', JP: 'APAC', CN: 'APAC', HK: 'APAC',
  KR: 'APAC', IN: 'APAC', ID: 'APAC', TH: 'APAC', MY: 'APAC',
  // MEA
  AE: 'MEA', SA: 'MEA', ZA: 'MEA', EG: 'MEA', IL: 'MEA',
};

/** Region bucket for an ISO-2 country code, or null when unknown. */
export function regionForCountry(alpha2: string | null): EventRegion | null {
  if (!alpha2) return null;
  return ALPHA2_TO_REGION[alpha2.toUpperCase()] ?? null;
}

// Common country NAMES (as official sites print them) → ISO-2. Conservative:
// only unambiguous mappings. Used by sources that print a full country name.
const COUNTRY_NAME_TO_ALPHA2: Record<string, string> = {
  spain: 'ES', españa: 'ES', espana: 'ES',
  portugal: 'PT',
  france: 'FR',
  italy: 'IT', italia: 'IT',
  germany: 'DE', deutschland: 'DE',
  'united kingdom': 'GB', 'great britain': 'GB', uk: 'GB', england: 'GB',
  scotland: 'GB', wales: 'GB',
  ireland: 'IE',
  netherlands: 'NL',
  belgium: 'BE',
  switzerland: 'CH',
  austria: 'AT',
  poland: 'PL',
  sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI',
  greece: 'GR', hungary: 'HU',
  'united states': 'US', usa: 'US', 'united states of america': 'US',
  canada: 'CA',
  mexico: 'MX', méxico: 'MX', brazil: 'BR', brasil: 'BR', argentina: 'AR',
  chile: 'CL', colombia: 'CO',
  australia: 'AU', 'new zealand': 'NZ', singapore: 'SG', japan: 'JP',
  china: 'CN', 'hong kong': 'HK', 'south korea': 'KR', korea: 'KR',
  india: 'IN', indonesia: 'ID', thailand: 'TH', malaysia: 'MY',
  'united arab emirates': 'AE', uae: 'AE', 'saudi arabia': 'SA',
  'south africa': 'ZA', egypt: 'EG', israel: 'IL',
};

/** Best-effort ISO-2 from a printed country name. Null when not confidently known. */
export function countryNameToAlpha2(name: string | null): string | null {
  if (!name) return null;
  return COUNTRY_NAME_TO_ALPHA2[name.trim().toLowerCase()] ?? null;
}

// Spain detection for sources that only tag a continent (HYROX). HYROX prints an
// IATA-style 3-letter city CODE on every card (verified live 2026-06-27: all 72
// cards carry one), and IATA codes are globally unique — so a code in this set is
// a RELIABLE Spain signal. A city NAME is NOT: the same name recurs across
// countries (Valencia ES/VE, Granada ES/NI, León ES/MX, …), so we never
// country-stamp from a name. Pablo's cohort is Barcelona-based, so Spanish venues
// are the ones we positively stamp; everything else stays honest-null until a
// source exposes its country outright.
const SPAIN_CITY_CODES = new Set([
  'BCN', 'MAD', 'VLC', 'SVQ', 'AGP', 'BIO', 'ZAZ', 'TNF', 'TFN', 'TFS',
  'LPA', 'MJV', 'VGO', 'LCG', 'VIT', 'PMI', 'ALC', 'GRX', 'SDR', 'XRY',
]);

/**
 * ES when a HYROX city CODE is a known Spanish venue, else null. We stamp ONLY
 * from the reliable code — never from an ambiguous city name (the same name maps
 * to several countries) — so an unrecognised code is honest-null, never a guess.
 */
export function spainAlpha2(opts: { cityCode?: string | null }): string | null {
  const code = opts.cityCode?.trim().toUpperCase();
  if (code && SPAIN_CITY_CODES.has(code)) return 'ES';
  return null;
}
