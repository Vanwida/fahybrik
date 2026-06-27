import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import type { EventType } from '@fahybrid/shared/schema';
import type { RaceCalendarEvent } from '@fahybrid/shared/schema';

// ─────────────────────────────────────────────────────────────────────────────
// RACE CATALOG (phase 2d) — the athlete-facing "Buscar carrera" calendar.
//
// Source of truth is the shared `events` table. The calendar lists VISIBLE,
// FUTURE events (an event is "future/current" while its last day —
// coalesce(end_date, start_date) — is >= today in the box tz). Optional facets
// (series / country / q / from / to) are JS-filtered: the events table holds at
// most a few hundred rows (HYROX worldwide), so the broad query + in-memory
// filter keeps the SQL trivial — the same rationale as lib/coach/events.ts.
//
// This is DISTINCT from lib/coach/events.ts#listEvents (the coach admin listing):
// the calendar carries the athlete-relevant `series` + `is_tentative` columns
// that the coach EventListItem omits, and its default scope is visible+future.
// ─────────────────────────────────────────────────────────────────────────────

export interface RaceCalendarFilters {
  /** Competition family soft-whitelist: 'hyrox'|'deka'|'athx'|'deadly_dozen'|'other'. */
  series?: string;
  /** ISO 3166-1 alpha-2 (case-insensitive). */
  country?: string;
  /** Free-text search over name + location (case-insensitive substring). */
  q?: string;
  /** Inclusive lower bound on start_date (YYYY-MM-DD). */
  from?: string;
  /** Inclusive upper bound on start_date (YYYY-MM-DD). */
  to?: string;
  /**
   * Coach picker only: include events not yet flagged visible to athletes. The
   * athlete calendar always leaves this false (visible-only).
   */
  include_hidden?: boolean;
}

interface RawCalendarRow {
  event_id: string;
  slug: string;
  name: string;
  series: string | null;
  type: EventType;
  location: string | null;
  country: string | null;
  region: string | null;
  start_date: string;
  end_date: string | null;
  is_tentative: boolean;
  division_options: string[] | null;
}

function toCalendarEvent(row: RawCalendarRow): RaceCalendarEvent {
  return {
    event_id: row.event_id,
    slug: row.slug,
    name: row.name,
    series: row.series,
    type: row.type,
    location: row.location,
    country: row.country,
    region: row.region,
    start_date: row.start_date,
    end_date: row.end_date,
    is_tentative: row.is_tentative,
    division_options: row.division_options ?? [],
  };
}

/**
 * The visible, future race catalog ordered soonest-first. `include_hidden`
 * (coach picker) drops the visibility filter. Optional facets are applied in JS.
 */
export async function listRaceCalendar(
  filters: RaceCalendarFilters = {},
  client: Sql = defaultSql,
): Promise<RaceCalendarEvent[]> {
  const today = isoDateString(startOfDayInBox(new Date()));
  const includeHidden = filters.include_hidden === true;

  const rows = await client<RawCalendarRow[]>`
    select
      e.id::text                          as event_id,
      e.slug                              as slug,
      e.name                              as name,
      e.series                            as series,
      e.type                              as type,
      e.location                          as location,
      e.country                           as country,
      e.region                            as region,
      to_char(e.start_date, 'YYYY-MM-DD') as start_date,
      to_char(e.end_date,   'YYYY-MM-DD') as end_date,
      e.is_tentative                      as is_tentative,
      e.division_options                  as division_options
    from events e
    where coalesce(e.end_date, e.start_date) >= ${today}::date
      and (${includeHidden}::boolean = true or e.is_visible_to_athletes = true)
    order by e.start_date asc, e.name asc
    limit 1000
  `;

  const series = filters.series?.trim().toLowerCase() || undefined;
  const country = filters.country?.trim().toUpperCase() || undefined;
  const q = filters.q?.trim().toLowerCase() || undefined;
  const from = filters.from?.trim() || undefined;
  const to = filters.to?.trim() || undefined;

  return rows
    .map(toCalendarEvent)
    .filter((e) => {
      if (series && (e.series ?? '').toLowerCase() !== series) return false;
      if (country && (e.country ?? '').toUpperCase() !== country) return false;
      if (from && e.start_date < from) return false;
      if (to && e.start_date > to) return false;
      if (q) {
        const hay = `${e.name} ${e.location ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
}
