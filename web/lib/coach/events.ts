// Events service — HYROX + CrossFit competition calendar.
//
// Surface:
//   listCoachEvents(opts)           coach view (Pablo) — sees ALL events
//   listVisibleEvents(opts)         athlete view — visible-only events
//   getEvent({ event_id })          single event (no perm filter)
//   createEvent({ coach_id, input }) Pablo adds a manual event
//   updateEvent({ coach_id, event_id, input }) edit / toggle visibility
//
// The athlete's TARGET is no longer a separate event-pin row: it lives on the
// unified `races` spine (priority='target'). target_count below counts athletes
// whose race links to a catalog event via races.event_id.
//
// All IDs cross the wire as strings to stay bigint-safe. The DB stores
// bigint; we stringify with ::text on read and Number() coerce on write.

import { sql as defaultSql, type Sql } from '@/lib/db';
import {
  eventCreateInput,
  eventUpdateInput,
  type EventCreateInput,
  type EventRegion,
  type EventUpdateInput,
} from '@fahybrid/shared/schema/events';

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
  type: 'hyrox' | 'crossfit' | 'other';
  location: string | null;
  country: string | null;
  region: EventRegion | null;
  start_date: string;
  end_date: string | null;
  division: string | null;
  division_options: string[];
  source_url: string | null;
  is_visible_to_athletes: boolean;
  is_past: boolean;
  target_count: number;
}

interface RawEventRow {
  id: string;
  slug: string;
  name: string;
  type: 'hyrox' | 'crossfit' | 'other';
  location: string | null;
  country: string | null;
  region: EventRegion | null;
  start_date: string;
  end_date: string | null;
  division: string | null;
  division_options: string[] | null;
  source_url: string | null;
  is_visible_to_athletes: boolean;
  target_count: string;
}

export interface ListEventsOpts {
  type?: 'hyrox' | 'crossfit' | 'other';
  region?: EventRegion;
  // 'upcoming' (default) hides past races. 'all' includes them. 'past' only past.
  scope?: 'upcoming' | 'past' | 'all';
  // 'visible' returns only is_visible_to_athletes=true. 'all' returns everything.
  visibility?: 'visible' | 'all';
  // Date range filter (ISO YYYY-MM-DD). Inclusive.
  from_date?: string;
  to_date?: string;
}

