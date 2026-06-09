// Coach-side chat service.
//
// Mirrors `web/lib/chat/service.ts` but scoped strictly to the coach app's
// session shape (coach_id + user_id are numbers, not bigint, per
// coach/lib/auth/coach-session.ts).
//
// One thread per (coach_id, athlete_id) — enforced by the DB unique
// constraint `chat_threads_coach_athlete_unique`. `getOrCreateThread` is
// idempotent: concurrent first-sends from coach and athlete cannot create
// duplicates thanks to ON CONFLICT DO NOTHING + the unique key.

import 'server-only';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

export type CoachThreadSummary = {
  thread_id: string;
  athlete_id: string;
  athlete_full_name: string;
  last_message_at: string | null;
  last_message_body: string | null;
  unread_count: number;
};

export type CoachChatMessage = {
  id: string;
  thread_id: string;
  sender_role: 'coach' | 'athlete';
  sender_user_id: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
};

// -----------------------------------------------------------------------------
// Thread lifecycle
// -----------------------------------------------------------------------------

/**
 * Idempotent: returns the unique (coach_id, athlete_id) thread, creating it on
 * first call. Concurrent callers all converge to the same row because the
 * insert is `on conflict do nothing` against the unique constraint and we
 * re-select on miss.
 */
export async function getOrCreateThread(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<{ thread_id: string; coach_id: number | bigint; athlete_id: number }> {
  const client = params.client ?? defaultSql;
  const { coach_id, athlete_id } = params;

  // Try insert first — cheaper than SELECT-then-INSERT when no row exists yet
  // and avoids a TOCTOU race.
  const inserted = await client<{ id: string }[]>`
    insert into chat_threads (coach_id, athlete_id)
    values (${coach_id}, ${athlete_id})
    on conflict (coach_id, athlete_id) do nothing
    returning id::text
  `;
  if (inserted[0]) {
    return { thread_id: inserted[0].id, coach_id, athlete_id };
  }
  const existing = await client<{ id: string }[]>`
    select id::text from chat_threads
    where coach_id = ${coach_id} and athlete_id = ${athlete_id}
    limit 1
  `;
  if (!existing[0]) {
    throw new Error('chat_threads upsert race lost — row not found after conflict');
  }
  return { thread_id: existing[0].id, coach_id, athlete_id };
}

/**
 * Verifies that a thread belongs to the given coach. Returns athlete_id when
 * owned, null otherwise. Used to gate every per-thread coach endpoint.
 */
export async function getCoachThread(params: {
  thread_id: string;
  coach_id: number | bigint;
  client?: Sql;
}): Promise<{ thread_id: string; athlete_id: number } | null> {
  const client = params.client ?? defaultSql;
  if (!/^\d+$/.test(params.thread_id)) return null;
  const rows = await client<{ id: string; athlete_id: string }[]>`
    select id::text, athlete_id::text
    from chat_threads
    where id = ${params.thread_id}::bigint
      and coach_id = ${params.coach_id}
    limit 1
  `;
  if (!rows[0]) return null;
  return { thread_id: rows[0].id, athlete_id: Number(rows[0].athlete_id) };
}

// -----------------------------------------------------------------------------
// Listing
// -----------------------------------------------------------------------------

export async function listThreadsForCoach(params: {
  coach_id: number | bigint;
  client?: Sql;
}): Promise<CoachThreadSummary[]> {
  const client = params.client ?? defaultSql;
  const rows = await client<
    {
      thread_id: string;
      athlete_id: string;
      athlete_full_name: string;
      last_message_at: string | null;
      last_message_body: string | null;
      unread_count: number;
    }[]
  >`
    select t.id::text as thread_id,
           t.athlete_id::text as athlete_id,
           a.full_name as athlete_full_name,
           t.last_message_at::text as last_message_at,
           (
             select coalesce(m.body, '[' || coalesce(m.attachment_kind, 'attach') || ']')
             from chat_messages m
             where m.thread_id = t.id and m.deleted_at is null
             order by m.created_at desc
             limit 1
           ) as last_message_body,
           t.unread_for_coach as unread_count
    from chat_threads t
    join athletes a on a.id = t.athlete_id
    where t.coach_id = ${params.coach_id}
    order by t.last_message_at desc nulls last
  `;
  return rows;
}

// -----------------------------------------------------------------------------
// Messages
// -----------------------------------------------------------------------------

/**
 * Polling-friendly: when `since` is set, returns only newer messages in ASC
 * order (so the client can append). When `since` is null, returns the last
 * `limit` messages in ASC order (newest at the end) so the iOS list is
 * naturally ordered for rendering.
 */
export async function loadMessages(params: {
  thread_id: string;
  since?: string | null | undefined;
  limit?: number | undefined;
  client?: Sql | undefined;
}): Promise<CoachChatMessage[]> {
  const client = params.client ?? defaultSql;
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const since = params.since ?? null;

  type Row = {
    id: string;
    thread_id: string;
    coach_id: string;
    sender_user_id: string;
    body: string | null;
    created_at: string;
    read_at: string | null;
  };

  if (since) {
    const rows = await client<Row[]>`
      select m.id::text, m.thread_id::text, t.coach_id::text,
             m.sender_user_id::text, m.body,
             m.created_at::text, m.read_at::text
      from chat_messages m
      join chat_threads t on t.id = m.thread_id
      where m.thread_id = ${params.thread_id}::bigint
        and m.deleted_at is null
        and m.created_at > ${since}::timestamptz
      order by m.created_at asc
      limit ${limit}
    `;
    return rows.map(toMessageDTO);
  }

  // No cursor: grab the last N then re-sort ASC for rendering.
  const rows = await client<Row[]>`
    select m.id::text, m.thread_id::text, t.coach_id::text,
           m.sender_user_id::text, m.body,
           m.created_at::text, m.read_at::text
    from chat_messages m
    join chat_threads t on t.id = m.thread_id
    where m.thread_id = ${params.thread_id}::bigint
      and m.deleted_at is null
    order by m.created_at desc
    limit ${limit}
  `;
  return rows.reverse().map(toMessageDTO);
}

function toMessageDTO(r: {
  id: string;
  thread_id: string;
  coach_id: string;
  sender_user_id: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
}): CoachChatMessage {
  // sender_role is derived from whether sender_user_id matches the coach's
  // user_id on the thread. The thread row carries coach_id (athlete id row),
  // not user_id, so we look up by joining elsewhere — see send/load paths.
  // Here we infer at the caller. For now we mark it 'coach' only if explicit.
  return {
    id: r.id,
    thread_id: r.thread_id,
    sender_role: 'athlete', // placeholder; set by infer step below
    sender_user_id: r.sender_user_id,
    body: r.body,
    created_at: r.created_at,
    read_at: r.read_at,
  };
}

/**
 * Given a list of messages and the thread's owners, stamps `sender_role` by
 * comparing sender_user_id with the coach/athlete user_ids on the thread.
 * Kept separate from `loadMessages` so callers can avoid the extra join when
 * sender_role isn't needed (e.g., raw exports).
 */
export async function inferSenderRoles(params: {
  thread_id: string;
  messages: CoachChatMessage[];
  client?: Sql;
}): Promise<CoachChatMessage[]> {
  if (params.messages.length === 0) return params.messages;
  const client = params.client ?? defaultSql;
  const owners = await client<
    { coach_user_id: string; athlete_user_id: string }[]
  >`
    select c.user_id::text as coach_user_id,
           a.user_id::text as athlete_user_id
    from chat_threads t
    join coaches c on c.id = t.coach_id
    join athletes a on a.id = t.athlete_id
    where t.id = ${params.thread_id}::bigint
    limit 1
  `;
  const o = owners[0];
  if (!o) return params.messages;
  return params.messages.map((m) => ({
    ...m,
    sender_role:
      m.sender_user_id === o.coach_user_id
        ? 'coach'
        : m.sender_user_id === o.athlete_user_id
          ? 'athlete'
          : 'athlete',
  }));
}

/**
 * Inserts a coach-authored message and bumps the thread's last_message_at +
 * athlete-side unread counter atomically (one transaction). Also fans out a
 * `chat_message` notification to the athlete's user_id (best-effort — failure
 * to insert the notif row does NOT roll back the message).
 */
export async function sendCoachMessage(params: {
  thread_id: string;
  coach_user_id: number | bigint;
  body: string;
  client?: Sql;
}): Promise<CoachChatMessage> {
  const client = params.client ?? defaultSql;
  const trimmed = params.body.trim();

  const result = await client.begin(async (tx) => {
    const inserted = await tx<
      {
        id: string;
        thread_id: string;
        sender_user_id: string;
        body: string | null;
        created_at: string;
        read_at: string | null;
      }[]
    >`
      insert into chat_messages (thread_id, sender_user_id, body)
      values (
        ${params.thread_id}::bigint,
        ${params.coach_user_id},
        ${trimmed}
      )
      returning id::text, thread_id::text, sender_user_id::text, body,
                created_at::text, read_at::text
    `;
    const row = inserted[0];
    if (!row) throw new Error('chat_messages insert returned no row');

    await tx`
      update chat_threads
      set last_message_at = ${row.created_at}::timestamptz,
          unread_for_athlete = unread_for_athlete + 1,
          updated_at = now()
      where id = ${params.thread_id}::bigint
    `;
    return row;
  });

  const message: CoachChatMessage = {
    id: result.id,
    thread_id: result.thread_id,
    sender_role: 'coach',
    sender_user_id: result.sender_user_id,
    body: result.body,
    created_at: result.created_at,
    read_at: result.read_at,
  };

  // Best-effort notification fan-out to the athlete. Skipped silently if the
  // 'chat_message' type isn't in the notification_type enum (it is, as of
  // the 0001 init migration, but we guard for safety).
  void notifyAthleteOfCoachMessage({
    client,
    thread_id: params.thread_id,
    preview: trimmed,
  }).catch(() => undefined);

  return message;
}

/**
 * Marks every athlete-authored message in the thread as read (read_at = now())
 * and resets the coach's unread counter. Idempotent — second call is a no-op.
 * Spec: "marca todos los mensajes del athlete como read_at=now() para este
 * thread", so this does NOT take a cursor message id, unlike the web variant.
 */
export async function markCoachRead(params: {
  thread_id: string;
  client?: Sql;
}): Promise<{ marked: number }> {
  const client = params.client ?? defaultSql;
  const result = await client.begin(async (tx) => {
    const updated = await tx<{ id: string }[]>`
      update chat_messages m
      set read_at = now()
      from chat_threads t,
           coaches c,
           athletes a
      where m.thread_id = ${params.thread_id}::bigint
        and m.read_at is null
        and m.deleted_at is null
        and t.id = m.thread_id
        and c.id = t.coach_id
        and a.id = t.athlete_id
        and m.sender_user_id = a.user_id
      returning m.id::text
    `;
    await tx`
      update chat_threads
      set unread_for_coach = 0, updated_at = now()
      where id = ${params.thread_id}::bigint
    `;
    return updated;
  });
  return { marked: result.length };
}

// -----------------------------------------------------------------------------
// Notifications (best-effort)
// -----------------------------------------------------------------------------

async function notifyAthleteOfCoachMessage(params: {
  client: Sql;
  thread_id: string;
  preview: string;
}): Promise<void> {
  const { client, thread_id, preview } = params;
  const trimmed = preview.length > 140 ? preview.slice(0, 137) + '…' : preview;
  const rows = await client<{ athlete_user_id: string }[]>`
    select a.user_id::text as athlete_user_id
    from chat_threads t
    join athletes a on a.id = t.athlete_id
    where t.id = ${thread_id}::bigint
    limit 1
  `;
  const ctx = rows[0];
  if (!ctx) return;
  await client`
    insert into notifications (user_id, type, payload_json)
    values (
      ${Number(ctx.athlete_user_id)},
      'chat_message',
      ${JSON.stringify({
        thread_id,
        sender_role: 'coach',
        preview: trimmed,
      })}::jsonb
    )
  `;
}
