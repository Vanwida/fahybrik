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
  setEnv('COROS_CLIENT_ID', 'client-abc');
  setEnv('COROS_CLIENT_SECRET', 'secret-xyz');
  setEnv('COROS_OAUTH_CALLBACK_URL', 'https://app.fahybrid.com/api/coros/callback');
});
afterAll(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
afterEach(() => setEnv('COROS_CLIENT_ID', 'client-abc'));

const { GET } = await import('@/app/api/coros/connect/route');
const { mintConnectToken } = await import('@/lib/wearables/connect-token');

function req(query: string): Request {
  return new Request(`https://app.fahybrid.com/api/coros/connect${query}`);
}

describe('GET /api/coros/connect (token-hardened, PKCE)', () => {
  it('400 invalid_token when no token is present', async () => {
    const res = await GET(req(''));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_token' });
  });

  it('400 invalid_token for a raw athlete_id (the old forgeable path)', async () => {
    const res = await GET(req('?athlete_id=7'));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_token' });
  });

  it('400 invalid_token for a polar token on the coros route', async () => {
    const token = mintConnectToken({ athlete_id: BigInt(5), provider: 'polar' });
    const res = await GET(req(`?token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_token' });
  });

  it('302 to MCP authorize with PKCE S256 and a state cookie', async () => {
    const token = mintConnectToken({ athlete_id: BigInt(5), provider: 'coros' });
    const res = await GET(req(`?token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    const authorize = new URL(location);
    expect(authorize.origin).toBe('https://mcpus.coros.com');
    expect(authorize.searchParams.get('client_id')).toBe('client-abc');
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('code_challenge')).toBeTruthy();
    expect(authorize.searchParams.get('scope')).toContain('mcp.tools');
    expect(authorize.searchParams.has('athlete_id')).toBe(false);
    expect(res.headers.get('set-cookie')).toContain('coros_oauth_state=');
  });
});
