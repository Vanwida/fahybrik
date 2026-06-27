// Chat service.
//
// Handles thread bootstrapping, message paging, send + read receipts. The
// thread between a coach and an athlete is created lazily on first send —
// neither side has to "open" a new conversation.

import type { Sql } from '@/lib/db';
import type { ChatAttachmentKind, MessageDTO, SendMessageInput } from './schema';
import { notifyOpposite } from './notify';
import { publishMessage } from './pubsub';

// Postgres `timestamptz::text` renders `2026-05-29 11:06:13.234292+00` — a space
// instead of `T` and a `+00` offset. That is NOT valid ISO 8601, so the iOS
// JSONDecoder (.iso8601) rejects it and the whole chat payload fails to decode.
// Normalize any wire-bound timestamp to strict ISO 8601 with a `Z` zulu suffix
// and millisecond precision, which both the iOS decoder and the `messageDtoSchema`
// (z.string().datetime) accept. Cursors keep the raw Postgres text (full µs
// precision) — they are opaque strings to the client and `::timestamptz` re-parses
// either form.
export function toWireIso(pgText: string | null): string | null {
  if (pgText == null) return null;
  // Postgres renders the zone as `+00` / `+02` (no minutes), which `new Date()`
  // rejects. Normalize to `T` separator and a `+HH:MM` offset before parsing.
  const normalized = pgText
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return pgText; // defensive: leave untouched if unparseable
  return d.toISOString();
}

// Raw row shape returned by the chat message SELECTs. `created_at` / `read_at` /
// `edited_at` are Postgres `timestamptz::text`; `created_at` doubles as the
// opaque paging/poll cursor (full µs precision) before `toWireIso` normalizes it.
type MessageRow = {
  id: string;
  thread_id: string;
  sender_user_id: string;
  body: string | null;
  attachment_url: string | null;
  attachment_kind: string | null;
  attachment_meta: unknown;
  created_at: string;
  read_at: string | null;
  edited_at: string | null;
};

function rowToMessageDto(r: MessageRow): MessageDTO {
  return {
    id: r.id,
    thread_id: r.thread_id,
    sender_user_id: r.sender_user_id,
    body: r.body,
    attachment_url: r.attachment_url,
    attachment_kind: (r.attachment_kind as ChatAttachmentKind | null) ?? null,
    attachment_meta: (r.attachment_meta as Record<string, unknown> | null) ?? null,
    created_at: toWireIso(r.created_at)!,
    read_at: toWireIso(r.read_at),
    edited_at: toWireIso(r.edited_at),
  };
}

export type ThreadSummary = {
  thread_id: string;
  coach_id: string;
  athlete_id: string;
  athlete_name: string;
  coach_name: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_for_coach: number;
  unread_for_athlete: number;
};

export async function listThreadsForCoach(args: {
  sql: Sql;
  coach_id: bigint;
}): Promise<ThreadSummary[]> {
  const rows = await args.sql<
    {
      thread_id: string;
      coach_id: string;
      athlete_id: string;
      athlete_name: string;
      coach_name: string;
      last_message_at: string | null;
      last_message_preview: string | null;
      unread_for_coach: number;
      unread_for_athlete: number;
    }[]
  >`
    select t.id::text as thread_id,
           t.coach_id::text as coach_id,
           t.athlete_id::text as athlete_id,
           a.full_name as athlete_name,
           c.full_name as coach_name,
           t.last_message_at::text as last_message_at,
           (
             select coalesce(m.body, '[' || coalesce(m.attachment_kind, 'attach') || ']')
             from chat_messages m
             where m.thread_id = t.id and m.deleted_at is null
             order by m.created_at desc
             limit 1
           ) as last_message_preview,
           t.unread_for_coach,
           t.unread_for_athlete
    from chat_threads t
    join athletes a on a.id = t.athlete_id
    join coaches c on c.id = t.coach_id
    where t.coach_id = ${args.coach_id as unknown as number}
    order by t.last_message_at desc nulls last
  `;
  return rows;
}

