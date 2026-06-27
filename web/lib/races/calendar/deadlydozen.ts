// Deadly Dozen catalog adapter — https://www.deadlydozen.com/
//
// SCRAPEABILITY (verified live 2026-06-27 — read this before "fixing" the low
// event count): Deadly Dozen is a Squarespace marketing site whose actual
// race calendar (the per-city Track / Gym / Sprint / Youth races) is NOT in
// any server-rendered HTML. Those listings live behind two client-rendered
// Next.js apps — waves.deadlydozen.com ("Loading events...") and
// championships.deadlydozen.com ("Loading...") — that fetch their data over an
// undocumented JSON API at runtime. A pure HTML scraper cannot read them
// without a headless browser, so we deliberately do NOT touch them.
//
// What IS statically readable is Deadly Dozen's marquee events: the dedicated
// Championship pages on the apex marketing host. Each is a normal Squarespace
// page with a stable permalink (og:url) and a "<Name> 2026 - Race Details ..."
// title. The fixture, when announced, is one sentence of prose:
//   "Taking place 5–6 September 2026 at the National Sports Centre,
//    Crystal Palace, London, the Championships will crown the world's best..."
// We anchor strictly on that "Taking place … at …" phrase (never a loose date
// regex — the same pages also print qualification-window deadlines we must NOT
// mistake for the fixture). A Championship page with no such sentence is a
// genuinely announced-but-undated event → start_date=null, is_tentative=true.
//
// The 3 JSON-LD blocks every page carries are boilerplate WebSite / Organization
// / LocalBusiness — none are schema.org Event — so they give us nothing.
//
// VERIFIED live (2026-06-27): 2 events — Deadly Dozen World Championships 2026
// (5–6 Sep 2026, London) dated; Deadly Dozen UK Championships 2026 tentative
// (page live, date not yet published). The wider city race calendar is, by the
// site's architecture, not statically scrapeable.

import { load } from 'cheerio';
import type { CatalogEvent, CatalogSource } from './types';
import { fetchHtml } from './http';
import {
  cleanText,
  countryNameToAlpha2,
  monthToNumber,
  parseEnglishDate,
  toIsoDate,
} from './normalize';

const DDZ_HOST = 'deadlydozen.com';
// Only the apex marketing host serves static HTML; the championships.* / waves.*
// subdomains are client-rendered apps with no server-side event data to read.
const DDZ_APEX = `www.${DDZ_HOST}`;
const DDZ_HOME = `https://${DDZ_APEX}/`;

/**
 * Parse a Deadly Dozen fixture date. Their copy uses a shared-month day range
 * ("5–6 September 2026" → 5th + 6th), so try that first; fall back to a single
 * "5 September 2026". Returns honest-null parts when nothing parses — the caller
 * never invents a date.
 */
