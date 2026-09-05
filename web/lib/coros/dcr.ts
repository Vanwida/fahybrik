// COROS MCP Dynamic Client Registration (RFC 7591) + metadata discovery (RFC 8414).
//
// Measured 2026-09-05: POST mcpus.coros.com/connect/register returns 201 with
// token_endpoint_auth_method=none and no client_secret (public client + PKCE).
// Partner COROS_* portal credentials are never invented or required.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { decrypt, encrypt, isCryptoConfigured } from '@/lib/crypto/aes-gcm';
import {
  COROS_CLIENT_NAME,
  COROS_MCP_OAUTH,
  COROS_PROD_APP_URL,
  loadCorosConfig,
  type CorosConfig,
} from '@/lib/coros/config';

export type FetchFn = typeof fetch;

export type CorosTokenAuthMethod = 'none' | 'client_secret_post' | 'client_secret_basic';

export type CorosOAuthClient = {
  clientId: string;
  clientSecret: string;
  tokenEndpointAuthMethod: CorosTokenAuthMethod;
};

export type CorosRuntimeConfig = CorosConfig & CorosOAuthClient;

export type CorosDcrStoreRow = CorosOAuthClient & {
  redirectUri: string;
  issuer: string | null;
  secretExpiresAt: Date | null;
};

export type CorosDcrStore = {
  load(redirectUri: string): Promise<CorosDcrStoreRow | null>;
  save(row: CorosDcrStoreRow): Promise<CorosDcrStoreRow>;
};

export type ResolveCorosOpts = {
  fetchImpl?: FetchFn;
  store?: CorosDcrStore;
  sql?: Sql;
  now?: () => number;
  config?: CorosConfig;
};

const DISCOVERY_TIMEOUT_MS = 5_000;
const DCR_TIMEOUT_MS = 15_000;

const cache = new Map<string, CorosOAuthClient>();
const inflight = new Map<string, Promise<CorosOAuthClient>>();
let discovered: Partial<CorosConfig> | null = null;

export function resetCorosDcrCacheForTests(): void {
  cache.clear();
  inflight.clear();
  discovered = null;
}

export function corosUsesBasicAuth(client: CorosOAuthClient): boolean {
  return client.tokenEndpointAuthMethod === 'client_secret_basic';
}

