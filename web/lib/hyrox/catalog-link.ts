import 'server-only';

import type { Sql, TransactionClient } from '@/lib/db';

// =============================================================================
// Catalog bridge — link an imported race to the shared `events` catalog (0077).
//
// The official results.hyrox.com detail page carries NO machine-readable date —
// only a meeting label ("2026 Amsterdam"). Rather than store today's date (a
// fabrication, killed in 0072) or null forever, we look the meeting up in the
// curated `events` catalog: a hit yields the REAL start_date AND an event_id the
// reconcile/adopt step can match on (so an athlete's pasted official result
// adopts the coach's pending target instead of inserting a duplicate).
//
// Conservative by construction:
//   * links ONLY on an unambiguous (exactly-one) strong key (series + year +
//     city token) — never on a fuzzy or multi-row match (a false link would
//     wrongly adopt the wrong target, worse than a duplicate);
//   * never fabricates a date — a miss returns null and the import keeps its
//     honest null date;
//   * best-effort — any DB error (e.g. catalog not yet migrated) degrades to
//     null and never blocks the import (mirrors resolveFieldSize).
// =============================================================================

export interface CatalogLink {
  event_id: number;
  race_date: string; // 'YYYY-MM-DD' — the catalog event's real start_date
}

/**
 * Parse a meeting label like "2026 Amsterdam" → { year: 2026, city: 'amsterdam' }.
 * Returns null when no 4-digit year is present: without a year, a bare city is
 * too weak a key to link safely (HYROX visits a city across multiple seasons).
 */
export function parseMeetingLabel(
  label: string | null | undefined,
): { year: number; city: string } | null {
  if (!label) return null;
  const ym = label.match(/\b(?:19|20)\d{2}\b/);
  if (!ym) return null;
  const year = Number(ym[0]);
  const city = label
    .replace(ym[0], ' ')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!city) return null;
  return { year, city };
}

/**
 * Resolve the catalog event for a dateless (official) import from its meeting
 * label. Matches series events of that YEAR whose name/location contains the city
 * token; links ONLY when exactly one row matches. Returns null on no/ambiguous
 * match or any error.
 */
export async function resolveCatalogEventByLabel(
  client: Sql | TransactionClient,
  args: { series: string; label: string | null },
): Promise<CatalogLink | null> {
  const parsed = parseMeetingLabel(args.label);
  if (!parsed) return null;
  const like = `%${parsed.city}%`;
  try {
    const rows = await client<{ id: number; start_date: string | null }[]>`
      select e.id::int as id, to_char(e.start_date, 'YYYY-MM-DD') as start_date
      from events e
      where e.series = ${args.series}
        and e.start_date is not null
        and date_part('year', e.start_date) = ${parsed.year}
        and (lower(e.name) like ${like} or lower(e.location) like ${like})
      limit 2
    `;
    if (rows.length !== 1) return null; // 0 → no match; 2 → ambiguous → don't link
    const r = rows[0]!;
    if (!r.start_date) return null;
    return { event_id: r.id, race_date: r.start_date };
  } catch {
    return null; // catalog not migrated / transient → degrade, never block import
  }
}
