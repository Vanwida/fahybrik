// Persist wearable OAuth connections encrypted at rest — PROVIDER-AGNOSTIC.
//
// This mirrors lib/garmin/token-store.ts but is parameterized by `provider`, so
// one store serves COROS, WHOOP, and future OAuth2 wearables. It writes to the
// generic `wearable_connections` table (migration 0056), keyed by
// (athlete_id, provider). Garmin keeps its own dedicated store/table — see the
// migration header for the consolidation rationale.
//
// We persist:
//   - access_token (encrypted)
//   - refresh_token (encrypted, optional — OAuth2 rotation)
//   - token_secret (encrypted, optional — reserved for a future OAuth1 provider)
//   - access_token_sha256 (hex, optional reverse-lookup parity with Garmin)

import { createHash } from 'node:crypto';
import type { TransactionClient, Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { decrypt, encrypt } from '@/lib/crypto/aes-gcm';

// OAuth2 wearables served by this generic store. 'garmin' is included in the
// union for callers that branch on provider, even though Garmin tokens live in
// their own table for now (this store does not write Garmin rows).
export type WearableProvider = 'coros' | 'whoop' | 'garmin' | 'amazfit' | 'polar';

export type WearableConnectionStatus = 'connected' | 'revoked' | 'error';

export type WearableTokenSet = {
  access_token: string;
  refresh_token?: string | null;
  token_secret?: string | null;
  expires_at?: Date | null;
  scopes?: string | null;
};

// Accept either the pool or an open transaction (matches the Garmin store and
// the @/lib/db TransactionClient contract).
type Client = Sql | TransactionClient;

// Hex SHA-256 of the access token. Stored in
// `wearable_connections.access_token_sha256` (indexed per provider) so a webhook
// can resolve an athlete via a single indexed lookup instead of decrypting every
// row. Mirrors Garmin's hashGarminAccessToken (createHash('sha256').digest('hex')).
export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// UPSERT on (athlete_id, provider): reconnecting overwrites tokens and resets
// status to 'connected'. Encrypts access/refresh/secret before they touch the DB.
export async function saveWearableConnection(params: {
  athlete_id: bigint;
  provider: WearableProvider;
  provider_user_id?: string | null;
  tokens: WearableTokenSet;
  client?: Client;
}): Promise<void> {
  const client = (params.client ?? defaultSql) as Sql;
  const access = encrypt(params.tokens.access_token);
  const refresh = params.tokens.refresh_token ? encrypt(params.tokens.refresh_token) : null;
  const secret = params.tokens.token_secret ? encrypt(params.tokens.token_secret) : null;
  const accessHash = hashAccessToken(params.tokens.access_token);

  await client`
    insert into wearable_connections (
      athlete_id,
      provider,
      provider_user_id,
      access_token_encrypted,
      refresh_token_encrypted,
      token_secret_encrypted,
      access_token_sha256,
      scopes,
      expires_at,
      status
    ) values (
      ${params.athlete_id},
      ${params.provider},
      ${params.provider_user_id ?? null},
      ${access},
      ${refresh},
      ${secret},
      ${accessHash},
      ${params.tokens.scopes ?? null},
      ${params.tokens.expires_at ?? null},
      'connected'
    )
    on conflict (athlete_id, provider) do update set
      provider_user_id = excluded.provider_user_id,
      access_token_encrypted = excluded.access_token_encrypted,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      token_secret_encrypted = excluded.token_secret_encrypted,
      access_token_sha256 = excluded.access_token_sha256,
      scopes = excluded.scopes,
      expires_at = excluded.expires_at,
      status = 'connected',
      updated_at = now()
  `;
}

export async function loadWearableConnection(params: {
  athlete_id: bigint;
  provider: WearableProvider;
  client?: Client;
}): Promise<WearableTokenSet | null> {
  const client = (params.client ?? defaultSql) as Sql;
  const rows = await client<
    Array<{
      access_token_encrypted: Buffer;
      refresh_token_encrypted: Buffer | null;
      token_secret_encrypted: Buffer | null;
      expires_at: Date | null;
      scopes: string | null;
    }>
  >`
    select
      access_token_encrypted,
      refresh_token_encrypted,
      token_secret_encrypted,
      expires_at,
      scopes
    from wearable_connections
    where athlete_id = ${params.athlete_id} and provider = ${params.provider}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    access_token: decrypt(row.access_token_encrypted),
    refresh_token: row.refresh_token_encrypted ? decrypt(row.refresh_token_encrypted) : null,
    token_secret: row.token_secret_encrypted ? decrypt(row.token_secret_encrypted) : null,
    expires_at: row.expires_at,
    scopes: row.scopes,
  };
}

// Webhook reverse-lookup by the provider's stable user id. Returns only the
// athlete_id (the inbound path never needs to decrypt tokens to identify whom a
// notification belongs to).
export async function findConnectionByProviderUser(params: {
  provider: WearableProvider;
  provider_user_id: string;
  client?: Client;
}): Promise<{ athlete_id: bigint } | null> {
  const client = (params.client ?? defaultSql) as Sql;
  const rows = await client<{ athlete_id: bigint }[]>`
    select athlete_id from wearable_connections
    where provider = ${params.provider} and provider_user_id = ${params.provider_user_id}
    limit 1
  `;
  return rows[0] ?? null;
}

// Reverse-lookup by hashed access token (parity with Garmin's resolver). Single
// indexed match on (provider, access_token_sha256); no row decryption.
export async function findConnectionByAccessTokenHash(params: {
  provider: WearableProvider;
  hash: string;
  client?: Client;
}): Promise<{ athlete_id: bigint } | null> {
  const client = (params.client ?? defaultSql) as Sql;
  const rows = await client<{ athlete_id: bigint }[]>`
    select athlete_id from wearable_connections
    where provider = ${params.provider} and access_token_sha256 = ${params.hash}
    limit 1
  `;
  return rows[0] ?? null;
}

// Flip status without deleting the row (preserves provider_user_id history).
export async function markConnectionStatus(params: {
  athlete_id: bigint;
  provider: WearableProvider;
  status: WearableConnectionStatus;
  client?: Client;
}): Promise<void> {
  const client = (params.client ?? defaultSql) as Sql;
  await client`
    update wearable_connections
    set status = ${params.status}, updated_at = now()
    where athlete_id = ${params.athlete_id} and provider = ${params.provider}
  `;
}
