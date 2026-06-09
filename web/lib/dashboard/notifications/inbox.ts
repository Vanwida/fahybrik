import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

export interface CoachNotification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

export async function listCoachNotifications(params: {
  user_id: number | bigint;
  limit?: number;
  client?: Sql;
}): Promise<{ items: CoachNotification[]; unread_count: number }> {
  const client = params.client ?? defaultSql;
  const limit = params.limit ?? 30;

  const items = await client<
    Array<{
      id: string;
      type: string;
      payload_json: Record<string, unknown>;
      created_at: string;
      read_at: string | null;
    }>
  >`
    select
      id::text,
      type::text,
      payload_json,
      created_at::text,
      read_at::text
    from notifications
    where user_id = ${params.user_id}
    order by created_at desc
    limit ${limit}
  `;

  const unread = await client<Array<{ n: number }>>`
    select count(*)::int as n from notifications
    where user_id = ${params.user_id} and read_at is null
  `;

  return {
    items: items.map((r) => ({
      id: r.id,
      type: r.type,
      payload: r.payload_json ?? {},
      created_at: r.created_at,
      read_at: r.read_at,
    })),
    unread_count: unread[0]?.n ?? 0,
  };
}

export async function markNotificationRead(params: {
  user_id: number | bigint;
  notification_id: number;
  client?: Sql;
}): Promise<void> {
  const client = params.client ?? defaultSql;
  await client`
    update notifications set read_at = now()
    where id = ${params.notification_id} and user_id = ${params.user_id}
  `;
}

export async function markAllNotificationsRead(params: {
  user_id: number | bigint;
  client?: Sql;
}): Promise<{ updated: number }> {
  const client = params.client ?? defaultSql;
  const rows = await client<Array<{ id: string }>>`
    update notifications set read_at = now()
    where user_id = ${params.user_id} and read_at is null
    returning id::text
  `;
  return { updated: rows.length };
}