function toListItem(row: RawEventRow, today: string): EventListItem {
  const isPast = row.end_date != null
    ? row.end_date < today
    : row.start_date < today;
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
    is_past: isPast,
    target_count: Number.parseInt(row.target_count, 10) || 0,
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// =============================================================================
// Coach + athlete event listings
// =============================================================================

export async function listEvents(
  opts: ListEventsOpts = {},
  client: Sql = defaultSql,
): Promise<EventListItem[]> {
  const today = todayIso();
  const scope = opts.scope ?? 'upcoming';
  const visibility = opts.visibility ?? 'all';

  // Use a single broad query and JS-side filter the optional facets. The
  // events table will hold ~hundreds of rows max (HYROX worldwide), so
  // pulling them all and filtering in memory is fine and keeps the SQL
  // composition trivial. The narrow date / visibility filters that always
  // apply stay in SQL.
  const onlyVisibleClause = visibility === 'visible';
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
    order by e.start_date asc, e.name asc
    limit 1000
  `;

  return rows
    .map((row) => toListItem(row, today))
    .filter((e) => {
      if (opts.type && e.type !== opts.type) return false;
      if (opts.region && e.region !== opts.region) return false;
      if (scope === 'upcoming' && e.is_past) return false;
      if (scope === 'past' && !e.is_past) return false;
      if (opts.from_date && e.start_date < opts.from_date) return false;
      if (opts.to_date && e.start_date > opts.to_date) return false;
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
      (select count(distinct athlete_id) from races where event_id = e.id)::text
                                                              as target_count
    from events e
    where e.id = ${event_id as unknown as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return toListItem(row, todayIso());
}

// =============================================================================
// Coach mutations
// =============================================================================

export async function createEvent(args: {
  coach_id: bigint;
  input: unknown;
  client?: Sql;
}): Promise<EventListItem> {
  const parsed = eventCreateInput.safeParse(args.input);
  if (!parsed.success) {
    throw new EventsError(
      'invalid_input',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      400,
    );
  }
  const input: EventCreateInput = parsed.data;
  const client = args.client ?? defaultSql;

  // Slug must be unique. Surface a friendly error rather than a 500.
  const collision = await client<{ exists: boolean }[]>`
    select true as exists from events where slug = ${input.slug} limit 1
  `;
  if (collision.length > 0) {
    throw new EventsError(
      'slug_taken',
      `Ya existe un evento con el slug "${input.slug}".`,
      409,
    );
  }

  const inserted = await client<{ id: string }[]>`
    insert into events (
      slug,
      name,
      type,
      location,
      country,
      region,
      start_date,
      end_date,
      division,
      division_options,
      source_url,
      is_visible_to_athletes,
      created_by_coach_id
    ) values (
      ${input.slug},
      ${input.name},
      ${input.type},
      ${input.location ?? null},
      ${input.country ?? null},
      ${input.region ?? null},
      ${input.start_date},
      ${input.end_date ?? null},
      ${input.division ?? null},
      ${input.division_options ?? []},
      ${input.source_url ?? null},
      ${input.is_visible_to_athletes ?? false},
      ${args.coach_id as unknown as number}
    )
    returning id::text as id
  `;
  const id = inserted[0]?.id;
  if (!id) {
    throw new EventsError('insert_failed', 'No se pudo crear el evento.', 500);
  }
  const event = await getEvent(BigInt(id), client);
  if (!event) {
    throw new EventsError('insert_failed', 'Evento creado pero no recuperable.', 500);
  }
  return event;
}

export async function updateEvent(args: {
  event_id: bigint;
  input: unknown;
  client?: Sql;
}): Promise<EventListItem> {
  const parsed = eventUpdateInput.safeParse(args.input);
  if (!parsed.success) {
    throw new EventsError(
      'invalid_input',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      400,
    );
  }
  const input: EventUpdateInput = parsed.data;
  const client = args.client ?? defaultSql;

  // Read-modify-write keeps the SQL trivially correct in the face of mixed
  // "leave alone" vs "set to null" semantics. The events table is small
  // enough that the round-trip cost is negligible.
  const existing = await getEvent(args.event_id, client);
  if (!existing) {
    throw new EventsError('not_found', 'Evento no encontrado.', 404);
  }

  const next = {
    slug: input.slug ?? existing.slug,
    name: input.name ?? existing.name,
    type: input.type ?? existing.type,
    location: input.location === undefined ? existing.location : input.location,
    country: input.country === undefined ? existing.country : input.country,
    region: input.region === undefined ? existing.region : input.region,
    start_date: input.start_date ?? existing.start_date,
    end_date: input.end_date === undefined ? existing.end_date : input.end_date,
    division: input.division === undefined ? existing.division : input.division,
    division_options: input.division_options ?? existing.division_options,
    source_url:
      input.source_url === undefined ? existing.source_url : input.source_url,
    is_visible_to_athletes:
      input.is_visible_to_athletes ?? existing.is_visible_to_athletes,
  };

  // Slug uniqueness check when slug changed
  if (next.slug !== existing.slug) {
    const collision = await client<{ exists: boolean }[]>`
      select true as exists
      from events
      where slug = ${next.slug}
        and id != ${args.event_id as unknown as number}
      limit 1
    `;
    if (collision.length > 0) {
      throw new EventsError(
        'slug_taken',
        `Ya existe un evento con el slug "${next.slug}".`,
        409,
      );
    }
  }

  await client`
    update events set
      slug                   = ${next.slug},
      name                   = ${next.name},
      type                   = ${next.type},
      location               = ${next.location},
      country                = ${next.country},
      region                 = ${next.region},
      start_date             = ${next.start_date},
      end_date               = ${next.end_date},
      division               = ${next.division},
      division_options       = ${next.division_options},
      source_url             = ${next.source_url},
      is_visible_to_athletes = ${next.is_visible_to_athletes},
      updated_at             = now()
    where id = ${args.event_id as unknown as number}
  `;

  const refreshed = await getEvent(args.event_id, client);
  if (!refreshed) {
    throw new EventsError('update_failed', 'Evento actualizado pero no recuperable.', 500);
  }
  return refreshed;
}

// Athlete target mutations (the legacy event-pin table) were removed in the
// unified race system: the athlete's target is a `races` row (priority='target'),
// set via the race-creation flow — not a separate event pin. The iOS target
// picker is rebuilt on `races` in phase 2.
