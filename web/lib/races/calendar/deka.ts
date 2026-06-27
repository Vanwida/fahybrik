// DEKA catalog adapter — https://www.ocrbase.com/events?organizer=DEKA
//
// Spartan's own DEKA calendar is a JS app that 403s a bare fetch, so the
// scrapeable source of truth is ocrbase.com — a server-rendered Bootstrap
// listing that filters to `organizer=DEKA`. A single GET returns the events as
// `div.card.mb-3` rows; we parse each card's published fields and emit nothing
// we can't read:
//
//   name       .card-title a                          "DEKA VIGO 2026"
//   start      time.date-range-start[datetime]        "2026-06-27" (ISO attr)
//   end        time.date-range-end[datetime]          "2026-06-28" (absent → single-day)
//   divisions  .badge                                 "DEKA STRONG - Affiliate", ...
//   permalink  .card-title a[href^="/events/"]        "/events/deka-vigo-2026-june-27-2026"
//
// Honest-null gaps (verified live 2026-06-27):
//   * city / country — ocrbase's listing cards expose NO location text, flag, or
//     country field (only name + date + division badges), so both stay null. We
//     do NOT mine the marketing title for a country (that would be a guess).
//   * dates use the `<time datetime>` ISO attribute, not the visible label: the
//     label is rendered month-first ("Apr 11, 2026") which the shared DMY
//     parseEnglishDate cannot read; the datetime attr is already YYYY-MM-DD.
//
// Pagination: ocrbase's ONLY working lever is a cumulative `count` (offset / page
// / from / startdate / after / start were all verified ignored, 2026-06-27), and
// its CloudFront WAF hard-403s count>=200. The listing is date-ascending, so a
// single GET returns the EARLIEST `count` upcoming events. DEKA runs far more than
// that across the year, so the catalog is genuinely capped at the WAF ceiling —
// but never SILENTLY: a full page trips warnIfTruncated below.

import { load } from 'cheerio';
import type { CatalogEvent, CatalogSource } from './types';
import { fetchHtml } from './http';
import { cleanText, parseEnglishDate, toIsoDate } from './normalize';
import { captureRouteError } from '@/lib/observability/capture';

const OCRBASE_HOST = 'ocrbase.com';
const OCRBASE_ORIGIN = 'https://www.ocrbase.com';

// Events requested per fetch = the most one GET can return. ocrbase's CloudFront
// WAF 403s count>=200, so 199 is the ceiling (verified live 2026-06-27: 198/199
// → 200 OK, 200/201 → 403). No offset/date param works, so deeper events are
// unreachable from this source — warnIfTruncated surfaces the cap, never silent.
const DEKA_COUNT = 199;
const DEKA_URL = `${OCRBASE_ORIGIN}/events?organizer=DEKA&count=${DEKA_COUNT}`;

/**
 * Pull the stable permalink slug from an ocrbase event href:
 *   "/events/deka-vigo-2026-june-27-2026" → "deka-vigo-2026-june-27-2026".
 * Returns null for a non-event href so the card is skipped (no fabricated ref).
 */
function eventRefFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const m = href.match(/\/events\/([^/?#]+)/i);
  return m?.[1] ? m[1] : null;
}

/**
 * ISO 'YYYY-MM-DD' for a `<time>` cell. Prefers the machine-readable `datetime`
 * attribute (ocrbase prints it as YYYY-MM-DD); revalidated through toIsoDate so a
 * malformed attr can't slip through. Falls back to the visible label only as a
 * last resort (ocrbase renders it month-first, which parseEnglishDate can't read,
 * so this fallback is defensive rather than load-bearing). Null when unreadable.
 */
function isoFromTime(el: ReturnType<ReturnType<typeof load>>): string | null {
  if (el.length === 0) return null;
  const attr = cleanText(el.attr('datetime'));
  if (attr) {
    const m = attr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  const txt = cleanText(el.text());
  return txt ? parseEnglishDate(txt) : null;
}

/**
 * DEKA formats from a card's badges, with the trailing "- Affiliate" / "– Affiliate"
 * qualifier (hyphen OR en-dash, both present in the source) stripped so the result
 * is the format name only: "DEKA STRONG - Affiliate" → "DEKA STRONG". Deduped,
 * source order preserved. [] when no badges are listed.
 */
function divisionsFromCard(
  $: ReturnType<typeof load>,
  card: ReturnType<ReturnType<typeof load>>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  card.find('.badge').each((_i, b) => {
    const raw = cleanText($(b).text());
    if (!raw) return;
    const fmt = raw.replace(/\s*[-–—]\s*affiliate\s*$/i, '').trim();
    if (!fmt) return;
    const key = fmt.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(fmt);
  });
  return out;
}

export function parseDekaHtml(html: string): CatalogEvent[] {
  const $ = load(html);
  const byRef = new Map<string, CatalogEvent>();

  $('.card').each((_i, el) => {
    const card = $(el);

    const href = card.find('.card-title a[href*="/events/"]').first().attr('href');
    const sourceRef = eventRefFromHref(href);
    if (!sourceRef) return; // no stable identity → can't upsert it safely

    const name = cleanText(card.find('.card-title').first().text());
    if (!name) return;

    const startDate = isoFromTime(card.find('time.date-range-start').first());
    let endDate = isoFromTime(card.find('time.date-range-end').first());
    // Drop an end that predates the start (malformed range) rather than store it.
    if (startDate && endDate && endDate < startDate) endDate = null;

    const event: CatalogEvent = {
      series: 'deka',
      name,
      // ocrbase's listing cards expose no city or country/flag field — honest-null.
      city: null,
      country: null,
      start_date: startDate,
      end_date: endDate,
      division_options: divisionsFromCard($, card),
      source_url: `${OCRBASE_ORIGIN}/events/${sourceRef}`,
      source_ref: sourceRef, // raw stable slug; events.slug is derived in the upsert
      is_tentative: startDate === null,
    };

    // Dedup identical permalinks (ocrbase renders the lead card twice) — first wins.
    if (!byRef.has(event.source_ref)) byRef.set(event.source_ref, event);
  });

  return [...byRef.values()];
}

/**
 * ocrbase renders exactly one `<time class="date-range-start">` per event card,
 * so this counts the cards the source actually returned. A full page (≥ DEKA_COUNT)
 * means the source has MORE DEKA events than the WAF lets us fetch in one GET — we
 * surface that (capped, not silently truncated) so the gap is visible, never lost.
 */
function warnIfTruncated(html: string): void {
  const renderedCards = (html.match(/date-range-start/g) ?? []).length;
  if (renderedCards < DEKA_COUNT) return;
  captureRouteError(
    new Error(
      `DEKA catalog capped at ${DEKA_COUNT} events — source returned a full page; ` +
        `ocrbase WAF 403s count>=200 and offers no offset/date paging, so events ` +
        `beyond the earliest ${DEKA_COUNT} are unreachable from this source`,
    ),
    {
      route: 'cron/sync-race-calendar',
      meta: { source: 'deka', rendered_cards: renderedCards, cap: DEKA_COUNT },
    },
  );
}

export const dekaSource: CatalogSource = {
  series: 'deka',
  label: 'DEKA (ocrbase)',
  allowedHosts: [OCRBASE_HOST],
  async fetchEvents(): Promise<CatalogEvent[]> {
    const html = await fetchHtml(DEKA_URL, { allowedHosts: [OCRBASE_HOST] });
    const events = parseDekaHtml(html);
    warnIfTruncated(html);
    return events;
  },
};
