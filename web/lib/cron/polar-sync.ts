// Polar v4 sync — cron orchestrator.
//
// v4 has no webhooks, so we PULL. For every connected Polar athlete we read the
// v4 list endpoints over an incremental date window and hand each entity to the
// ingest layer (lib/sync/ingest-polar). The route (app/api/cron/polar-sync) is a
// thin Bearer-authed wrapper; all logic lives here so it is unit-testable with an
// injected client.
//
// INCREMENTAL WINDOW (migration-free). v4 exposes no transaction/committed marker
// — just from/to date ranges — so we derive "since when" from what we've already
// stored: the max started_at / recorded_at of this athlete's existing polar rows.
// None yet → a bounded first-time backfill. Overlap is safe because ingest is
// fully idempotent. `to` is tomorrow (exclusive).
//
// COST. Laps and sleep-score require the `features` query param, which limits
// those endpoints to ONE day per request, so training + sleep are fetched
// day-by-day across the window; nightly recharge (no features) is one call.
// Steady-state windows are 1–2 days; a fresh connection backfills BACKFILL_DAYS.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadPolarConfig } from '@/lib/polar/config';
import {
  loadWearableConnection,
  updateWearableTokens,
  markConnectionStatus,
} from '@/lib/wearables/token-store';
import { AccessLinkClient, type PolarV4Client } from '@/lib/polar/accesslink';
import {
  buildSportMap,
  normalizeSession,
  normalizeSleep,
  normalizeRecharge,
} from '@/lib/polar/normalize';
import {
  ingestPolarSession,
  ingestPolarSleep,
  ingestPolarRecharge,
} from '@/lib/sync/ingest-polar';

const POLAR = 'polar' as const;

/**
 * Backfill de una conexión nueva: TODO lo que la API deja, que son 90 días.
 *
 * Estaba en 28 por precaución nuestra, no por límite de Polar — y ese recorte le
 * costaba al atleta dos meses de «antes» el día que conecta. El techo real es el de
 * la lista de entrenamientos de v4 (`MAX_WINDOW_DAYS`), así que aquí no hay nada que
 * pedirle a nadie: se sube y ya. Polar, a diferencia de Apple Salud, sólo entrega
 * desde el momento de la autorización, así que 90 días es literalmente todo el
 * pasado que existe.
 *
 * COSTE, dicho para que no sorprenda: entrenos y sueño se piden día a día (el
 * parámetro `features` los limita a un día por petición), así que una conexión nueva
 * son ~180 llamadas UNA vez. Las tiradas de régimen siguen siendo de 1–2 días.
 */
const BACKFILL_DAYS = 90;
const MAX_WINDOW_DAYS = 90; // hard cap (v4 training list allows ≤90 days)
const RECHARGE_MAX_DAYS = 28; // nightly-recharge (no features) allows ≤28 days per call
const TRAINING_FEATURES = ['laps', 'statistics'];
const SLEEP_FEATURES = ['sleep-score', 'sleep-evaluation'];

export type PolarSyncResult = {
  connections: number;
  synced: number;
  skipped: number;
  errored: number;
  sessions: number;
  sleeps: number;
  recharges: number;
};

// Build a live v4 client bound to an athlete's stored connection. null when the
// integration is not configured or the athlete has no usable connection.
export async function buildPolarClientFor(
  athlete_id: bigint,
  sql: Sql,
): Promise<PolarV4Client | null> {
  const cfg = loadPolarConfig();
  if (!cfg.ok) return null;
  const conn = await loadWearableConnection({ athlete_id, provider: POLAR, client: sql });
  if (!conn) return null;

  return new AccessLinkClient({
    apiBase: cfg.config.apiBase,
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
        provider: POLAR,
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
      await markConnectionStatus({ athlete_id, provider: POLAR, status: 'error', client: sql });
    },
  });
}

