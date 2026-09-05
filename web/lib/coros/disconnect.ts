// Revoke the COROS MCP token and mark the row revoked. Historial stays.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadCorosConfig } from '@/lib/coros/config';
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
  const cfg = loadCorosConfig();
  const tokens = await loadWearableConnection({
    athlete_id: args.athlete_id,
    provider: COROS,
    client: sql,
  });
  if (cfg.ok && tokens) {
    try {
      await revokeToken({
        revokeEndpoint: cfg.config.revokeEndpoint,
        clientId: cfg.config.clientId,
        clientSecret: cfg.config.clientSecret,
        token: tokens.access_token,
        tokenTypeHint: 'access_token',
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
