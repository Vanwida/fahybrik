// Events service — HYROX + CrossFit competition calendar.
//
// Surface:
//   listCoachEvents(opts)           coach view (Pablo) — sees ALL events
//   listVisibleEvents(opts)         athlete view — visible-only events
//   getEvent({ event_id })          single event (no perm filter)
//   createEvent({ coach_id, input }) Pablo adds a manual event
//   updateEvent({ coach_id, event_id, input }) edit / toggle visibility
//   listAthleteTargets({ athlete_id })
//   upsertAthleteTarget({ athlete_id, input })
//   deleteAthleteTarget({ athlete_id, event_id })
//
// All IDs cross the wire as strings to stay bigint-safe. The DB stores
// bigint; we stringify with ::text on read and Number() coerce on write.

import { sql as defaultSql, type Sql } from '@/lib/db';
import {
  athleteTargetEventInput,
  eventCreateInput,
  eventUpdateInput,
  type AthleteTargetEventInput,
  type EventCreateInput,
  type EventRegion,
  type EventUpdateInput,
} from '@fahybrid/shared/schema/events';
import type { TargetPriority } from '@fahybrid/shared/schema/_primitives';

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

export interface AthleteTargetItem {
  target_id: string;
  event_id: string;
  priority: TargetPriority;
  division: string | null;
  notes: string | null;
  // Hydrated event snapshot — saves the iOS picker a second roundtrip.
  event_name: string;
  event_slug: string;
  event_start_date: string;
  event_location: string | null;
  event_country: string | null;
  event_type: 'hyrox' | 'crossfit' | 'other';
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
      select event_id, count(*)::int as cnt
      from athlete_target_events
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
      (select count(*) from athlete_target_events where event_id = e.id)::text
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

// =============================================================================
// Athlete target-event mutations
// =============================================================================

export async function listAthleteTargets(args: {
  athlete_id: bigint;
  client?: Sql;
}): Promise<AthleteTargetItem[]> {
  const client = args.client ?? defaultSql;
  const rows = await client<
    {
      target_id: string;
      event_id: string;
      priority: TargetPriority;
      division: string | null;
      notes: string | null;
      event_name: string;
      event_slug: string;
      event_start_date: string;
      event_location: string | null;
      event_country: string | null;
      event_type: 'hyrox' | 'crossfit' | 'other';
    }[]
  >`
    select
      t.id::text                              as target_id,
      t.event_id::text                        as event_id,
      t.priority                              as priority,
      t.division                              as division,
      t.notes                                 as notes,
      e.name                                  as event_name,
      e.slug                                  as event_slug,
      to_char(e.start_date, 'YYYY-MM-DD')     as event_start_date,
      e.location                              as event_location,
      e.country                               as event_country,
      e.type                                  as event_type
    from athlete_target_events t
    join events e on e.id = t.event_id
    where t.athlete_id = ${args.athlete_id as unknown as number}
    order by
      case t.priority when 'A' then 0 when 'B' then 1 else 2 end,
      e.start_date asc
  `;
  return rows;
}

export async function upsertAthleteTarget(args: {
  athlete_id: bigint;
  input: unknown;
  client?: Sql;
}): Promise<AthleteTargetItem> {
  const parsed = athleteTargetEventInput.safeParse(args.input);
  if (!parsed.success) {
    throw new EventsError(
      'invalid_input',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      400,
    );
  }
  const input: AthleteTargetEventInput = parsed.data;
  const client = args.client ?? defaultSql;

  // Validate that the event exists AND is visible to athletes (athletes
  // can't pin invisible events — Pablo curates the picker).
  const eventRow = await client<{ id: string; visible: boolean }[]>`
    select id::text as id, is_visible_to_athletes as visible
    from events
    where id = ${input.event_id as unknown as number}
    limit 1
  `;
  if (eventRow.length === 0) {
    throw new EventsError('event_not_found', 'Evento no encontrado.', 404);
  }
  if (!eventRow[0]!.visible) {
    throw new EventsError(
      'event_not_visible',
      'Este evento aún no está disponible para atletas.',
      403,
    );
  }

  // Athletes get at most one A-priority race at a time. If they're
  // promoting an event to A, demote any other A-target to B silently.
  if (input.priority === 'A') {
    await client`
      update athlete_target_events
      set priority = 'B'
      where athlete_id = ${args.athlete_id as unknown as number}
        and event_id != ${input.event_id as unknown as number}
        and priority = 'A'
    `;
  }

  await client`
    insert into athlete_target_events (athlete_id, event_id, priority, division, notes)
    values (
      ${args.athlete_id as unknown as number},
      ${input.event_id as unknown as number},
      ${input.priority},
      ${input.division ?? null},
      ${input.notes ?? null}
    )
    on conflict (athlete_id, event_id) do update
    set
      priority = excluded.priority,
      division = excluded.division,
      notes    = excluded.notes
  `;

  const list = await listAthleteTargets({ athlete_id: args.athlete_id, client });
  const found = list.find((t) => t.event_id === String(input.event_id));
  if (!found) {
    throw new EventsError('upsert_failed', 'No se pudo guardar el target.', 500);
  }
  return found;
}

export async function deleteAthleteTarget(args: {
  athlete_id: bigint;
  event_id: bigint;
  client?: Sql;
}): Promise<void> {
  const client = args.client ?? defaultSql;
  await client`
    delete from athlete_target_events
    where athlete_id = ${args.athlete_id as unknown as number}
      and event_id   = ${args.event_id as unknown as number}
  `;
}
