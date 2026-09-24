// Events service — HYROX + CrossFit competition calendar.
//
// Surface:
//   listEvents(opts)                catalog + (with opts.coach_id) the club's own
//                                   manual events; visibility 'visible' = athlete view
//   getEvent(event_id)              single event (no perm filter — internal reads)
//   createEvent / updateEvent live in ./events-write.ts (a coach adds or edits
//   a manual event; owner-gated).
//
// The athlete's TARGET is no longer a separate event-pin row: it lives on the
// unified `races` spine (priority='target'). target_count below counts athletes
// whose race links to a catalog event via races.event_id.
//
// All IDs cross the wire as strings to stay bigint-safe. The DB stores
// bigint; we stringify with ::text on read and Number() coerce on write.

import { sql as defaultSql, type Sql } from '@/lib/db';
import { type EventRegion, type EventSeries } from '@fahybrid/shared/schema/events';
import { BOX_TIMEZONE, zonedDayString } from '@fahybrid/shared/domain/dates';
import { isValidTimezone } from '@fahybrid/shared/domain/coach/coach-timezone';
import { loadAthleteTimezone } from '@fahybrid/shared/domain/db/athlete-timezone';
import { loadCoachToday } from '@/lib/coach/coach-timezone';

export class EventsError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'EventsError';
  }
}

export interface EventListItem {
  event_id: string;
  slug: string;
  name: string;
  type: 'hyrox' | 'crossfit' | 'running' | 'ocr' | 'other';
  location: string | null;
  country: string | null;
  region: EventRegion | null;
  // Nullable since migration 0080 — undated "por confirmar" venues.
  start_date: string | null;
  end_date: string | null;
  division: string | null;
  division_options: string[];
  source_url: string | null;
  is_visible_to_athletes: boolean;
  // Catalog metadata + owner/admin curation state.
  series: EventSeries | null;
  is_tentative: boolean;
  source: string | null;
  source_ref: string | null;
  is_verified: boolean;
  verified_at: string | null;
  is_past: boolean;
  target_count: number;
}

interface RawEventRow {
  id: string;
  slug: string;
  name: string;
  type: 'hyrox' | 'crossfit' | 'running' | 'ocr' | 'other';
  location: string | null;
  country: string | null;
  region: EventRegion | null;
  start_date: string | null;
  end_date: string | null;
  division: string | null;
  division_options: string[] | null;
  source_url: string | null;
  is_visible_to_athletes: boolean;
  series: EventSeries | null;
  is_tentative: boolean;
  source: string | null;
  source_ref: string | null;
  verified_by_user_id: string | null;
  verified_at: string | null;
  target_count: string;
}

export interface ListEventsOpts {
  type?: 'hyrox' | 'crossfit' | 'running' | 'ocr' | 'other';
  region?: EventRegion;
  // 'upcoming' (default) hides past races. 'all' includes them. 'past' only past.
  scope?: 'upcoming' | 'past' | 'all';
  // 'visible' returns only is_visible_to_athletes=true. 'all' returns everything.
  visibility?: 'visible' | 'all';
  // Coach caller: restrict to the shared catalog (created_by_coach_id null) plus
  // THIS club's own manual events — never another club's. Omit for the athlete
  // view (visible-only) and for the admin curator (sees everything).
  coach_id?: number | bigint;
  // Athlete caller: the shared catalog plus the manual events of THEIR coach's
  // club — never another club's, even if that club made its event visible.
  athlete_id?: number | bigint;
  // Anonymous caller: the shared catalog only.
  catalog_only?: boolean;
  // Date range filter (ISO YYYY-MM-DD). Inclusive.
  from_date?: string;
  to_date?: string;
  // The instant «today» is read at (tests); defaults to now.
  now?: Date;
}

/**
 * Who is mutating an event. Admin (the catalog curator) may touch any row; a
 * coach may touch ONLY their own manual events. The shared catalog
 * (`created_by_coach_id is null`) is what every club's athletes see, so one
 * coach renaming or hiding a HYROX race would do it for everyone: it is
 * read-only for coaches and curated by admin (DECISIONS 2026-09-23 «Catálogo de
 * carreras»). The predicate goes INSIDE the WHERE of every mutation (no
 * check-then-act window).
 */
export type EventOwner =
  | { kind: 'admin' }
  | { kind: 'coach'; coach_id: number | bigint };

export function ownedEventPredicate(client: Sql, owner: EventOwner) {
  return owner.kind === 'admin'
    ? client`true`
    : client`created_by_coach_id = ${Number(owner.coach_id)}`;
}

function toListItem(row: RawEventRow, today: string): EventListItem {
  // An undated ("por confirmar") row is never past — it has no date to be past.
  const ref = row.end_date ?? row.start_date;
  const isPast = ref != null ? ref < today : false;
  return {
    event_id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type,
    location: row.location,
    country: row.country,
    region: row.region,
    start_date: row.start_date,
    end_date: row.end_date,
    division: row.division,
    division_options: row.division_options ?? [],
    source_url: row.source_url,
    is_visible_to_athletes: row.is_visible_to_athletes,
    series: row.series,
    is_tentative: row.is_tentative,
    source: row.source,
    source_ref: row.source_ref,
    is_verified: row.verified_by_user_id != null,
    verified_at: row.verified_at,
    is_past: isPast,
    target_count: Number.parseInt(row.target_count, 10) || 0,
  };
}

