// Unit tests for AccessLinkClient token-refresh behaviour. The OAuth refresh call
// is mocked (we assert the client's retry/persist wiring, not the HTTP exchange);
// the AccessLink fetch itself is injected. No DB, no network.

import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@/lib/oauth/oauth2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/oauth/oauth2')>();
  return { ...actual, refreshAccessToken: vi.fn() };
});

import { refreshAccessToken, OAuth2Error } from '@/lib/oauth/oauth2';
import { AccessLinkClient, AccessLinkError } from '@/lib/polar/accesslink';

const refreshMock = vi.mocked(refreshAccessToken);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body == null ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const baseOpts = {
  apiBase: 'https://www.polaraccesslink.com',
  tokenEndpoint: 'https://auth.polar.com/oauth/token',
  clientId: 'cid',
  clientSecret: 'secret',
};

beforeEach(() => {
  refreshMock.mockReset();
});

describe('AccessLinkClient refresh', () => {
  test('refreshes once and retries on a 401, then persists the new token', async () => {
    refreshMock.mockResolvedValue({
      access_token: 'NEW',
      refresh_token: 'REFRESH2',
      expires_in: 3600,
      raw: {},
    });
    const seenAuth: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      seenAuth.push((init?.headers as Record<string, string>).authorization);
      return seenAuth.length === 1
        ? jsonResponse(401, { error: 'expired' })
        : jsonResponse(200, { id: 'EX1', sport: 'RUNNING' });
    });
    const onTokensRefreshed = vi.fn();

    const client = new AccessLinkClient({
      ...baseOpts,
      tokens: { access_token: 'OLD', refresh_token: 'REFRESH1' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onTokensRefreshed,
    });

    const ex = await client.getExercise('EX1');
    expect(ex).toEqual({ id: 'EX1', sport: 'RUNNING' });
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(refreshMock.mock.calls[0][0]).toMatchObject({ refreshToken: 'REFRESH1', basicAuth: true });
    expect(seenAuth).toEqual(['Bearer OLD', 'Bearer NEW']);
    expect(onTokensRefreshed).toHaveBeenCalledTimes(1);
    expect(onTokensRefreshed.mock.calls[0][0]).toMatchObject({
      access_token: 'NEW',
      refresh_token: 'REFRESH2',
    });
  });

  test('pre-refreshes when the token is already expired (no wasted 401)', async () => {
    refreshMock.mockResolvedValue({ access_token: 'NEW', refresh_token: 'R2', expires_in: 3600, raw: {} });
    const seenAuth: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      seenAuth.push((init?.headers as Record<string, string>).authorization);
      return jsonResponse(200, { id: 'EX9' });
    });

    const client = new AccessLinkClient({
      ...baseOpts,
      tokens: { access_token: 'OLD', refresh_token: 'R1', expires_at: new Date(Date.now() - 1000) },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.getExercise('EX9');
    expect(refreshMock).toHaveBeenCalledTimes(1);
    // Only ONE fetch, already carrying the refreshed token.
    expect(seenAuth).toEqual(['Bearer NEW']);
  });

  test('fires onAuthError and throws when refresh itself fails', async () => {
    refreshMock.mockRejectedValue(new OAuth2Error('refresh 400', 400, ''));
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: 'expired' }));
    const onAuthError = vi.fn();

    const client = new AccessLinkClient({
      ...baseOpts,
      tokens: { access_token: 'OLD', refresh_token: 'R1' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onAuthError,
    });

    await expect(client.getExercise('EX1')).rejects.toBeInstanceOf(AccessLinkError);
    expect(onAuthError).toHaveBeenCalledTimes(1);
  });

  test('fires onAuthError and throws when there is no refresh token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: 'expired' }));
    const onAuthError = vi.fn();

    const client = new AccessLinkClient({
      ...baseOpts,
      tokens: { access_token: 'OLD', refresh_token: null },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onAuthError,
    });

    await expect(client.getExercise('EX1')).rejects.toBeInstanceOf(AccessLinkError);
    expect(refreshMock).not.toHaveBeenCalled();
    expect(onAuthError).toHaveBeenCalledTimes(1);
  });

  test('getSleep / getNightlyRecharge return null on 404', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, null));
    const client = new AccessLinkClient({
      ...baseOpts,
      tokens: { access_token: 'OK' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await client.getSleep('2026-07-10')).toBeNull();
    expect(await client.getNightlyRecharge('2026-07-10')).toBeNull();
  });

  test('registerUser treats 409 as already-registered', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(409, { error: 'exists' }));
    const client = new AccessLinkClient({
      ...baseOpts,
      tokens: { access_token: 'OK' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await client.registerUser('123')).toEqual({ polarUserId: null, alreadyRegistered: true });
  });

  test('registerUser returns the polar-user-id on 200', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { 'polar-user-id': 2278512, 'member-id': '123' }));
    const client = new AccessLinkClient({
      ...baseOpts,
      tokens: { access_token: 'OK' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await client.registerUser('123')).toEqual({ polarUserId: 2278512, alreadyRegistered: false });
  });
});
