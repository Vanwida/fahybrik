import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type {
  EventType,
  NextRace,
  RaceDivision,
  RaceEventType,
  RaceFormat,
  RaceGender,
} from '@fahybrid/shared/schema';
import { getTargetRace } from './next-race';

// ─────────────────────────────────────────────────────────────────────────────
// TARGET-RACE WRITE PATH (phase 2d) — the single source of truth for "pick a
// catalog event as the athlete's objective" and "remove it". Used by BOTH the
// athlete bearer endpoints (POST/DELETE /api/athlete/races/target) AND the coach
// picker (POST /api/coach/athletes/[id]/races/target). Auth + ownership live in
// the routes; the domain logic lives here once.
//
// Picking an event = a `races` row {event_id, priority='target', status='planned'}
// whose name/event_type/race_date/location are DERIVED from the catalog event
// (never client-supplied). The athlete only chooses the orthogonal participation
// attributes (format/division/gender) + an optional goal time. This row is what
// getTargetRace / the countdown read.
//
// Single-target invariant: setting a target DEMOTES every other current target
// to 'secondary' (it stays on the calendar, just loses the peak). Re-picking the
// same event UPDATES that row in place. A past completed/imported race for the
// same event is never touched (it isn't planned/registered) — a fresh future
// target is created instead.
// ─────────────────────────────────────────────────────────────────────────────

export class TargetRaceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TargetRaceError';
  }
}

/**
 * Map the catalog event's competition family to the `races.event_type` enum.
 * Prefers `events.series` (the phase-1 soft whitelist) and falls back to the
 * legacy `events.type`. 'athx'/'deadly_dozen' collapse to 'other' (the races
 * enum only models hyrox|deka|other).
 */
export function eventSeriesToRaceEventType(
  series: string | null,
  type: EventType | null,
): RaceEventType {
  if (series === 'hyrox' || series === 'deka') return series;
  if (series === 'athx' || series === 'deadly_dozen' || series === 'other') return 'other';
  if (type === 'hyrox') return 'hyrox';
  return 'other';
}

interface EventRow {
  id: string;
  name: string;
  series: string | null;
  type: EventType;
  // Nullable since migration 0080: an undated catalog event targets to a null
  // race_date (races.race_date is nullable). `${event.start_date}::date` casts
  // null to null cleanly — no countdown is produced until a date is confirmed.
  start_date: string | null;
  location: string | null;
  is_visible_to_athletes: boolean;
}

export interface SetTargetRaceParams {
  athlete_id: number;
  event_id: number;
  format: RaceFormat;
  division: RaceDivision;
  gender_category: RaceGender;
  goal_time_seconds?: number | null;
  /**
   * Athlete path: the event must be visible to athletes (404 otherwise — never
   * leak a hidden event). Coach path passes false (Pablo may target any event).
   */
  require_visible: boolean;
  client?: Sql;
}

export interface SetTargetRaceResult {
  /** The countdown view of the now-current target (null only on the past-date
   * edge a future-only catalog can't actually produce). */
  target_race: NextRace | null;
  /** The written races.id (string, bigint-safe). */
  race_id: string;
}

