// Read the athlete's wearable connection status — the data behind
// GET /api/athlete/wearables (drives the iOS "Conectar Polar / Conectado" UI).
//
// Provider-GENERIC: returns one entry per row in wearable_connections for the
// athlete (polar today; garmin/suunto/coros later use the same shape), so the
// client renders the list without per-provider special-casing. `connected` is
// true only while status = 'connected' (a 'revoked' | 'error' row still appears,
// flagged not-connected, so the UI can prompt a reconnect instead of pretending
// nothing was ever linked).
//
// `connected_at` is the table's own column (migration 0056, NOT NULL default
// now()): the upsert in token-store leaves it untouched on reconnect, so it reads
// as "connected since" — the first time the link was established.
//
// Injectable `client` (like lib/athlete/dobles-live.ts) so the real-DB test
// exercises the exact SQL against an ephemeral branch.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { WearableProvider } from '@/lib/wearables/token-store';

export interface WearableProviderStatus {
  provider: WearableProvider;
  connected: boolean;
  // ISO 8601 UTC; when the connection was first established.
  connected_at: string;
}

export async function listWearableConnections(
  params: { athlete_id: bigint },
  client: Sql = defaultSql,
): Promise<WearableProviderStatus[]> {
  const rows = await client<
    { provider: WearableProvider; status: string; connected_at: Date }[]
  >`
    select provider, status, connected_at
    from wearable_connections
    where athlete_id = ${params.athlete_id}
    order by provider asc
  `;
  return rows.map((row) => ({
    provider: row.provider,
    connected: row.status === 'connected',
    connected_at: row.connected_at.toISOString(),
  }));
}