export async function getOrCreateThreadForAthlete(args: {
  sql: Sql;
  athlete_id: bigint;
}): Promise<{ thread_id: string; coach_id: bigint } | null> {
  const aRows = await args.sql<{ coach_id: string }[]>`
    select coach_id::text as coach_id from athletes
    where id = ${args.athlete_id as unknown as number}
    limit 1
  `;
  const coach_id_str = aRows[0]?.coach_id;
  if (!coach_id_str) return null;
  const coach_id = BigInt(coach_id_str);

  const existing = await args.sql<{ id: string }[]>`
    select id::text from chat_threads
    where coach_id = ${coach_id as unknown as number}
      and athlete_id = ${args.athlete_id as unknown as number}
    limit 1
  `;
  if (existing[0]) return { thread_id: existing[0].id, coach_id };

  const inserted = await args.sql<{ id: string }[]>`
    insert into chat_threads (coach_id, athlete_id)
    values (${coach_id as unknown as number}, ${args.athlete_id as unknown as number})
    returning id::text
  `;
  return { thread_id: inserted[0]!.id, coach_id };
}

export async function listMessages(args: {
  sql: Sql;
  thread_id: string | bigint;
  cursor: string | null;
  limit?: number;
}): Promise<{ messages: MessageDTO[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const cursor = args.cursor;
  const rows = cursor
    ? await args.sql<MessageRow[]>`
        select id::text, thread_id::text, sender_user_id::text, body,
               attachment_url, attachment_kind, attachment_meta::jsonb as attachment_meta,
               created_at::text, read_at::text, edited_at::text
        from chat_messages
        where thread_id = ${args.thread_id as unknown as string}::bigint
          and deleted_at is null
          and created_at < ${cursor}::timestamptz
        order by created_at desc
        limit ${limit + 1}
      `
    : await args.sql<MessageRow[]>`
        select id::text, thread_id::text, sender_user_id::text, body,
               attachment_url, attachment_kind, attachment_meta::jsonb as attachment_meta,
               created_at::text, read_at::text, edited_at::text
        from chat_messages
        where thread_id = ${args.thread_id as unknown as string}::bigint
          and deleted_at is null
        order by created_at desc
        limit ${limit + 1}
      `;
  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const next_cursor = hasMore ? sliced[sliced.length - 1]!.created_at : null;
  const messages: MessageDTO[] = sliced.map(rowToMessageDto);
  return { messages, next_cursor };
}

// Single message by id — used by the SSE stream to refetch the full DTO after a
// NOTIFY (which carries only ids). Returns null if missing or soft-deleted.
export async function getMessageById(
  sql: Sql,
  message_id: string,
): Promise<MessageDTO | null> {
  const rows = await sql<MessageRow[]>`
    select id::text, thread_id::text, sender_user_id::text, body,
           attachment_url, attachment_kind, attachment_meta::jsonb as attachment_meta,
           created_at::text, read_at::text, edited_at::text
    from chat_messages
    where id = ${message_id}::bigint
      and deleted_at is null
    limit 1
  `;
  return rows[0] ? rowToMessageDto(rows[0]) : null;
}

// Messages across a set of threads created strictly after `after` (a raw
// Postgres timestamptz text cursor), oldest-first. Powers the SSE in-stream poll
// fallback used when the LISTEN/NOTIFY transport is unavailable. The returned
// `cursor` is the raw `created_at` of the last row (µs precision) for the next
// poll, or null when nothing new arrived (caller keeps its current cursor).
export async function listNewMessages(args: {
  sql: Sql;
  thread_ids: bigint[];
  after: string;
  limit?: number;
}): Promise<{ messages: MessageDTO[]; cursor: string | null }> {
  const { sql, thread_ids, after } = args;
  if (thread_ids.length === 0) return { messages: [], cursor: null };
  const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
  const ids = thread_ids.map(String);
  const rows = await sql<MessageRow[]>`
    select id::text, thread_id::text, sender_user_id::text, body,
           attachment_url, attachment_kind, attachment_meta::jsonb as attachment_meta,
           created_at::text, read_at::text, edited_at::text
    from chat_messages
    where thread_id = any(${ids}::bigint[])
      and deleted_at is null
      and created_at > ${after}::timestamptz
    order by created_at asc
    limit ${limit}
  `;
  const cursor = rows.length > 0 ? rows[rows.length - 1]!.created_at : null;
  return { messages: rows.map(rowToMessageDto), cursor };
}

export async function sendMessage(args: {
  sql: Sql;
  thread_id: string | bigint;
  sender_user_id: bigint;
  sender_role: 'coach' | 'athlete';
  input: SendMessageInput;
}): Promise<MessageDTO> {
  const { sql, thread_id, sender_user_id, sender_role, input } = args;
  const inserted = await sql<
    {
      id: string;
      thread_id: string;
      sender_user_id: string;
      body: string | null;
      attachment_url: string | null;
      attachment_kind: string | null;
      attachment_meta: unknown;
      created_at: string;
    }[]
  >`
    insert into chat_messages (
      thread_id, sender_user_id, sender_role, body, attachment_url, attachment_kind, attachment_meta
    ) values (
      ${thread_id as unknown as string}::bigint,
      ${sender_user_id as unknown as number},
      ${sender_role},
      ${input.body ?? null},
      ${input.attachment_url ?? null},
      ${input.attachment_kind ?? null},
      ${input.attachment_meta ? JSON.stringify(input.attachment_meta) : null}::jsonb
    )
    returning id::text, thread_id::text, sender_user_id::text, body,
              attachment_url, attachment_kind, attachment_meta::jsonb as attachment_meta,
              created_at::text
  `;

  const row = inserted[0]!;

  // Update thread last_message_at + bump unread counter for the *other* side.
  if (sender_role === 'coach') {
    await sql`
      update chat_threads
      set last_message_at = ${row.created_at}::timestamptz,
          unread_for_athlete = unread_for_athlete + 1,
          updated_at = now()
      where id = ${thread_id as unknown as string}::bigint
    `;
  } else {
    await sql`
      update chat_threads
      set last_message_at = ${row.created_at}::timestamptz,
          unread_for_coach = unread_for_coach + 1,
          updated_at = now()
      where id = ${thread_id as unknown as string}::bigint
    `;
  }

  // Fan out: in-app notif + APNS push to the recipient. Best-effort.
  notifyOpposite({
    sql,
    thread_id: BigInt(row.thread_id),
    sender_user_id,
    sender_role,
    preview:
      (input.body && input.body.trim().length > 0)
        ? input.body
        : `[${input.attachment_kind ?? 'attachment'}]`,
  }).catch(() => undefined);

  const createdAtIso = toWireIso(row.created_at)!;

  // Publish to SSE subscribers across all instances (Postgres NOTIFY). The
  // notify carries only ids; subscribers refetch the full DTO. Best-effort —
  // the message is already persisted and the poll fallbacks cover any miss.
  void publishMessage(BigInt(row.thread_id), row.id).catch(() => undefined);

  return {
    id: row.id,
    thread_id: row.thread_id,
    sender_user_id: row.sender_user_id,
    body: row.body,
    attachment_url: row.attachment_url,
    attachment_kind: (row.attachment_kind as ChatAttachmentKind | null) ?? null,
    attachment_meta: (row.attachment_meta as Record<string, unknown> | null) ?? null,
    created_at: createdAtIso,
    read_at: null,
    edited_at: null,
  };
}

export async function markRead(args: {
  sql: Sql;
  thread_id: string | bigint;
  reader_role: 'coach' | 'athlete';
  up_to_message_id: string;
}): Promise<{ marked: number }> {
  const { sql, thread_id, reader_role, up_to_message_id } = args;
  const rows = await sql<{ created_at: string }[]>`
    select created_at::text from chat_messages
    where id = ${up_to_message_id}::bigint
      and thread_id = ${thread_id as unknown as string}::bigint
    limit 1
  `;
  if (!rows[0]) return { marked: 0 };
  const cutoff = rows[0].created_at;

  // Mark all messages with created_at <= cutoff as read. The unread counter
  // on the thread row is the per-side accurate value; the read_at column on
  // the message is informational (used by the chat UI to draw the double-tick).
  const updated = await sql<{ id: string }[]>`
    update chat_messages
    set read_at = now()
    where thread_id = ${thread_id as unknown as string}::bigint
      and created_at <= ${cutoff}::timestamptz
      and read_at is null
    returning id::text
  `;

  // Reset unread counter for the reader side.
  if (reader_role === 'coach') {
    await sql`
      update chat_threads set unread_for_coach = 0, updated_at = now()
      where id = ${thread_id as unknown as string}::bigint
    `;
  } else {
    await sql`
      update chat_threads set unread_for_athlete = 0, updated_at = now()
      where id = ${thread_id as unknown as string}::bigint
    `;
  }
  return { marked: updated.length };
}

// SSE pub/sub now lives in `./pubsub` (Postgres LISTEN/NOTIFY, cross-instance).
// `sendMessage` above publishes via that module; the SSE route subscribes there.
