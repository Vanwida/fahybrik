// COROS MCP pull orchestrator. Optional cron + athlete «Sincronizar ahora».
// Incremental window: 90-day first backfill, then max started_at of source=coros.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { COROS_FIT_DAILY_CAP, loadCorosConfig } from '@/lib/coros/config';
import { CorosMcpClient, type CorosMcpSurface } from '@/lib/coros/mcp-client';
import {
  loadWearableConnection,
  markConnectionStatus,
  updateWearableTokens,
} from '@/lib/wearables/token-store';
import { COROS_SOURCE, ingestCorosActivity } from '@/lib/sync/ingest-coros';

const COROS = 'coros' as const;
const BACKFILL_DAYS = 90;
const MAX_WINDOW_DAYS = 90;

export type CorosSyncResult = {
  connections: number;
  synced: number;
  skipped: number;
  errored: number;
  imported: number;
  asked: number;
};

export async function buildCorosClientFor(
  athlete_id: bigint,
  sql: Sql,
): Promise<CorosMcpSurface | null> {
  const cfg = loadCorosConfig();
  if (!cfg.ok) return null;
  const conn = await loadWearableConnection({ athlete_id, provider: COROS, client: sql });
  if (!conn) return null;

  return new CorosMcpClient({
    mcpUrl: cfg.config.mcpUrl,
    tokenEndpoint: cfg.config.tokenEndpoint,
    clientId: cfg.config.clientId,
    clientSecret: cfg.config.clientSecret,
    tokens: {
      access_token: conn.access_token,
      refresh_token: conn.refresh_token ?? null,
      expires_at: conn.expires_at ?? null,
    },
    onTokensRefreshed: async (t) => {
      await updateWearableTokens({
        athlete_id,
        provider: COROS,
        tokens: {
          access_token: t.access_token,
          refresh_token: t.refresh_token ?? null,
          expires_at: t.expires_at ?? null,
          scopes: conn.scopes ?? null,
        },
        client: sql,
      });
    },
    onAuthError: async () => {
      await markConnectionStatus({ athlete_id, provider: COROS, status: 'error', client: sql });
    },
  });
}

export async function runCorosSync(args: {
  sql?: Sql;
  now?: () => Date;
  clientFor?: (athlete_id: bigint, sql: Sql) => Promise<CorosMcpSurface | null>;
  athleteId?: bigint;
}): Promise<CorosSyncResult> {
  const sql = args.sql ?? defaultSql;
  const now = args.now ?? (() => new Date());
  const clientFor = args.clientFor ?? buildCorosClientFor;
  const result: CorosSyncResult = {
    connections: 0,
    synced: 0,
    skipped: 0,
    errored: 0,
    imported: 0,
    asked: 0,
  };

  const conns = args.athleteId
    ? await sql<{ athlete_id: string }[]>`
        select athlete_id::text as athlete_id
        from wearable_connections
        where provider = ${COROS}
          and status = 'connected'
          and athlete_id = ${args.athleteId as unknown as number}
      `
    : await sql<{ athlete_id: string }[]>`
        select athlete_id::text as athlete_id
        from wearable_connections
        where provider = ${COROS} and status = 'connected'
        order by athlete_id
      `;
  result.connections = conns.length;

  for (const row of conns) {
    const athlete_id = BigInt(row.athlete_id);
    try {
      const client = await clientFor(athlete_id, sql);
      if (!client) {
        result.skipped += 1;
        continue;
      }
      const counts = await syncOneAthlete({ sql, athlete_id, client, now });
      result.imported += counts.imported;
      result.asked += counts.asked;
      result.synced += 1;
    } catch {
      result.errored += 1;
    }
  }

  return result;
}

export async function claimCorosFitSlot(args: {
  sql: Sql;
  athlete_id: bigint;
  day: string;
}): Promise<boolean> {
  const { sql, athlete_id, day } = args;
  const id = athlete_id as unknown as number;
  await sql`
    insert into wearable_fit_quota (athlete_id, provider, day, used)
    values (${id}, ${COROS}, ${day}::date, 0)
    on conflict (athlete_id, provider, day) do nothing
  `;
  const rows = await sql<{ used: number }[]>`
    update wearable_fit_quota
    set used = used + 1
    where athlete_id = ${id}
      and provider = ${COROS}
      and day = ${day}::date
      and used < ${COROS_FIT_DAILY_CAP}
    returning used
  `;
  return rows[0] != null;
}

async function syncOneAthlete(args: {
  sql: Sql;
  athlete_id: bigint;
  client: CorosMcpSurface;
  now: () => Date;
}): Promise<{ imported: number; asked: number }> {
  const { sql, athlete_id, client, now } = args;
  const today = startOfUtcDay(now());
  const fromDate = await resolveWindowStart(sql, athlete_id, today);
  const toDate = addDays(today, 1);
  const activities = await client.listActivities(toDateStr(fromDate), toDateStr(toDate));
  const quotaDay = toDateStr(today);
  let imported = 0;
  let asked = 0;

  for (const activity of activities) {
    const result = await ingestCorosActivity({
      sql,
      athlete_id,
      activity,
      loadFit: async () => {
        if (!(await claimCorosFitSlot({ sql, athlete_id, day: quotaDay }))) return null;
        try {
          return await client.downloadFit(activity.id);
        } catch {
          return null;
        }
      },
    });
    if (result.outcome === 'inserted') imported += 1;
    if (result.asked) asked += 1;
  }

  return { imported, asked };
}

async function resolveWindowStart(sql: Sql, athlete_id: bigint, today: Date): Promise<Date> {
  const rows = await sql<{ since: string | null }[]>`
    select max(started_at)::text as since
    from workout_executions
    where athlete_id = ${athlete_id as unknown as number}
      and source = ${COROS_SOURCE}
  `;
  const since = rows[0]?.since ? startOfUtcDay(new Date(rows[0].since)) : null;
  const backfillFloor = addDays(today, -BACKFILL_DAYS);
  const hardFloor = addDays(today, -MAX_WINDOW_DAYS);
  const start = since ?? backfillFloor;
  return start < hardFloor ? hardFloor : start;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
