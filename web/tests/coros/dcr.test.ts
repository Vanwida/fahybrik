import { afterEach, describe, expect, it, vi } from 'vitest';
import { COROS_MCP_OAUTH, loadCorosConfig } from '@/lib/coros/config';
import {
  discoverCorosMcpOAuth,
  registerCorosMcpClient,
  resetCorosDcrCacheForTests,
  resolveCorosOAuthClient,
  type CorosDcrStore,
  type CorosDcrStoreRow,
} from '@/lib/coros/dcr';

afterEach(() => {
  resetCorosDcrCacheForTests();
});

function memoryStore(seed?: CorosDcrStoreRow): CorosDcrStore {
  const rows = new Map<string, CorosDcrStoreRow>();
  if (seed) rows.set(seed.redirectUri, seed);
  return {
    async load(redirectUri) {
      return rows.get(redirectUri) ?? null;
    },
    async save(row) {
      const existing = rows.get(row.redirectUri);
      if (existing) return existing;
      rows.set(row.redirectUri, row);
      return row;
    },
  };
}

describe('COROS MCP DCR', () => {
  it('discovers mcpus endpoints from the well-known document', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          issuer: 'https://mcpus.coros.com',
          authorization_endpoint: 'https://mcpus.coros.com/oauth2/authorize',
          token_endpoint: 'https://mcpus.coros.com/oauth2/token',
          revocation_endpoint: 'https://mcpus.coros.com/oauth2/revoke',
          registration_endpoint: 'https://mcpus.coros.com/connect/register',
        }),
        { status: 200 },
      ),
    );
    const meta = await discoverCorosMcpOAuth({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(meta.authorizeEndpoint).toBe('https://mcpus.coros.com/oauth2/authorize');
    expect(meta.registrationEndpoint).toBe('https://mcpus.coros.com/connect/register');
    expect(fetchImpl).toHaveBeenCalledWith(
      COROS_MCP_OAUTH.metadata,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('registers a public MCP client (measured 201 shape: auth none, no secret)', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          client_id: '11111111-2222-4333-8444-555555555555',
          client_id_issued_at: 1_788_643_722,
          client_name: 'FAHYBRID',
          redirect_uris: ['https://app.fahybrid.com/api/coros/callback'],
          grant_types: ['authorization_code', 'refresh_token'],
          scope: 'mcp.tools openid offline_access',
          token_endpoint_auth_method: 'none',
        }),
        { status: 201 },
      ),
    );
    const client = await registerCorosMcpClient({
      registrationEndpoint: COROS_MCP_OAUTH.register,
      redirectUri: 'https://app.fahybrid.com/api/coros/callback',
      scopes: 'openid mcp.tools offline_access',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(client.clientId).toBe('11111111-2222-4333-8444-555555555555');
    expect(client.clientSecret).toBe('');
    expect(client.tokenEndpointAuthMethod).toBe('none');
    const posted = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
      token_endpoint_auth_method: string;
      client_name: string;
    };
    expect(posted.client_name).toBe('FAHYBRID');
    expect(posted.token_endpoint_auth_method).toBe('none');
  });

  it('reuses a persisted DCR client and does not register again', async () => {
    const cfg = loadCorosConfig();
    expect(cfg.ok).toBe(true);
    if (!cfg.ok) return;
    const fetchImpl = vi.fn();
    const store = memoryStore({
      redirectUri: cfg.config.callbackUrl,
      clientId: 'persisted-public',
      clientSecret: '',
      tokenEndpointAuthMethod: 'none',
      issuer: 'https://mcpus.coros.com',
      secretExpiresAt: null,
    });
    const client = await resolveCorosOAuthClient({
      config: cfg.config,
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(client.clientId).toBe('persisted-public');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('registers then persists when the store is empty', async () => {
    const cfg = loadCorosConfig();
    expect(cfg.ok).toBe(true);
    if (!cfg.ok) return;
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          client_id: 'fresh-dcr',
          token_endpoint_auth_method: 'none',
        }),
        { status: 201 },
      ),
    );
    const store = memoryStore();
    const first = await resolveCorosOAuthClient({
      config: cfg.config,
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(first.clientId).toBe('fresh-dcr');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resetCorosDcrCacheForTests();
    const second = await resolveCorosOAuthClient({
      config: cfg.config,
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(second.clientId).toBe('fresh-dcr');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the first persisted client when a later DCR races', async () => {
    const cfg = loadCorosConfig();
    expect(cfg.ok).toBe(true);
    if (!cfg.ok) return;
    const store = memoryStore({
      redirectUri: cfg.config.callbackUrl,
      clientId: 'winner',
      clientSecret: '',
      tokenEndpointAuthMethod: 'none',
      issuer: null,
      secretExpiresAt: null,
    });
    const saved = await store.save({
      redirectUri: cfg.config.callbackUrl,
      clientId: 'loser',
      clientSecret: '',
      tokenEndpointAuthMethod: 'none',
      issuer: null,
      secretExpiresAt: null,
    });
    expect(saved.clientId).toBe('winner');
  });
});
