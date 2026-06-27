// HYROX catalog adapter — https://hyrox.com/find-my-race/
//
// The official "find my race" page is server-rendered WordPress (the Impreza/UX
// Builder theme). A single GET with a browser UA returns ALL worldwide events
// (~72) as `.w-grid-item.event` cards. We parse each card's published fields and
// emit nothing we can't read:
//
//   name      .post_title                                   "Leapmotor HYROX Barcelona"
//   start     .event_date_1 .w-post-elm-value               "11. Nov. 2026"
//   end       .event_date_3 .w-post-elm-value               "15. Nov. 2026" (absent → single-day)
//   city code .event_city_letter_code .w-post-elm-value     "BCN"
//   permalink a[href*="/event/"]                            ".../event/hyrox-barcelona-2/"
//
// Cards tag continent only, so country is derivable for Spanish venues only
// (Pablo's cohort) — everything else is honest-null. A card with no date is a
// not-yet-announced venue → is_tentative=true, start_date=null (never invented).
//
// VERIFIED live (2026-06-27): 72 cards, incl. HYROX Tenerife 4–6 Sep (TNF),
// HYROX Valencia 15–18 Oct (VLC), Leapmotor HYROX Barcelona 11–15 Nov (BCN).

import { load } from 'cheerio';
import type { CatalogEvent, CatalogSource } from './types';
import { fetchHtml } from './http';
import { cleanText, parseEnglishDate, spainAlpha2 } from './normalize';

const HYROX_HOST = 'hyrox.com';
const HYROX_URL = `https://${HYROX_HOST}/find-my-race/`;

/**
 * Pull the stable event slug from a HYROX permalink:
 *   "https://hyrox.com/event/hyrox-barcelona-2/" → "hyrox-barcelona-2".
 * Returns null for a non-event href so the card is skipped (no fabricated ref).
 */
function eventRefFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const m = href.match(/\/event\/([^/?#]+)/i);
  return m?.[1] ? m[1].toLowerCase() : null;
}

/**
 * Human city from a HYROX title: everything after the last "HYROX" token, with
 * a leading "Youngstars" qualifier stripped. "Leapmotor HYROX Barcelona" →
 * "Barcelona"; "HYROX Youngstars Valencia" → "Valencia". Null if nothing left.
 */
function cityFromName(name: string): string | null {
  const idx = name.toLowerCase().lastIndexOf('hyrox');
  if (idx === -1) return null;
  const tail = name.slice(idx + 'hyrox'.length).replace(/^\s*youngstars\s*/i, '');
  return cleanText(tail);
}

export function parseHyroxHtml(html: string): CatalogEvent[] {
  const $ = load(html);
  const byRef = new Map<string, CatalogEvent>();

  $('.w-grid-item.event').each((_i, el) => {
    const card = $(el);

    const href = card.find('a[href*="/event/"]').first().attr('href');
    const sourceRef = eventRefFromHref(href);
    if (!sourceRef) return; // no stable identity → can't upsert it safely

    const name = cleanText(card.find('.post_title').first().text());
    if (!name) return;

    const d1 = cleanText(
      card.find('.event_date_1 .w-post-elm-value').first().text(),
    );
    const d3 = cleanText(
      card.find('.event_date_3 .w-post-elm-value').first().text(),
    );
    const cityCode = cleanText(
      card.find('.event_city_letter_code .w-post-elm-value').first().text(),
    );

    const startDate = d1 ? parseEnglishDate(d1) : null;
    let endDate = d3 ? parseEnglishDate(d3) : null;
    // Guard against an end that predates the start (malformed card) — drop it
    // rather than store an impossible range.
    if (startDate && endDate && endDate < startDate) endDate = null;

    const city = cityFromName(name);
    const country = spainAlpha2({ cityCode, cityName: city });

    const event: CatalogEvent = {
      series: 'hyrox',
      name,
      city: city ?? cityCode, // fall back to the printed 3-letter code
      country,
      start_date: startDate,
      end_date: endDate,
      division_options: [], // not listed on the find-my-race card
      source_url: `https://${HYROX_HOST}/event/${sourceRef}/`,
      source_ref: sourceRef, // raw stable id; events.slug is derived in the upsert
      is_tentative: startDate === null,
    };

    // Dedup identical permalinks (a venue listed twice) — first card wins.
    if (!byRef.has(event.source_ref)) byRef.set(event.source_ref, event);
  });

  return [...byRef.values()];
}

export const hyroxSource: CatalogSource = {
  series: 'hyrox',
  label: 'HYROX (find-my-race)',
  allowedHosts: [HYROX_HOST],
  async fetchEvents(): Promise<CatalogEvent[]> {
    const html = await fetchHtml(HYROX_URL, { allowedHosts: [HYROX_HOST] });
    return parseHyroxHtml(html);
  },
};