export async function runPolarSync(args: {
  sql?: Sql;
  now?: () => Date;
  clientFor?: (athlete_id: bigint, sql: Sql) => Promise<PolarV4Client | null>;
}): Promise<PolarSyncResult> {
  const sql = args.sql ?? defaultSql;
  const now = args.now ?? (() => new Date());
  const clientFor = args.clientFor ?? buildPolarClientFor;

  const result: PolarSyncResult = {
    connections: 0, synced: 0, skipped: 0, errored: 0, sessions: 0, sleeps: 0, recharges: 0,
  };

  const conns = await sql<{ athlete_id: string }[]>`
    select athlete_id::text as athlete_id
    from wearable_connections
    where provider = ${POLAR} and status = 'connected'
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
      result.sessions += counts.sessions;
      result.sleeps += counts.sleeps;
      result.recharges += counts.recharges;
      result.synced += 1;
    } catch {
      // One athlete's failure must not sink the run. markConnectionStatus('error')
      // has already fired inside the client on an auth failure; transient errors
      // just retry next tick.
      result.errored += 1;
    }
  }

  return result;
}

async function syncOneAthlete(args: {
  sql: Sql;
  athlete_id: bigint;
  client: PolarV4Client;
  now: () => Date;
}): Promise<{ sessions: number; sleeps: number; recharges: number }> {
  const { sql, athlete_id, client, now } = args;
  const counts = { sessions: 0, sleeps: 0, recharges: 0 };

  const today = startOfUtcDay(now());
  const fromDate = await resolveWindowStart(sql, athlete_id, today);
  const toDate = addDays(today, 1); // exclusive
  const sports = buildSportMap(await client.listSports());

  // Training + sleep: day by day (features gate them to one day per request).
  for (let d = new Date(fromDate); d < toDate; d = addDays(d, 1)) {
    const from = toDateStr(d);
    const to = toDateStr(addDays(d, 1));

    for (const s of await client.listTrainingSessions(from, to, TRAINING_FEATURES)) {
      const session = normalizeSession(s, sports);
      if (!session) continue;
      await ingestPolarSession({ sql, athlete_id, session });
      counts.sessions += 1;
    }

    for (const n of await client.listSleeps(from, to, SLEEP_FEATURES)) {
      const sleep = normalizeSleep(n);
      if (!sleep) continue;
      await ingestPolarSleep({ sql, athlete_id, sleep });
      counts.sleeps += 1;
    }
  }

  // Nightly recharge: one call over the window, but clamped to the endpoint's
  // 28-day max (idempotency + the daily anchor make a shorter window harmless).
  const rechargeFrom = maxDate(fromDate, addDays(today, -(RECHARGE_MAX_DAYS - 1)));
  for (const r of await client.listNightlyRecharge(toDateStr(rechargeFrom), toDateStr(toDate))) {
    const recharge = normalizeRecharge(r);
    if (!recharge) continue;
    await ingestPolarRecharge({ sql, athlete_id, recharge });
    counts.recharges += 1;
  }

  return counts;
}

// Window start = the day of this athlete's most recent polar data (so we re-scan
// that day for late arrivals), else a bounded backfill. Never earlier than the
// MAX_WINDOW cap.
async function resolveWindowStart(sql: Sql, athlete_id: bigint, today: Date): Promise<Date> {
  const rows = await sql<{ since: string | null }[]>`
    select greatest(
      (select max(started_at) from workout_executions where athlete_id = ${athlete_id as unknown as number} and source = ${POLAR}),
      (select max(recorded_at) from biometric_streams where athlete_id = ${athlete_id as unknown as number} and source = ${POLAR})
    )::text as since
  `;
  const since = rows[0]?.since ? startOfUtcDay(new Date(rows[0].since)) : null;
  const backfillFloor = addDays(today, -BACKFILL_DAYS);
  const hardFloor = addDays(today, -MAX_WINDOW_DAYS);
  const start = since ?? backfillFloor;
  return start < hardFloor ? hardFloor : start;
}

// ── date helpers (UTC day granularity) ───────────────────────────────────────
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
function maxDate(a: Date, b: Date): Date {
  return a >= b ? a : b;
}
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
