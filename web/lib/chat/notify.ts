// Chat → notification fan-out. Insulated from chat/service.ts to avoid an
// import cycle between chat publish + APNS dispatch.

import type { Sql } from '@/lib/db';
import { dispatchNotification } from '@/lib/notifications/dispatch';

export async function notifyOpposite(args: {
  sql: Sql;
  thread_id: bigint;
  sender_user_id: bigint;
  sender_role: 'coach' | 'athlete';
  preview: string;
}): Promise<void> {
  const { sql, thread_id, sender_role, preview } = args;
  const rows = await sql<
    { coach_user_id: string; athlete_user_id: string; coach_name: string; athlete_name: string }[]
  >`
    select c.user_id::text as coach_user_id,
           a.user_id::text as athlete_user_id,
           c.full_name as coach_name,
           a.full_name as athlete_name
    from chat_threads t
    join coaches c on c.id = t.coach_id
    join athletes a on a.id = t.athlete_id
    where t.id = ${thread_id as unknown as number}
    limit 1
  `;
  const ctx = rows[0];
  if (!ctx) return;

  const recipient_user_id = sender_role === 'coach' ? ctx.athlete_user_id : ctx.coach_user_id;
  const senderName = sender_role === 'coach' ? ctx.coach_name : ctx.athlete_name;
  const trimmed = preview.length > 140 ? preview.slice(0, 137) + '…' : preview;

  await dispatchNotification({
    sql,
    user_id: BigInt(recipient_user_id),
    type: 'chat_message',
    payload: {
      thread_id: thread_id.toString(),
      sender_role,
      preview: trimmed,
    },
    push: {
      title: senderName,
      body: trimmed,
      deeplink: { kind: 'chat', thread_id: thread_id.toString() },
    },
  });
}