export async function discoverCorosMcpOAuth(opts?: {
  fetchImpl?: FetchFn;
  metadataUrl?: string;
}): Promise<Partial<CorosConfig>> {
  if (discovered) return discovered;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const metadataUrl = opts?.metadataUrl ?? COROS_MCP_OAUTH.metadata;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const res = await fetchImpl(metadataUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) return {};
    const body = (await res.json()) as Record<string, unknown>;
    const next: Partial<CorosConfig> = {};
    if (typeof body.authorization_endpoint === 'string') {
      next.authorizeEndpoint = body.authorization_endpoint;
    }
    if (typeof body.token_endpoint === 'string') next.tokenEndpoint = body.token_endpoint;
    if (typeof body.revocation_endpoint === 'string') next.revokeEndpoint = body.revocation_endpoint;
    if (typeof body.registration_endpoint === 'string') {
      next.registrationEndpoint = body.registration_endpoint;
    }
    discovered = next;
    return next;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

export async function registerCorosMcpClient(opts: {
  registrationEndpoint: string;
  redirectUri: string;
  scopes: string;
  fetchImpl?: FetchFn;
}): Promise<CorosOAuthClient> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DCR_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(opts.registrationEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_name: COROS_CLIENT_NAME,
        client_uri: COROS_PROD_APP_URL,
        redirect_uris: [opts.redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: opts.scopes,
        application_type: 'web',
      }),
      signal: controller.signal,
    });
  } catch (e) {
    const reason = (e as Error).name === 'AbortError' ? 'timed out' : (e as Error).message;
    throw new Error(`COROS DCR request failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`COROS DCR returned ${res.status}`);
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('COROS DCR returned a non-JSON body');
  }
  const clientId = parsed.client_id;
  if (typeof clientId !== 'string' || clientId.length === 0) {
    throw new Error('COROS DCR response missing client_id');
  }
  const secret = typeof parsed.client_secret === 'string' ? parsed.client_secret : '';
  const method = parseAuthMethod(parsed.token_endpoint_auth_method, secret);
  return { clientId, clientSecret: secret, tokenEndpointAuthMethod: method };
}

export async function resolveCorosOAuthClient(
  opts: ResolveCorosOpts = {},
): Promise<CorosOAuthClient> {
  const cfg = opts.config ?? requireCorosConfig();
  const key = cfg.callbackUrl;
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;

  const work = resolveOnce(cfg, opts);
  inflight.set(key, work);
  try {
    const client = await work;
    cache.set(key, client);
    return client;
  } finally {
    inflight.delete(key);
  }
}

export async function resolveCorosRuntime(
  opts: ResolveCorosOpts = {},
): Promise<{ ok: true; config: CorosRuntimeConfig } | { ok: false; message: string }> {
  const loaded = opts.config ? { ok: true as const, config: opts.config } : loadCorosConfig();
  if (!loaded.ok) return { ok: false, message: `missing ${loaded.missing.join(', ')}` };
  const skipDiscover = process.env.VITEST === 'true' && !opts.fetchImpl;
  const discoveredEndpoints = skipDiscover
    ? {}
    : await discoverCorosMcpOAuth({
        fetchImpl: opts.fetchImpl,
        metadataUrl: loaded.config.metadataUrl,
      });
  const config: CorosConfig = {
    ...loaded.config,
    authorizeEndpoint: discoveredEndpoints.authorizeEndpoint || loaded.config.authorizeEndpoint,
    tokenEndpoint: discoveredEndpoints.tokenEndpoint || loaded.config.tokenEndpoint,
    revokeEndpoint: discoveredEndpoints.revokeEndpoint || loaded.config.revokeEndpoint,
    registrationEndpoint:
      discoveredEndpoints.registrationEndpoint || loaded.config.registrationEndpoint,
  };
  try {
    const client = await resolveCorosOAuthClient({ ...opts, config });
    return { ok: true, config: { ...config, ...client } };
  } catch (e) {
    return { ok: false, message: (e as Error).message || 'COROS DCR failed' };
  }
}

export function postgresCorosDcrStore(sql: Sql): CorosDcrStore {
  const store: CorosDcrStore = {
    async load(redirectUri) {
      const rows = await sql<
        Array<{
          client_id: string;
          client_secret_enc: Buffer | null;
          token_endpoint_auth_method: string;
          issuer: string | null;
          secret_expires_at: Date | null;
        }>
      >`
        select
          client_id,
          client_secret_enc,
          token_endpoint_auth_method,
          issuer,
          secret_expires_at
        from coros_mcp_oauth_client
        where redirect_uri = ${redirectUri}
        limit 1
      `;
      const row = rows[0];
      if (!row) return null;
      let clientSecret = '';
      if (row.client_secret_enc && row.client_secret_enc.length > 0) {
        if (!isCryptoConfigured()) return null;
        try {
          clientSecret = decrypt(row.client_secret_enc);
        } catch {
          return null;
        }
      }
      return {
        redirectUri,
        clientId: row.client_id,
        clientSecret,
        tokenEndpointAuthMethod: parseAuthMethod(row.token_endpoint_auth_method, clientSecret),
        issuer: row.issuer,
        secretExpiresAt: row.secret_expires_at,
      };
    },
    async save(row) {
      if (row.clientSecret.length > 0 && !isCryptoConfigured()) {
        throw new Error('ENCRYPTION_KEY is required to persist a confidential COROS MCP client');
      }
      const secretEnc = row.clientSecret.length > 0 ? encrypt(row.clientSecret) : null;
      await sql`
        insert into coros_mcp_oauth_client (
          redirect_uri,
          client_id,
          client_secret_enc,
          token_endpoint_auth_method,
          issuer,
          secret_expires_at,
          updated_at
        ) values (
          ${row.redirectUri},
          ${row.clientId},
          ${secretEnc},
          ${row.tokenEndpointAuthMethod},
          ${row.issuer},
          ${row.secretExpiresAt},
          now()
        )
        on conflict (redirect_uri) do nothing
      `;
      const winner = await store.load(row.redirectUri);
      if (!winner) throw new Error('COROS DCR persist failed');
      return winner;
    },
  };
  return store;
}

async function resolveOnce(cfg: CorosConfig, opts: ResolveCorosOpts): Promise<CorosOAuthClient> {
  const now = opts.now ?? Date.now;
  const testClient = !opts.store ? testOnlyEnvClient() : null;
  if (testClient) return testClient;
  if (process.env.VITEST === 'true' && !opts.store && !opts.fetchImpl) {
    throw new Error('COROS DCR in unit tests needs an injected store or fetchImpl');
  }

  const store = opts.store ?? postgresCorosDcrStore(opts.sql ?? defaultSql);
  const persisted = await loadPersisted(store, cfg.callbackUrl);
  if (persisted && !isSecretExpired(persisted, now())) return persisted;

  const registered = await registerCorosMcpClient({
    registrationEndpoint: cfg.registrationEndpoint,
    redirectUri: cfg.callbackUrl,
    scopes: cfg.scopes,
    fetchImpl: opts.fetchImpl,
  });
  try {
    const saved = await store.save({
      ...registered,
      redirectUri: cfg.callbackUrl,
      issuer: null,
      secretExpiresAt: null,
    });
    return saved;
  } catch (e) {
    throw new Error(`COROS DCR persist failed: ${(e as Error).message}`);
  }
}

async function loadPersisted(
  store: CorosDcrStore,
  redirectUri: string,
): Promise<CorosDcrStoreRow | null> {
  try {
    return await store.load(redirectUri);
  } catch {
    return null;
  }
}

function isSecretExpired(row: CorosDcrStoreRow, nowMs: number): boolean {
  if (!row.secretExpiresAt) return false;
  return row.secretExpiresAt.getTime() <= nowMs;
}

function testOnlyEnvClient(): CorosOAuthClient | null {
  if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') return null;
  const clientId = process.env.COROS_CLIENT_ID?.trim();
  if (!clientId) return null;
  const clientSecret = process.env.COROS_CLIENT_SECRET?.trim() ?? '';
  return {
    clientId,
    clientSecret,
    tokenEndpointAuthMethod: clientSecret ? 'client_secret_post' : 'none',
  };
}

function requireCorosConfig(): CorosConfig {
  const cfg = loadCorosConfig();
  if (!cfg.ok) {
    throw new Error(`COROS MCP is not ready: missing ${cfg.missing.join(', ')}`);
  }
  return cfg.config;
}

function parseAuthMethod(raw: unknown, secret: string): CorosTokenAuthMethod {
  if (raw === 'client_secret_basic' || raw === 'client_secret_post' || raw === 'none') {
    return raw;
  }
  return secret.length > 0 ? 'client_secret_post' : 'none';
}
