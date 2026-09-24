// Events service — the write side: a coach adds or edits one of their club's
// manual events; admin curates the shared catalog. Reads (listEvents, getEvent)
// and the shared types live in ./events.ts.
//
// Every mutation is owner-gated INSIDE its WHERE (ownedEventPredicate): a coach
// can never touch another club's event, and the shared catalog is admin-only.

import { sql as defaultSql, type Sql } from '@/lib/db';
import {
  eventCreateInput,
  eventUpdateInput,
  type EventCreateInput,
  type EventUpdateInput,
} from '@fahybrid/shared/schema/events';
import {
  EventsError,
  getEvent,
  ownedEventPredicate,
  type EventListItem,
  type EventOwner,
} from './events';

export async function createEvent(args: {
  // A club's manual events carry its coach_id; admin-curated catalog rows have no
  // coach (null) — the curator is recorded via verified_by_user_id instead.
  coach_id?: bigint | null;
  // When set, the row is marked owner/admin-verified at creation (scraper-safe).
  verified_by_user_id?: bigint | null;
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

  const createdByCoachId =
    args.coach_id != null ? (args.coach_id as unknown as number) : null;
  const verifiedByUserId =
    args.verified_by_user_id != null
      ? (args.verified_by_user_id as unknown as number)
      : null;
  const verifiedAt = verifiedByUserId != null ? new Date() : null;

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
      series,
      is_tentative,
      source,
      source_ref,
      created_by_coach_id,
      verified_by_user_id,
      verified_at
    ) values (
      ${input.slug},
      ${input.name},
      ${input.type},
      ${input.location ?? null},
      ${input.country ?? null},
      ${input.region ?? null},
      ${input.start_date ?? null},
      ${input.end_date ?? null},
      ${input.division ?? null},
      ${input.division_options ?? []},
      ${input.source_url ?? null},
      ${input.is_visible_to_athletes ?? false},
      ${input.series ?? null},
      ${input.is_tentative ?? false},
      ${input.source ?? null},
      ${input.source_ref ?? null},
      ${createdByCoachId},
      ${verifiedByUserId},
      ${verifiedAt}
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
  /** Who is editing — enforced INSIDE every WHERE (a coach can never touch
   *  another club's event; a cross-club id reads as not_found). */
  owner: EventOwner;
  // Owner/admin verification toggle: undefined = leave unchanged, a bigint =
  // mark verified by that user (sets verified_at = now()), null = clear it.
  verified_by_user_id?: bigint | null;
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

  // Ownership gate FIRST — an event the caller may not edit is a 404, never
  // disclosed. The same predicate rides every UPDATE below, so there is no
  // check-then-act window either.
  const owned = await client<{ ok: boolean }[]>`
    select true as ok from events
    where id = ${args.event_id as unknown as number}
      and ${ownedEventPredicate(client, args.owner)}
    limit 1
  `;
  if (!owned[0]) {
    // El catálogo compartido lo ven todos los coaches: decir que existe no filtra
    // nada, y un 403 claro explica por qué no se puede tocar. Otro club → 404.
    const catalog = await client<{ ok: boolean }[]>`
      select true as ok from events
      where id = ${args.event_id as unknown as number} and created_by_coach_id is null
      limit 1
    `;
    if (catalog[0]) {
      throw new EventsError(
        'catalog_read_only',
        'Esta carrera es del catálogo compartido: solo la edita el administrador.',
        403,
      );
    }
    throw new EventsError('not_found', 'Evento no encontrado.', 404);
  }

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
    // undefined = keep; null = clear (e.g. confirmed→por confirmar).
    start_date:
      input.start_date === undefined ? existing.start_date : input.start_date,
    end_date: input.end_date === undefined ? existing.end_date : input.end_date,
    division: input.division === undefined ? existing.division : input.division,
    division_options: input.division_options ?? existing.division_options,
    source_url:
      input.source_url === undefined ? existing.source_url : input.source_url,
    is_visible_to_athletes:
      input.is_visible_to_athletes ?? existing.is_visible_to_athletes,
    series: input.series === undefined ? existing.series : input.series,
    is_tentative: input.is_tentative ?? existing.is_tentative,
    source: input.source === undefined ? existing.source : input.source,
    source_ref:
      input.source_ref === undefined ? existing.source_ref : input.source_ref,
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
      series                 = ${next.series},
      is_tentative           = ${next.is_tentative},
      source                 = ${next.source},
      source_ref             = ${next.source_ref},
      updated_at             = now()
    where id = ${args.event_id as unknown as number}
      and ${ownedEventPredicate(client, args.owner)}
  `;

  // Verification is set ONLY when explicitly requested — a plain field edit must
  // not silently (un)verify a row. verified_at tracks WHEN it was vouched for.
  if (args.verified_by_user_id !== undefined) {
    const verifiedByUserId =
      args.verified_by_user_id != null
        ? (args.verified_by_user_id as unknown as number)
        : null;
    await client`
      update events set
        verified_by_user_id = ${verifiedByUserId},
        verified_at         = ${verifiedByUserId != null ? new Date() : null},
        updated_at          = now()
      where id = ${args.event_id as unknown as number}
        and ${ownedEventPredicate(client, args.owner)}
    `;
  }

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