/**
 * The «today» a race turns «past» against, in the calendar of whoever is looking
 * (DECISIONS «Qué día es en cada sitio»): an athlete in THEIR own day — one
 * «today» for every race read, so a race never sits between «upcoming» and
 * «past» by the box clock — a coach in their club's, the admin curator and an
 * anonymous visitor in the default. It used to be the UTC day for everyone.
 */
async function viewerToday(opts: ListEventsOpts, client: Sql): Promise<string> {
  const now = opts.now ?? new Date();
  if (opts.athlete_id != null) {
    const tz = await loadAthleteTimezone(client, opts.athlete_id);
    return zonedDayString(now, isValidTimezone(tz) ? tz : BOX_TIMEZONE);
  }
  if (opts.coach_id != null) return loadCoachToday(opts.coach_id, { now, client });
  return zonedDayString(now, BOX_TIMEZONE);
}

// =============================================================================
// Coach + athlete event listings
// =============================================================================

export async function listEvents(
  opts: ListEventsOpts = {},
  client: Sql = defaultSql,
): Promise<EventListItem[]> {
  const today = await viewerToday(opts, client);
  const scope = opts.scope ?? 'upcoming';
  const visibility = opts.visibility ?? 'all';

  // Use a single broad query and JS-side filter the optional facets. The
  // events table will hold ~hundreds of rows max (HYROX worldwide), so
  // pulling them all and filtering in memory is fine and keeps the SQL
  // composition trivial. The narrow date / visibility filters that always
  // apply stay in SQL.
  const onlyVisibleClause = visibility === 'visible';
  // Sin coach, atleta ni «solo catálogo» = el curador (admin): todo.
  const scopeToClub = opts.coach_id != null || opts.athlete_id != null || opts.catalog_only === true;
  const coachIdParam = opts.coach_id != null ? Number(opts.coach_id) : 0;
  const athleteIdParam = opts.athlete_id != null ? Number(opts.athlete_id) : 0;
  const rows = await client<RawEventRow[]>`
    select
      e.id::text                                              as id,
      e.slug                                                  as slug,
      e.name                                                  as name,
      e.type                                                  as type,
      e.location                                              as location,
      e.country                                               as country,
      e.region                                                as region,
      to_char(e.start_date, 'YYYY-MM-DD')                     as start_date,
      to_char(e.end_date,   'YYYY-MM-DD')                     as end_date,
      e.division                                              as division,
      e.division_options                                      as division_options,
      e.source_url                                            as source_url,
      e.is_visible_to_athletes                                as is_visible_to_athletes,
      e.series                                                as series,
      e.is_tentative                                          as is_tentative,
      e.source                                                as source,
      e.source_ref                                            as source_ref,
      e.verified_by_user_id::text                             as verified_by_user_id,
      to_char(e.verified_at, 'YYYY-MM-DD')                    as verified_at,
      coalesce(t.cnt, 0)::text                                as target_count
    from events e
    left join (
      -- Athletes whose race links to this catalog event (unified spine).
      select event_id, count(distinct athlete_id)::int as cnt
      from races
      where event_id is not null
      group by event_id
    ) t on t.event_id = e.id
    where (${onlyVisibleClause}::boolean = false or e.is_visible_to_athletes = true)
      and (
        ${scopeToClub}::boolean = false
        or e.created_by_coach_id is null
        or e.created_by_coach_id = ${coachIdParam}
        or e.created_by_coach_id = (select a.coach_id from athletes a where a.id = ${athleteIdParam})
      )
    order by e.start_date asc nulls last, e.name asc
    limit 1000
  `;

  return rows
    .map((row) => toListItem(row, today))
    .filter((e) => {
      if (opts.type && e.type !== opts.type) return false;
      if (opts.region && e.region !== opts.region) return false;
      if (scope === 'upcoming' && e.is_past) return false;
      if (scope === 'past' && !e.is_past) return false;
      // Undated rows are exempt from date-range filtering (nothing to compare).
      if (opts.from_date && e.start_date != null && e.start_date < opts.from_date)
        return false;
      if (opts.to_date && e.start_date != null && e.start_date > opts.to_date)
        return false;
      return true;
    });
}

export async function getEvent(
  event_id: bigint,
  client: Sql = defaultSql,
): Promise<EventListItem | null> {
  const rows = await client<RawEventRow[]>`
    select
      e.id::text                                              as id,
      e.slug                                                  as slug,
      e.name                                                  as name,
      e.type                                                  as type,
      e.location                                              as location,
      e.country                                               as country,
      e.region                                                as region,
      to_char(e.start_date, 'YYYY-MM-DD')                     as start_date,
      to_char(e.end_date,   'YYYY-MM-DD')                     as end_date,
      e.division                                              as division,
      e.division_options                                      as division_options,
      e.source_url                                            as source_url,
      e.is_visible_to_athletes                                as is_visible_to_athletes,
      e.series                                                as series,
      e.is_tentative                                          as is_tentative,
      e.source                                                as source,
      e.source_ref                                            as source_ref,
      e.verified_by_user_id::text                             as verified_by_user_id,
      to_char(e.verified_at, 'YYYY-MM-DD')                    as verified_at,
      (select count(distinct athlete_id) from races where event_id = e.id)::text
                                                              as target_count
    from events e
    where e.id = ${event_id as unknown as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  // Internal read after a write (admin or coach): the default calendar.
  return toListItem(row, zonedDayString(new Date(), BOX_TIMEZONE));
}