function parseDateRange(raw: string | null): {
  start: string | null;
  end: string | null;
} {
  const text = cleanText(raw);
  if (!text) return { start: null, end: null };

  // "5–6 September 2026" / "5-6 September 2026" — en/em-dash or hyphen, one month.
  const range = text.match(
    /(\d{1,2})\s*[–—-]\s*(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/,
  );
  if (range) {
    const month = monthToNumber(range[3]);
    if (month !== null) {
      const year = Number(range[4]);
      const start = toIsoDate(year, month, Number(range[1]));
      const end = toIsoDate(year, month, Number(range[2]));
      if (start) return { start, end: end && end >= start ? end : null };
    }
  }

  return { start: parseEnglishDate(text), end: null };
}

/**
 * Pull the fixture date + venue out of the one announcement sentence:
 *   "Taking place <date> at <venue>, the Championships will …"
 * Anchored on "Taking place" so we never pick up the qualification-window or
 * notification dates printed elsewhere on the same page.
 */
function extractWhenWhere(bodyText: string): {
  dateRaw: string | null;
  location: string | null;
} {
  const m = bodyText.match(
    /Taking place\s+(.+?)\s+at\s+(.+?)(?:,\s+the\s|\.\s|$)/i,
  );
  if (!m) return { dateRaw: null, location: null };
  return { dateRaw: cleanText(m[1]), location: cleanText(m[2]) };
}

/**
 * Split the venue phrase into city + country. If the last comma segment is a
 * recognised country NAME it becomes the country and the city is the segment
 * before it; otherwise the last segment is the city and the country stays
 * honest-null — we never infer a country from a bare city name.
 */
function cityCountryFromLocation(location: string | null): {
  city: string | null;
  country: string | null;
} {
  if (!location) return { city: null, country: null };
  const segments = location
    .split(',')
    .map((s) => cleanText(s))
    .filter((s): s is string => s !== null);
  if (segments.length === 0) return { city: null, country: null };

  let cityIdx = segments.length - 1;
  let country: string | null = null;
  const lastAsCountry = countryNameToAlpha2(segments[cityIdx]);
  if (lastAsCountry) {
    country = lastAsCountry;
    cityIdx -= 1; // the city is the segment before the country
  }
  return { city: cityIdx >= 0 ? segments[cityIdx] : null, country };
}

/**
 * Recover the clean event name from a Squarespace title:
 *   "Deadly Dozen World Championships 2026 - Race Details & More — Deadly Dozen…"
 * → "Deadly Dozen World Championships 2026". Drop the " — <site name>" suffix,
 * then the " - <marketing tail>".
 */
function eventNameFromTitle(title: string | null): string | null {
  const t = cleanText(title);
  if (!t) return null;
  return cleanText(t.split('—')[0].split(/\s-\s/)[0]);
}

/** Stable per-source ref = the page's permalink slug ("uk-championship-2026"). */
function slugFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
    return path ? path.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Parse ONE Deadly Dozen Championship page into a single CatalogEvent (or [] if
 * the page is not a readable Championship event — formats, blog, the homepage
 * and the client-rendered race apps all fall through to []). Pure: identity and
 * fields come only from the page's own og:url / title / announcement prose.
 */
export function parseDeadlyDozenHtml(html: string): CatalogEvent[] {
  const $ = load(html);

  const permalink =
    cleanText($('meta[property="og:url"]').attr('content')) ??
    cleanText($('link[rel="canonical"]').attr('href'));
  if (!permalink) return []; // no stable identity → can't upsert safely

  const sourceRef = slugFromUrl(permalink);
  if (!sourceRef) return [];

  const title =
    cleanText($('meta[property="og:title"]').attr('content')) ??
    cleanText($('title').text());
  // Championships are the only events Deadly Dozen exposes in static HTML; gate
  // on the title so any other page fed in returns [] instead of a junk row.
  if (!title || !/championship/i.test(title)) return [];

  const name = eventNameFromTitle(title);
  if (!name) return [];

  $('script, style, noscript').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  const { dateRaw, location } = extractWhenWhere(bodyText);
  const { start, end } = parseDateRange(dateRaw);
  const { city, country } = cityCountryFromLocation(location);

  return [
    {
      series: 'deadly_dozen',
      name,
      city,
      country,
      start_date: start,
      end_date: end,
      division_options: [], // not listed in any structured form
      source_url: permalink,
      source_ref: sourceRef, // raw stable slug; events.slug derived in the upsert
      is_tentative: start === null,
    },
  ];
}

/**
 * Discover the Championship event pages from the homepage nav — apex-host links
 * whose path mentions "championship", minus the empty "/championship" nav
 * folder. Generalises to any future Championship page (e.g. a European one)
 * without hardcoding slugs.
 */
function discoverChampionshipUrls(homeHtml: string): string[] {
  const $ = load(homeHtml);
  const urls = new Set<string>();
  $('a[href]').each((_i, el) => {
    const raw = $(el).attr('href');
    if (!raw) return;
    let u: URL;
    try {
      u = new URL(raw, DDZ_HOME);
    } catch {
      return;
    }
    if (u.hostname.toLowerCase() !== DDZ_APEX) return;
    const path = u.pathname.replace(/\/+$/, '');
    if (!/championship/i.test(path)) return;
    if (path === '/championship') return; // empty nav folder, not a page
    urls.add(`https://${DDZ_APEX}${path}`);
  });
  return [...urls];
}

export const deadlyDozenSource: CatalogSource = {
  series: 'deadly_dozen',
  label: 'Deadly Dozen (championships)',
  allowedHosts: [DDZ_HOST],
  async fetchEvents(): Promise<CatalogEvent[]> {
    const home = await fetchHtml(DDZ_HOME, { allowedHosts: [DDZ_HOST] });
    const urls = discoverChampionshipUrls(home);

    const byRef = new Map<string, CatalogEvent>();
    for (const url of urls) {
      const html = await fetchHtml(url, { allowedHosts: [DDZ_HOST] });
      for (const event of parseDeadlyDozenHtml(html)) {
        if (!byRef.has(event.source_ref)) byRef.set(event.source_ref, event);
      }
    }
    return [...byRef.values()];
  },
};
