// Race-catalog scraper — the adapter contract.
//
// Phase 2a of the unified race system. Each official competition site (HYROX,
// DEKA, ATHX, Deadly Dozen) gets ONE `CatalogSource` adapter that fetches the
// site's OWN server-rendered HTML and returns a normalized `CatalogEvent[]`. A
// weekly cron runs every adapter and upserts the results into the shared
// `events` catalog keyed by (series, source_ref) — see ./sync.ts.
//
// HARD RULES (every adapter MUST honor these):
//   * NO fabrication. Only emit fields that are literally present in the HTML.
//     A datum we cannot read is `null`, never a guess.
//   * Honest-null dates. A venue announced without a date → start_date = null +
//     is_tentative = true. We never invent a placeholder date.
//   * Anti-SSRF. Every network read goes through ./http.ts `fetchHtml`, which is
//     pinned to the adapter's `allowedHosts`.
//   * Idempotent identity. `source_ref` MUST be a STABLE per-source id (the
//     event's permalink slug / id), so re-scraping the same event upserts the
//     same catalog row instead of duplicating it.

import type { EventRegion, EventSeries } from '@fahybrid/shared/schema/events';

// The granular catalog series a scraper can emit. Derived from the shared
// `EventSeries` whitelist (the source of truth that mirrors the events_series_chk
// constraint, migration 0077) MINUS 'other' — 'other' is reserved for manual
// rows Pablo/admin create by hand and is never produced by a scraper. Deriving
// (not re-listing) keeps this in lockstep with the DB constraint forever.
export type CatalogSeries = Exclude<EventSeries, 'other'>;

// A single normalized competition as read from an official site. This is the
// SOURCE-AGNOSTIC shape the upsert understands; per-source HTML quirks never
// leak past the adapter boundary.
export interface CatalogEvent {
  series: CatalogSeries;
  // Headline event name exactly as published (e.g. "Leapmotor HYROX Barcelona").
  name: string;
  // Human city ("Barcelona") when the HTML exposes it, else null.
  city: string | null;
  // ISO 3166-1 alpha-2, uppercase ("ES"). Null when the site only tags a
  // continent / region and the country can't be read without guessing.
  country: string | null;
  // 'YYYY-MM-DD'. Null = date not yet announced (pair with is_tentative=true).
  start_date: string | null;
  // 'YYYY-MM-DD'. Null = single-day event (or end date absent in the HTML).
  end_date: string | null;
  // Full bouquet of divisions offered, when listed. [] when not exposed.
  division_options: string[];
  // The event's public permalink (used as the athlete-facing "official page").
  source_url: string;
  // STABLE per-source identifier — the permalink slug/id. Unique within a series.
  source_ref: string;
  // True when the date is missing / announced as "coming soon".
  is_tentative: boolean;
  // Optional pre-derived region. When omitted, sync derives it from `country`.
  region?: EventRegion | null;
}

// One adapter per official site.
export interface CatalogSource {
  // The series this adapter feeds. Drives the (series, source_ref) upsert key.
  series: CatalogSeries;
  // Human label for logs / the sync-run journal.
  label: string;
  // Anti-SSRF allowlist — the only hostnames this adapter may fetch. Subdomains
  // of a listed apex host are allowed (e.g. 'hyrox.com' permits 'www.hyrox.com').
  allowedHosts: string[];
  // Fetch the site's HTML and return normalized events. Throws on a transport
  // or parse failure so the cron can record the source as failed (and NOT stale
  // its existing rows). Returning [] is a valid "site reachable but empty" state.
  fetchEvents(): Promise<CatalogEvent[]>;
}
