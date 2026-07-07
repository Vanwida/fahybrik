import 'server-only';

// =============================================================================
// Dobles SIMULATION — athlete-side EDIT (mig 0099, pair-owned reparto)
//
// The reparto is the pair's: the coach recommends, but EITHER athlete may adjust
// it from the app (last-write-wins). This module owns the write correctness for
// the athlete path so it can never diverge from the coach path:
//
//   1. CANONICAL orientation. There is ONE row per pair, stored with
//      athlete_a_user_id = doubles_pairs.athlete_a (the coach editor writes the
//      same, launched from the pair's athlete_a). The athlete PUT MUST reuse that
//      orientation — writing a mirrored (b,a) row would create a duplicate the
//      unique index (a,b,coalesce(event,0)) wouldn't catch. So we resolve the
//      pair's canonical a/b from doubles_pairs and upsert with THAT, regardless of
//      which side the editing athlete is on.
//   2. SELF→A FLIP. The athlete edits self-centric (self/partner/split); we flip
//      to A-centric storage via `reader_is_a` (exact inverse of the read flip in
//      dobles-simulation.ts), then normalize so a stored share never contradicts
//      assigned_to.
//   3. PROVENANCE. Every write stamps last_edited_by_kind + _user_id so all
//      surfaces show "Propuesta de Pablo" / "Ajustado por Guillem hace 2h".
// =============================================================================

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  athleteSplitToStored,
  normalizeStationSplit,
  type AthleteSimulationPutInput,
  type DoblesEditorKind,
} from '@fahybrid/shared/schema/dobles-simulation';

/** First word of a full name, or null. */
function firstName(full: string | null | undefined): string | null {
  const t = full?.trim();
  return t ? (t.split(/\s+/)[0] ?? null) : null;
}

/** The pair's canonical orientation + display names + coach, from the athlete's side. */
export interface CanonicalDoblesPair {
  a_user_id: bigint;
  a_name: string | null;
  b_user_id: bigint;
  b_name: string | null;
  coach_id: bigint;
  coach_name: string | null;
  /** Whether the REQUESTING athlete is stored as A (drives the self→A flip). */
  reader_is_a: boolean;
}

/**
 * Resolve the requesting athlete's ACTIVE Dobles pair to its canonical A/B
 * orientation (from doubles_pairs — the single source of truth), with both
 * athletes' user ids + first names and the shared coach. Returns null when the
 * athlete has no active pair. `reader_is_a` is derived from the caller's user id.
 */
export async function resolveCanonicalDoblesPair(
  self_athlete_id: bigint,
  self_user_id: bigint,
  client: Sql = defaultSql,
): Promise<CanonicalDoblesPair | null> {
  const rows = await client<
    {
      a_user_id: string;
      a_name: string | null;
      b_user_id: string;
      b_name: string | null;
      coach_id: string;
      coach_name: string | null;
    }[]
  >`
    select
      ua.id::text        as a_user_id,
      aa.full_name       as a_name,
      ub.id::text        as b_user_id,
      ab.full_name       as b_name,
      c.id::text         as coach_id,
      c.full_name        as coach_name
    from doubles_pairs dp
    join athletes aa on aa.id = dp.athlete_a_id
    join users ua on ua.id = aa.user_id and ua.deleted_at is null
    join athletes ab on ab.id = dp.athlete_b_id
    join users ub on ub.id = ab.user_id and ub.deleted_at is null
    join coaches c on c.id = aa.coach_id
    where dp.status = 'active'
      and (dp.athlete_a_id = ${self_athlete_id} or dp.athlete_b_id = ${self_athlete_id})
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;

  return {
    a_user_id: BigInt(row.a_user_id),
    a_name: firstName(row.a_name),
    b_user_id: BigInt(row.b_user_id),
    b_name: firstName(row.b_name),
    coach_id: BigInt(row.coach_id),
    coach_name: firstName(row.coach_name),
    reader_is_a: BigInt(row.a_user_id) === self_user_id,
  };
}

/**
 * Apply an athlete's self-centric edit to the pair's simulation: flip to
 * A-centric storage, normalize, and idempotently upsert the SINGLE canonical row
 * with athlete provenance. Returns the new updated_at ISO string.
 */
export async function upsertAthleteSimulation(params: {
  pair: CanonicalDoblesPair;
  editor_user_id: bigint;
  input: AthleteSimulationPutInput;
  client?: Sql;
}): Promise<string> {
  const client = params.client ?? defaultSql;
  const { pair } = params;

  // Self-centric → A-centric, then normalize (a→1, b→0, split→clamp).
  const stored = params.input.station_splits
    .map((s) => athleteSplitToStored(s, pair.reader_is_a))
    .map(normalizeStationSplit);

  // The athlete edits the STATION reparto only; the coach's running/roxzone/
  // tactical notes are PRESERVED (on insert they start null; on conflict they are
  // left untouched — not in the update set). Only station_splits + provenance move.
  const rows = await client<{ updated_at: string }[]>`
    insert into dobles_simulations (
      athlete_a_user_id,
      athlete_b_user_id,
      target_event_id,
      station_splits,
      running_note,
      roxzone_note,
      tactical_note,
      created_by_coach_id,
      last_edited_by_kind,
      last_edited_by_user_id
    ) values (
      ${pair.a_user_id},
      ${pair.b_user_id},
      ${null},
      ${client.json(stored)},
      ${null},
      ${null},
      ${null},
      ${pair.coach_id},
      ${'athlete'},
      ${params.editor_user_id}
    )
    on conflict (athlete_a_user_id, athlete_b_user_id, coalesce(target_event_id, 0))
    do update set
      station_splits         = excluded.station_splits,
      last_edited_by_kind    = excluded.last_edited_by_kind,
      last_edited_by_user_id = excluded.last_edited_by_user_id,
      updated_at             = now()
    returning updated_at::text as updated_at
  `;
  return rows[0]?.updated_at ?? new Date().toISOString();
}
