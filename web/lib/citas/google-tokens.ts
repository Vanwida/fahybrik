// DB access for the single Google OAuth refresh_token used by the citas
// videollamada adapter. There is exactly ONE row (provider='google'), upserted on
// the provider unique constraint. Access tokens are NEVER stored — they are minted
// on demand from this refresh_token (see lib/citas/google.ts:getAccessToken).
//
// Schema: infra/migrations/0096_google_oauth_tokens.sql
//
// Both helpers accept an optional `client` so they can run inside a transaction or
// be driven by a fake `sql` in unit tests (same DI pattern as lib/citas/reminder.ts).

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

type Client = Sql | TransactionClient;

// Single provider for now. Kept as a constant so the upsert target and the read
// filter can never drift apart.
const PROVIDER = 'google';

/** The stored Google refresh_token, or null if the coach hasn't connected yet. */
export async function getGoogleRefreshToken(client: Client = defaultSql): Promise<string | null> {
  const rows = await client<{ refresh_token: string }[]>`
    select refresh_token from google_oauth_tokens where provider = ${PROVIDER} limit 1
  `;
  return rows[0]?.refresh_token ?? null;
}

/** Upsert the Google refresh_token (one row per provider; re-connect overwrites it). */
export async function saveGoogleRefreshToken(
  refresh_token: string,
  client: Client = defaultSql,
): Promise<void> {
  await client`
    insert into google_oauth_tokens (provider, refresh_token)
    values (${PROVIDER}, ${refresh_token})
    on conflict (provider)
      do update set refresh_token = excluded.refresh_token, updated_at = now()
  `;
}
