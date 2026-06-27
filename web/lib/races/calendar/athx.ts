// ATHX catalog adapter — https://athxgames.com/events
//
// The official events page is server-rendered Laravel. A single GET with a
// browser UA returns ALL announced events as `div.relative.isolate.overflow-hidden`
// cards. We parse each card's published fields and emit nothing we can't read:
//
//   name     .font-bold.text-2xl                          "ATHX COPENHAGEN 2026"
//   dates    .font-medium.text-xl (no icon)               "15 Aug 2026" / "22 - 23 Aug 2026"
//   venue    .font-medium.text-xl.flex .ml-2 > div        "Bella Centre" (a venue, not a city)
//   country  .font-medium.text-xl.flex .ml-2 span         "Denmark" (+ a flag emoji span)
//   permalink a[href*="/events/{ULID}"]                    .../events/01k8b7kghhb3nk1h7gvshdxsjw
//
// The ULID in the event permalink is the STABLE source_ref (re-scraping upserts
// the same row). The card prints a VENUE, not a city, so the human city is taken
// from the name ("ATHX COPENHAGEN 2026" → "Copenhagen"). Every card prints a full
// country name, resolved to ISO-2 via the shared map. A card with no event
// permalink has no stable identity and is skipped (never fabricated) — note the
// media-asset ULID embedded in the card image is NOT the event ULID.
//
// VERIFIED live (2026-06-27): 32 cards rendered, 31 emitted (all with a resolved
// country and a real date); 1 — "ATHX COPENHAGEN 2027" — skipped: it carries no
// event permalink, only an image whose ULID is a media id, not the event id.

import { load } from 'cheerio';
import type { CatalogEvent, CatalogSource } from './types';
import { fetchHtml } from './http';
import { cleanText, countryNameToAlpha2, parseEnglishDate } from './normalize';

const ATHX_HOST = 'athxgames.com';
const ATHX_URL = `https://${ATHX_HOST}/events`;

// ATHX event ids are 26-char Crockford ULIDs. The permalink is
// /events/{ULID} (optionally with a /participant-types tail).
const ULID_IN_HREF = /\/events\/([0-9a-z]{26})(?:\/[a-z-]*)?(?:[?#]|$)/i;

/**
 * Pull the stable event ULID from any ATHX events href on the card:
 *   ".../events/01k8b7kghhb3nk1h7gvshdxsjw"               → "01k8b7kghhb3nk1h7gvshdxsjw"
 *   ".../events/01k8b7kghhb3nk1h7gvshdxsjw/participant-types" → same ULID
 * Returns null for a non-event href so the card is skipped (no fabricated ref).
 */
function ulidFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const m = href.match(ULID_IN_HREF);
  return m?.[1] ? m[1].toLowerCase() : null;
}

/**
 * Human city from an ATHX title: the token between the "ATHX" brand prefix and
 * the trailing year. "ATHX COPENHAGEN 2026" → "Copenhagen"; "ATHX ST GALLEN
 * 2027" → "St Gallen". The source renders all-caps, so we title-case for a
 * catalog consistent with the other sources. Null if nothing is left.
 */
function cityFromName(name: string): string | null {
  const middle = cleanText(
    name.replace(/^\s*ATHX\s+/i, '').replace(/\s+\d{4}\s*$/, ''),
  );
  if (!middle) return null;
  return middle
    .toLowerCase()
    .replace(/\b([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/**
 * Parse the card's single date string into start/end ISO dates. ATHX prints one
 * line: a single day ("15 Aug 2026") or a range whose right side always carries
 * the full "DD Mon YYYY" while the left side may omit the month and/or year:
 *   "22 - 23 Aug 2026"   → 2026-08-22 .. 2026-08-23
 *   "31 Jul - 01 Aug 2027" → 2027-07-31 .. 2027-08-01
 * Missing month/year are borrowed from the right side. Returns nulls (never an
 * invented date) when a component can't be read. A cross-year range where the
 * borrow can't be trusted — e.g. "31 Dec - 01 Jan 2027", which would wrongly read
 * as 2027-12-31 — yields an honest-null start (caller flags is_tentative) instead
 * of a fabricated/wrong date; the cleanly-read end is kept.
 */
function parseAthxDates(raw: string | null): {
  start: string | null;
  end: string | null;
} {
  if (!raw) return { start: null, end: null };

  const parts = raw.split(/\s+[-–—]\s+/);
  if (parts.length === 1) {
    return { start: parseEnglishDate(raw), end: null };
  }

  const [left, right] = parts;
  const end = parseEnglishDate(right);

  // Borrow the right side's month/year for the left side when it omits them.
  const year = right.match(/\b(\d{4})\b/)?.[1];
  const month = right.replace(/\d+/g, ' ').match(/[A-Za-z]{3,}/)?.[0];
  let leftFull = left.trim();
  if (!/[A-Za-z]/.test(leftFull) && month) leftFull = `${leftFull} ${month}`;
  if (!/\d{4}/.test(leftFull) && year) leftFull = `${leftFull} ${year}`;

  const start = parseEnglishDate(leftFull);

  // Cross-year (or reversed) range: borrowing the right side's year placed the
  // start AFTER the end — e.g. "31 Dec - 01 Jan 2027" reads as 2027-12-31. The
  // borrowed year is wrong and we will NOT guess one, so the start is honest-null
  // (caller flags is_tentative); the independently-read end stays.
  if (start && end && start > end) return { start: null, end };

  return { start, end };
}

export function parseAthxHtml(html: string): CatalogEvent[] {
  const $ = load(html);
  const byRef = new Map<string, CatalogEvent>();

  $('div.relative.isolate.overflow-hidden').each((_i, el) => {
    const card = $(el);

    let sourceRef: string | null = null;
    card.find('a[href*="/events/"]').each((_j, a) => {
      if (sourceRef) return;
      sourceRef = ulidFromHref($(a).attr('href'));
    });
    if (!sourceRef) return; // no stable identity → can't upsert it safely

    const name = cleanText(card.find('.font-bold.text-2xl').first().text());
    if (!name) return;

    // The date line is the .font-medium.text-xl that has no icon (the venue line
    // is also .font-medium.text-xl but carries the location-pin <img>).
    const dateRaw = cleanText(
      card.find('.font-medium.text-xl').not(':has(img)').first().text(),
    );
    const { start, end: rawEnd } = parseAthxDates(dateRaw);
    // Guard against an end that predates the start (malformed card).
    const end = start && rawEnd && rawEnd < start ? null : rawEnd;

    const countryName = cleanText(
      card.find('.font-medium.text-xl.flex .ml-2 span').first().text(),
    );
    const country = countryNameToAlpha2(countryName);

    const event: CatalogEvent = {
      series: 'athx',
      name,
      city: cityFromName(name),
      country,
      start_date: start,
      end_date: end,
      division_options: [], // not listed on the events card
      source_url: `https://${ATHX_HOST}/events/${sourceRef}`,
      source_ref: sourceRef, // raw stable ULID; events.slug is derived in the upsert
      is_tentative: start === null,
    };

    // Dedup identical events (a venue listed twice) — first card wins.
    if (!byRef.has(event.source_ref)) byRef.set(event.source_ref, event);
  });

  return [...byRef.values()];
}

export const athxSource: CatalogSource = {
  series: 'athx',
  label: 'ATHX (events)',
  allowedHosts: [ATHX_HOST],
  async fetchEvents(): Promise<CatalogEvent[]> {
    const html = await fetchHtml(ATHX_URL, { allowedHosts: [ATHX_HOST] });
    return parseAthxHtml(html);
  },
};
