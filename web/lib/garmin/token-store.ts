// Persist Garmin OAuth tokens encrypted at rest.
//
// We persist:
//   - access_token (encrypted)
//   - token_secret (encrypted, used as the OAuth1 token secret for signing)
//   - refresh_token (encrypted, optional — Garmin issues long-lived tokens)

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { decrypt, encrypt } from '@/lib/crypto/aes-gcm';

export type GarminTokenSet = {
  access_token: string;
  token_secret: string;
  refresh_token?: string | null;
  expires_at?: Date | null;
  scope?: string | null;
};

export async function saveGarminTokens(params: {
  athlete_id: number | bigint;
  tokens: GarminTokenSet;
  client?: Sql;
}): Promise<void> {
  const client = params.client ?? defaultSql;
  const access = encrypt(params.tokens.access_token);
  const secret = encrypt(params.tokens.token_secret);
  const refresh = params.tokens.refresh_token ? encrypt(params.tokens.refresh_token) : null;

  await client`
    insert into garmin_oauth_tokens (
      athlete_id,
      access_token_encrypted,
      refresh_token_encrypted,
      token_secret_encrypted,
      expires_at,
      scope
    ) values (
      ${params.athlete_id as number},
      ${access},
      ${refresh},
      ${secret},
      ${params.tokens.expires_at ?? null},
      ${params.tokens.scope ?? null}
    )
    on conflict (athlete_id) do update set
      access_token_encrypted = excluded.access_token_encrypted,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      token_secret_encrypted = excluded.token_secret_encrypted,
      expires_at = excluded.expires_at,
      scope = excluded.scope,
      updated_at = now()
  `;
}

export async function loadGarminTokens(params: {
  athlete_id: number | bigint;
  client?: Sql;
}): Promise<GarminTokenSet | null> {
  const client = params.client ?? defaultSql;
  const rows = await client<
    Array<{
      access_token_encrypted: Buffer;
      refresh_token_encrypted: Buffer | null;
      token_secret_encrypted: Buffer | null;
      expires_at: Date | null;
      scope: string | null;
    }>
  >`
    select access_token_encrypted, refresh_token_encrypted, token_secret_encrypted, expires_at, scope
    from garmin_oauth_tokens
    where athlete_id = ${params.athlete_id as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    access_token: decrypt(row.access_token_encrypted),
    token_secret: row.token_secret_encrypted ? decrypt(row.token_secret_encrypted) : '',
    refresh_token: row.refresh_token_encrypted ? decrypt(row.refresh_token_encrypted) : null,
    expires_at: row.expires_at,
    scope: row.scope,
  };
}
