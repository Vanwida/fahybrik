import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { eventFamily, type EventFamily } from '@fahybrid/shared/domain/objectives/catalog';
import type { EventType } from '@fahybrid/shared/schema';
import type { RaceCalendarEvent } from '@fahybrid/shared/schema';

// ─────────────────────────────────────────────────────────────────────────────
// RACE CATALOG (phase 2d + FH-77) — athlete "Buscar carrera" / objectives picker.
//
// Source: shared `events` table. Lists VISIBLE future catalog rows PLUS the
// athlete's private custom events (events.athlete_id). Optional facets:
// family / series / country / q / from / to.
// ─────────────────────────────────────────────────────────────────────────────

export interface RaceCalendarFilters {
  /** Picker family facet: running | hybrid | crossfit | ocr | other. */
  family?: EventFamily;
  /** Competition family soft-whitelist series token. */
  series?: string;
  /** ISO 3166-1 alpha-2 (case-insensitive). */
  country?: string;
  /** Free-text search over name + location (case-insensitive substring). */
  q?: string;
  /** Inclusive lower bound on start_date (YYYY-MM-DD). */
  from?: string;
  /** Inclusive upper bound on start_date (YYYY-MM-DD). */
  to?: string;
  /** When set, include this athlete's private custom events. */
  athlete_id?: number;
  /**
   * Coach picker only: include events not yet flagged visible to athletes.
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
  start_date: string | null;
  end_date: string | null;
  is_tentative: boolean;
  division_options: string[] | null;
  athlete_id: string | null;
}

function toCalendarEvent(row: RawCalendarRow): RaceCalendarEvent {
  const isCustom = row.athlete_id != null;
  return {
    event_id: row.event_id,
    slug: row.slug,
    name: row.name,
    series: row.series,
    type: row.type,
    family: eventFamily(row.type, row.series),
    location: row.location,
    country: row.country,
    region: row.region,
    start_date: row.start_date,
    end_date: row.end_date,
    is_tentative: row.is_tentative,
    division_options: row.division_options ?? [],
    is_custom: isCustom,
  };
}

/**
 * Future catalog (+ optional athlete custom rows), soonest-first. Facets in JS.
 */
export async function listRaceCalendar(
  filters: RaceCalendarFilters = {},
  client: Sql = defaultSql,
): Promise<RaceCalendarEvent[]> {
  const today = isoDateString(startOfDayInBox(new Date()));
  const includeHidden = filters.include_hidden === true;
  const athleteId = filters.athlete_id ?? null;

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
      e.division_options                  as division_options,
      e.athlete_id::text                  as athlete_id
    from events e
    where (
        e.start_date is null
        or coalesce(e.end_date, e.start_date) >= ${today}::date
      )
      and (
        (${includeHidden}::boolean = true and e.athlete_id is null)
        or e.is_visible_to_athletes = true
        or (e.athlete_id is not null and e.athlete_id = ${athleteId})
      )
    order by e.start_date asc nulls last, e.name asc
    limit 1000
  `;

  const familyFilter = filters.family;
  const series = filters.series?.trim().toLowerCase() || undefined;
  const country = filters.country?.trim().toUpperCase() || undefined;
  const q = filters.q?.trim().toLowerCase() || undefined;
  const from = filters.from?.trim() || undefined;
  const to = filters.to?.trim() || undefined;

  return rows
    .map(toCalendarEvent)
    .filter((e) => {
      if (familyFilter && e.family !== familyFilter) return false;
      if (series && (e.series ?? '').toLowerCase() !== series) return false;
      if (country && (e.country ?? '').toUpperCase() !== country) return false;
      if (from && (e.start_date == null || e.start_date < from)) return false;
      if (to && (e.start_date == null || e.start_date > to)) return false;
      if (q) {
        const hay = `${e.name} ${e.location ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
}