export async function setAthleteTargetRace(
  params: SetTargetRaceParams,
): Promise<SetTargetRaceResult> {
  const client = params.client ?? defaultSql;
  const goal = params.goal_time_seconds ?? null;

  const eventRows = await client<EventRow[]>`
    select
      e.id::text                          as id,
      e.name                              as name,
      e.series                            as series,
      e.type                              as type,
      to_char(e.start_date, 'YYYY-MM-DD') as start_date,
      e.location                          as location,
      e.is_visible_to_athletes            as is_visible_to_athletes
    from events e
    where e.id = ${params.event_id}
    limit 1
  `;
  const event = eventRows[0];
  if (!event) {
    throw new TargetRaceError('event_not_found', 'Evento no encontrado', 404);
  }
  if (params.require_visible && !event.is_visible_to_athletes) {
    // 404 (not 403) so a hidden event is indistinguishable from a missing one.
    throw new TargetRaceError('event_not_found', 'Evento no encontrado', 404);
  }

  const eventType = eventSeriesToRaceEventType(event.series, event.type);

  const race_id = await client.begin(async (tx) => {
    // 1) Demote every current target to 'secondary' (single-target invariant).
    await tx`
      update races set priority = 'secondary'::race_priority, updated_at = now()
      where athlete_id = ${params.athlete_id}
        and priority = 'target'
        and status in ('planned', 'registered')
    `;

    // 2) Re-use a planned/registered race already linked to this event, else
    //    insert a fresh target row. (A completed/imported race for this event is
    //    never matched, so the historical result is preserved.)
    const existing = await tx<{ id: string }[]>`
      select id::text as id
      from races
      where athlete_id = ${params.athlete_id}
        and event_id = ${params.event_id}
        and status in ('planned', 'registered')
      order by id desc
      limit 1
    `;

    if (existing[0]) {
      const updated = await tx<{ id: string }[]>`
        update races set
          priority         = 'target'::race_priority,
          status           = 'planned'::race_status,
          name             = ${event.name},
          event_type       = ${eventType}::race_event_type,
          format           = ${params.format}::race_format,
          division         = ${params.division}::race_division,
          gender_category  = ${params.gender_category}::race_gender,
          race_date        = ${event.start_date}::date,
          location         = ${event.location},
          goal_time_seconds= ${goal},
          updated_at       = now()
        where id = ${Number(existing[0].id)}
        returning id::text as id
      `;
      return updated[0]!.id;
    }

    const inserted = await tx<{ id: string }[]>`
      insert into races (
        athlete_id, event_id, name, event_type, format, division,
        gender_category, priority, race_date, location, goal_time_seconds, status
      ) values (
        ${params.athlete_id},
        ${params.event_id},
        ${event.name},
        ${eventType}::race_event_type,
        ${params.format}::race_format,
        ${params.division}::race_division,
        ${params.gender_category}::race_gender,
        'target'::race_priority,
        ${event.start_date}::date,
        ${event.location},
        ${goal},
        'planned'::race_status
      )
      returning id::text as id
    `;
    return inserted[0]!.id;
  });

  // Read back through the canonical countdown reader (committed by now).
  const target_race = await getTargetRace(params.athlete_id, client);
  return { target_race, race_id };
}

export interface PromoteRaceToTargetParams {
  athlete_id: number;
  race_id: number;
  client?: Sql;
}

/**
 * Promote an EXISTING upcoming race to the athlete's primary objective ('target').
 * The athlete-chosen counterpart to setAthleteTargetRace: that path picks a NEW
 * catalog event; here the race is already on the calendar (added earlier as a
 * secondary/tune_up objective), so we just flip its priority in place.
 *
 * Reuses the SAME single-target invariant — demote every OTHER current target to
 * 'secondary' — so the two write paths can never produce two targets. tune_ups are
 * left untouched on purpose: a tune-up is a training/test race, promoting another
 * race never turns it into a secondary objective. Only the prior peak steps down.
 *
 * Scoped to ownership + a pure future objective (planned/registered, no result):
 * a past/imported result can never become a future target. Returns null (→ 404)
 * when nothing matched. Re-promoting the current target is idempotent.
 */
export async function promoteRaceToTarget(
  params: PromoteRaceToTargetParams,
): Promise<SetTargetRaceResult | null> {
  const client = params.client ?? defaultSql;

  const promoted = await client.begin(async (tx) => {
    // Ownership + "is a promotable future objective" gate in one read.
    const owned = await tx<{ id: string }[]>`
      select id::text as id
      from races
      where id = ${params.race_id}
        and athlete_id = ${params.athlete_id}
        and status in ('planned', 'registered')
        and result_time_seconds is null
      limit 1
    `;
    if (!owned[0]) return null;

    // 1) Demote every OTHER current target to 'secondary' (single-target
    //    invariant — identical predicate to setAthleteTargetRace).
    await tx`
      update races set priority = 'secondary'::race_priority, updated_at = now()
      where athlete_id = ${params.athlete_id}
        and priority = 'target'
        and status in ('planned', 'registered')
        and id <> ${params.race_id}
    `;

    // 2) Promote the chosen race (idempotent if it was already the target).
    await tx`
      update races set priority = 'target'::race_priority, updated_at = now()
      where id = ${params.race_id}
    `;

    return owned[0].id;
  });

  if (!promoted) return null;

  // Read back through the canonical countdown reader (committed by now).
  const target_race = await getTargetRace(params.athlete_id, client);
  return { target_race, race_id: promoted };
}

export interface DeleteTargetRaceParams {
  athlete_id: number;
  race_id: number;
  client?: Sql;
}

/**
 * Remove the athlete's target objective. Scoped to ownership and to a pure
 * future objective (planned/registered, no result) — an imported/completed
 * result can never be deleted through this path. Returns false (→ 404) when
 * nothing matched.
 */
export async function deleteAthleteTargetRace(
  params: DeleteTargetRaceParams,
): Promise<boolean> {
  const client = params.client ?? defaultSql;
  const deleted = await client<{ id: string }[]>`
    delete from races
    where id = ${params.race_id}
      and athlete_id = ${params.athlete_id}
      and status in ('planned', 'registered')
      and result_time_seconds is null
    returning id::text as id
  `;
  return deleted.length > 0;
}
