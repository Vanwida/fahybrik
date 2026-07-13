// Unit tests for the v4 AccessLinkClient: response unwrapping, query building,
// and token refresh. OAuth refresh is mocked; the HTTP fetch is injected. No DB.

import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('@/lib/oauth/oauth2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/oauth/oauth2')>();
  return { ...actual, refreshAccessToken: vi.fn() };
});

import { refreshAccessToken } from '@/lib/oauth/oauth2';
import { AccessLinkClient, AccessLinkError } from '@/lib/polar/accesslink';

const refreshMock = vi.mocked(refreshAccessToken);

function jsonResponse(status: number, body: unknown): Response {
  // 204/304 must have a null body per the Fetch spec (undici throws otherwise).
  const nullBody = status === 204 || status === 304 || body == null;
  return new Response(nullBody ? null : JSON.stringify(body), {
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

beforeEach(() => refreshMock.mockReset());

describe('AccessLinkClient v4', () => {
  test('lists training sessions against /v4/data with from/to/features', async () => {
    let calledUrl = '';
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      calledUrl = String(url);
      return jsonResponse(200, { trainingSessions: [{ identifier: { id: 'S1' } }] });
    });
    const client = new AccessLinkClient({
      ...baseOpts,
      tokens: { access_token: 'OK' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const sessions = await client.listTrainingSessions('2026-07-10', '2026-07-11', ['laps', 'statistics']);
    expect(sessions).toEqual([{ identifier: { id: 'S1' } }]);
    expect(calledUrl).toContain('https://www.polaraccesslink.com/v4/data/training-sessions/list');
    expect(calledUrl).toContain('from=2026-07-10');
    expect(calledUrl).toContain('to=2026-07-11');
    expect(calledUrl).toContain('features=laps');
    expect(calledUrl).toContain('features=statistics');
  });

  test('unwraps the doubly-nested nightly recharge shape', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        nightlyRechargeResults: { nightlyRechargeResults: [{ date: '2026-07-10', recoveryIndicator: 4 }] },
      }),
    );
    const client = new AccessLinkClient({
      ...baseOpts,
      tokens: { access_token: 'OK' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const rows = await client.listNightlyRecharge('2026-07-01', '2026-07-11');
    expect(rows).toEqual([{ date: '2026-07-10', recoveryIndicator: 4 }]);
  });

  test('empty/204 responses yield []', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(204, null));
    const client = new AccessLinkClient({
      ...baseOpts,
      tokens: { access_token: 'OK' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await client.listSleeps('2026-07-10', '2026-07-11', ['sleep-score'])).toEqual([]);
    expect(await client.listSports()).toEqual([]);
  });

  test('refreshes once and retries on a 401, then persists the new token', async () => {
    refreshMock.mockResolvedValue({ access_token: 'NEW', refresh_token: 'R2', expires_in: 3600, raw: {} });
    const seenAuth: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      seenAuth.push((init?.headers as Record<string, string>).authorization);
      return seenAuth.length === 1
        ? jsonResponse(401, { error: 'expired' })
        : jsonResponse(200, { sports: [{ name: 'RUNNING' }] });
    });
    const onTokensRefreshed = vi.fn();
    const client = new AccessLinkClient({
      ...baseOpts,
      tokens: { access_token: 'OLD', refresh_token: 'R1' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onTokensRefreshed,
    });

    const sports = await client.listSports();
    expect(sports).toEqual([{ name: 'RUNNING' }]);
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(refreshMock.mock.calls[0][0]).toMatchObject({ refreshToken: 'R1', basicAuth: true });
    expect(seenAuth).toEqual(['Bearer OLD', 'Bearer NEW']);
    expect(onTokensRefreshed).toHaveBeenCalledTimes(1);
  });

  test('fires onAuthError and throws when the token is rejected and unrecoverable', async () => {
    // A 401 with no refresh token → refresh is impossible → onAuthError + throw,
    // without calling the OAuth endpoint at all.
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: 'expired' }));
    const onAuthError = vi.fn();
    const client = new AccessLinkClient({
      ...baseOpts,
      tokens: { access_token: 'OLD', refresh_token: null },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onAuthError,
    });
    let caught: unknown;
    try {
      await client.listSports();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AccessLinkError);
    expect(refreshMock).not.toHaveBeenCalled();
    expect(onAuthError).toHaveBeenCalledTimes(1);
  });
});
