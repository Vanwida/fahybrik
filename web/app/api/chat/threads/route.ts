// GET /api/chat/threads
//
// Coach: every thread for their cohort (with last message + unread count).
// Athlete: their single thread with their coach (auto-created on first read).

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import {
  getOrCreateThreadForAthlete,
  listThreadsForCoach,
  toWireIso,
} from '@/lib/chat/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const principal = await resolveChatPrincipal(req);
  if (!principal) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }

  if (principal.role === 'coach') {
    const threads = await listThreadsForCoach({ sql, coach_id: principal.coach_id });
    return jsonOk({ threads });
  }

  // Athlete view: surface their single thread (creates lazily so the iOS app
  // never sees an empty list when the coach hasn't messaged first).
  const thread = await getOrCreateThreadForAthlete({ sql, athlete_id: principal.athlete_id });
  if (!thread) return jsonOk({ threads: [] });

  const rows = await sql<
    {
      thread_id: string;
      coach_id: string;
      athlete_id: string;
      athlete_name: string;
      coach_name: string;
      last_message_at: string | null;
      last_message_preview: string | null;
      last_coach_message: string | null;
      last_coach_voice_duration_ms: number | null;
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
           -- ADDITIVE: the latest message authored BY THE COACH (sender_user_id =
           -- the coach's user_id, not coaches.id). Drives the Today coach-note row.
           -- NULL when the coach has not messaged yet.
           (
             select m.body
             from chat_messages m
             where m.thread_id = t.id and m.deleted_at is null
               and m.sender_user_id = c.user_id
             order by m.created_at desc
             limit 1
           ) as last_coach_message,
           -- Voice-note duration of that latest coach message when it is a voice
           -- attachment (attachment_meta.duration_ms jsonb). NULL otherwise — no
           -- migration: read straight from the existing jsonb if present.
           (
             select (m.attachment_meta->>'duration_ms')::int
             from chat_messages m
             where m.thread_id = t.id and m.deleted_at is null
               and m.sender_user_id = c.user_id
               and m.attachment_kind = 'voice'
             order by m.created_at desc
             limit 1
           ) as last_coach_voice_duration_ms,
           t.unread_for_coach,
           t.unread_for_athlete
    from chat_threads t
    join coaches c on c.id = t.coach_id
    join athletes a on a.id = t.athlete_id
    where t.id = ${thread.thread_id}::bigint
    limit 1
  `;
  // Normalize the Postgres `timestamptz::text` to strict ISO 8601 so the iOS
  // decoder (.iso8601) accepts `last_message_at` — same fix as the messages DTO.
  const threads = rows.map((r) => ({ ...r, last_message_at: toWireIso(r.last_message_at) }));
  return jsonOk({ threads });
}
