// GET /api/notifications
//
// Pablo's (and any logged-in athlete's) notification inbox. Paginated by
// created_at cursor. Filter by status: 'unread' | 'all' | 'read'.

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  let user_id: bigint | null = null;
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (athlete) user_id = athlete.user_id;
  if (!user_id) {
    const coach = await getCoachSession();
    if (coach) user_id = coach.user_id;
  }
  if (!user_id) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'all';
  const cursor = url.searchParams.get('cursor');
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);

  type Row = {
    id: string;
    type: string;
    payload_json: unknown;
    created_at: string;
    read_at: string | null;
  };

  const rows = await runQuery({ user_id, status, cursor, limit });

  async function runQuery(p: {
    user_id: bigint;
    status: string;
    cursor: string | null;
    limit: number;
  }): Promise<Row[]> {
    const onlyUnread = p.status === 'unread';
    const onlyRead = p.status === 'read';

    if (p.cursor && onlyUnread) {
      return await sql<Row[]>`
        select id::text, type::text, payload_json,
               created_at::text, read_at::text
        from notifications
        where user_id = ${p.user_id as unknown as number}
          and read_at is null
          and created_at < ${p.cursor}::timestamptz
        order by created_at desc
        limit ${p.limit + 1}
      `;
    }
    if (p.cursor && onlyRead) {
      return await sql<Row[]>`
        select id::text, type::text, payload_json,
               created_at::text, read_at::text
        from notifications
        where user_id = ${p.user_id as unknown as number}
          and read_at is not null
          and created_at < ${p.cursor}::timestamptz
        order by created_at desc
        limit ${p.limit + 1}
      `;
    }
    if (p.cursor) {
      return await sql<Row[]>`
        select id::text, type::text, payload_json,
               created_at::text, read_at::text
        from notifications
        where user_id = ${p.user_id as unknown as number}
          and created_at < ${p.cursor}::timestamptz
        order by created_at desc
        limit ${p.limit + 1}
      `;
    }
    if (onlyUnread) {
      return await sql<Row[]>`
        select id::text, type::text, payload_json,
               created_at::text, read_at::text
        from notifications
        where user_id = ${p.user_id as unknown as number}
          and read_at is null
        order by created_at desc
        limit ${p.limit + 1}
      `;
    }
    if (onlyRead) {
      return await sql<Row[]>`
        select id::text, type::text, payload_json,
               created_at::text, read_at::text
        from notifications
        where user_id = ${p.user_id as unknown as number}
          and read_at is not null
        order by created_at desc
        limit ${p.limit + 1}
      `;
    }
    return await sql<Row[]>`
      select id::text, type::text, payload_json,
             created_at::text, read_at::text
      from notifications
      where user_id = ${p.user_id as unknown as number}
      order by created_at desc
      limit ${p.limit + 1}
    `;
  }

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const next_cursor = hasMore ? items[items.length - 1]!.created_at : null;

  // Total unread count for badge.
  const unreadRows = await sql<{ n: string }[]>`
    select count(*)::text as n from notifications
    where user_id = ${user_id as unknown as number} and read_at is null
  `;
  const unread = Number(unreadRows[0]?.n ?? '0');

  return jsonOk({ items, next_cursor, unread });
}
