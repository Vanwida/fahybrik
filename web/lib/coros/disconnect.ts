// Revoke the COROS MCP token and mark the row revoked. Historial stays.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { corosUsesBasicAuth, resolveCorosRuntime } from '@/lib/coros/dcr';
import { revokeToken } from '@/lib/oauth/oauth2';
import {
  loadWearableConnection,
  markConnectionStatus,
} from '@/lib/wearables/token-store';

const COROS = 'coros' as const;

export async function disconnectCoros(args: {
  athlete_id: bigint;
  sql?: Sql;
}): Promise<void> {
  const sql = args.sql ?? defaultSql;
  const runtime = await resolveCorosRuntime();
  const tokens = await loadWearableConnection({
    athlete_id: args.athlete_id,
    provider: COROS,
    client: sql,
  });
  if (runtime.ok && tokens) {
    try {
      await revokeToken({
        revokeEndpoint: runtime.config.revokeEndpoint,
        clientId: runtime.config.clientId,
        clientSecret: runtime.config.clientSecret,
        token: tokens.access_token,
        tokenTypeHint: 'access_token',
        basicAuth: corosUsesBasicAuth(runtime.config),
      });
    } catch {
      // Token already dead at the provider — we still mark revoked locally.
    }
  }
  await markConnectionStatus({
    athlete_id: args.athlete_id,
    provider: COROS,
    status: 'revoked',
    client: sql,
  });
}
