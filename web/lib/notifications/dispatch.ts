// Notification dispatch.
//
// Single entry point used by every server-side trigger (chat send, check-in
// adaptive flag, race countdown, HRV crash, workout edit, etc.). Two effects:
//
//   1. Insert a row into `notifications` so the in-app inbox shows it.
//   2. Best-effort APNS push to all live device tokens for the user. Push
//      failure does NOT roll back the inbox row — the in-app inbox is the
//      durable channel, push is a courtesy.

import type { Sql } from '@/lib/db';
import { sendPush } from '@/lib/push/apns';

export type NotificationType =
  | 'workout_assigned'
  | 'workout_edited'
  | 'chat_message'
  | 'event_reminder'
  | 'recovery_alert'
  | 'milestone'
  | 'system';

export type DispatchInput = {
  sql: Sql;
  user_id: bigint;
  type: NotificationType;
  payload: Record<string, unknown>;
  push?: {
    title: string;
    body: string;
    // Optional thread_id, athlete_id, etc. forwarded as APS custom data so
    // the iOS app can deep-link into the right screen.
    deeplink?: Record<string, unknown>;
    badge?: number;
  };
};

export async function dispatchNotification(input: DispatchInput): Promise<{ id: string }> {
  const { sql, user_id, type, payload, push } = input;
  const rows = await sql<{ id: string }[]>`
    insert into notifications (user_id, type, payload_json)
    values (${user_id as unknown as number}, ${type}::notification_type, ${JSON.stringify(payload)}::jsonb)
    returning id::text
  `;
  const id = rows[0]!.id;

  if (push) {
    sendPush({
      sql,
      user_id,
      title: push.title,
      body: push.body,
      deeplink: push.deeplink,
      badge: push.badge,
      category: type,
    }).catch(() => undefined);
  }

  return { id };
}

// Convenience: notify the coach for a given athlete. Resolves the coach
// associated with the athlete via the athletes.coach_id FK.
export async function notifyCoach(args: {
  sql: Sql;
  athlete_id: bigint;
  type: NotificationType;
  payload: Record<string, unknown>;
  push?: DispatchInput['push'];
}): Promise<{ id: string } | null> {
  const { sql, athlete_id, type, payload, push } = args;
  const rows = await sql<{ user_id: string }[]>`
    select c.user_id::text as user_id
    from athletes a
    join coaches c on c.id = a.coach_id
    where a.id = ${athlete_id as unknown as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return dispatchNotification({
    sql,
    user_id: BigInt(row.user_id),
    type,
    payload,
    push,
  });
}

export async function notifyAthlete(args: {
  sql: Sql;
  athlete_id: bigint;
  type: NotificationType;
  payload: Record<string, unknown>;
  push?: DispatchInput['push'];
}): Promise<{ id: string } | null> {
  const { sql, athlete_id, type, payload, push } = args;
  const rows = await sql<{ user_id: string }[]>`
    select user_id::text as user_id from athletes
    where id = ${athlete_id as unknown as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return dispatchNotification({
    sql,
    user_id: BigInt(row.user_id),
    type,
    payload,
    push,
  });
}
