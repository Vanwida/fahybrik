// Chat → notification fan-out. Insulated from chat/service.ts to avoid an
// import cycle between chat publish + APNS dispatch.

import type { Sql } from '@/lib/db';
import { coachRecipientUserIds, dispatchNotification } from '@/lib/notifications/dispatch';

export async function notifyOpposite(args: {
  sql: Sql;
  thread_id: bigint;
  sender_user_id: bigint;
  sender_role: 'coach' | 'athlete';
  preview: string;
}): Promise<void> {
  const { sql, thread_id, sender_role, preview } = args;
  const rows = await sql<
    {
      coach_id: string;
      athlete_user_id: string;
      coach_name: string;
      athlete_name: string;
      unread_for_athlete: number;
    }[]
  >`
    select t.coach_id::text as coach_id,
           a.user_id::text as athlete_user_id,
           c.full_name as coach_name,
           a.full_name as athlete_name,
           t.unread_for_athlete
    from chat_threads t
    join coaches c on c.id = t.coach_id
    join athletes a on a.id = t.athlete_id
    where t.id = ${thread_id as unknown as number}
    limit 1
  `;
  const ctx = rows[0];
  if (!ctx) return;

  const senderName = sender_role === 'coach' ? ctx.coach_name : ctx.athlete_name;
  const trimmed = preview.length > 140 ? preview.slice(0, 137) + '…' : preview;

  // Destinatarios: el mensaje del coach va al atleta; el del atleta, a TODOS
  // los miembros activos del workspace del coach (cada uno entra con SU
  // usuario — el user_id legacy del club no lo mira nadie).
  const recipients =
    sender_role === 'coach'
      ? [BigInt(ctx.athlete_user_id)]
      : await coachRecipientUserIds(sql, BigInt(ctx.coach_id));

  // Globito del icono. Se llama DESPUÉS de subir los contadores, así que lo
  // leído aquí ya incluye este mensaje. El del coach cuenta CONVERSACIONES con
  // algo pendiente (igual que el badge del sidebar); el del atleta, sus
  // mensajes sin leer — solo tiene una conversación.
  let badge: number | undefined;
  if (sender_role === 'athlete') {
    const unread = await sql<{ n: number }[]>`
      select count(*)::int as n from chat_threads
      where coach_id = ${ctx.coach_id}::bigint and unread_for_coach > 0
    `;
    badge = unread[0]?.n;
  } else {
    badge = ctx.unread_for_athlete;
  }

  for (const recipient_user_id of recipients) {
    await dispatchNotification({
      sql,
      user_id: recipient_user_id,
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
        badge,
      },
    });
  }
}
