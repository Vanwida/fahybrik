// GET /api/polar/connect — hardened: token-only. Real crypto + config; mints a
// real token to drive the happy path. Pins: no token / garbage / expired /
// cross-provider all → 400 invalid_token (no raw athlete_id path survives), and a
// valid token → 302 to Polar authorize with a state cookie.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const TEST_KEY = 'a'.repeat(64);
const savedEnv: Record<string, string | undefined> = {};
function setEnv(k: string, v: string | undefined) {
  if (!(k in savedEnv)) savedEnv[k] = process.env[k];
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

beforeAll(() => {
  setEnv('ENCRYPTION_KEY', TEST_KEY);
  setEnv('POLAR_CLIENT_ID', 'client-abc');
  setEnv('POLAR_CLIENT_SECRET', 'secret-xyz');
  setEnv('POLAR_OAUTH_CALLBACK_URL', 'https://app.fahybrid.com/api/polar/callback');
});
afterAll(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
afterEach(() => setEnv('POLAR_CLIENT_ID', 'client-abc'));

const { GET } = await import('@/app/api/polar/connect/route');
const { mintConnectToken } = await import('@/lib/wearables/connect-token');

function req(query: string): Request {
  return new Request(`https://app.fahybrid.com/api/polar/connect${query}`);
}

describe('GET /api/polar/connect (token-hardened)', () => {
  it('400 invalid_token when no token is present', async () => {
    const res = await GET(req(''));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_token' });
  });

  it('400 invalid_token for a garbage token', async () => {
    const res = await GET(req('?token=garbage'));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_token' });
  });

  it('400 invalid_token for an expired token', async () => {
    const token = mintConnectToken({ athlete_id: BigInt(5), provider: 'polar', ttlSeconds: -1 });
    const res = await GET(req(`?token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_token' });
  });

  it('400 invalid_token for a cross-provider token (coros token on the polar route)', async () => {
    const token = mintConnectToken({ athlete_id: BigInt(5), provider: 'coros' });
    const res = await GET(req(`?token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_token' });
  });

  it('503 polar_not_configured when Polar env is missing', async () => {
    setEnv('POLAR_CLIENT_ID', undefined);
    const token = mintConnectToken({ athlete_id: BigInt(5), provider: 'polar' });
    const res = await GET(req(`?token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'polar_not_configured' });
  });

  it('302 to Polar authorize with a state cookie for a valid token', async () => {
    const token = mintConnectToken({ athlete_id: BigInt(5), provider: 'polar' });
    const res = await GET(req(`?token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location.startsWith('https://auth.polar.com/oauth/authorize')).toBe(true);
    const authorize = new URL(location);
    expect(authorize.searchParams.get('client_id')).toBe('client-abc');
    expect(authorize.searchParams.get('response_type')).toBe('code');
    expect(authorize.searchParams.get('state')).toBeTruthy();
    expect(authorize.searchParams.get('redirect_uri')).toBe(
      'https://app.fahybrid.com/api/polar/callback',
    );
    // The athlete id is carried only in the encrypted state cookie — never as a
    // plaintext param on the outbound redirect.
    expect(authorize.searchParams.has('athlete_id')).toBe(false);
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toContain('polar_oauth_state=');
    expect(setCookie).toContain('HttpOnly');
  });
});
