import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@/lib/oauth/oauth2', () => ({
  exchangeCodeForTokens: vi.fn(),
}));
vi.mock('@/lib/oauth/state', () => ({
  readStateCookie: vi.fn(),
  clearStateCookie: vi.fn(() => 'coros_oauth_state=; Path=/api/coros; Max-Age=0'),
}));
vi.mock('@/lib/wearables/token-store', () => ({
  saveWearableConnection: vi.fn(),
}));

const { exchangeCodeForTokens } = await import('@/lib/oauth/oauth2');
const { readStateCookie } = await import('@/lib/oauth/state');
const { saveWearableConnection } = await import('@/lib/wearables/token-store');
const { GET } = await import('@/app/api/coros/callback/route');

function req(query: string): Request {
  return new Request(`https://app.fahybrid.com/api/coros/callback${query}`, {
    headers: { cookie: 'coros_oauth_state=whatever' },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/coros/callback (human HTML)', () => {
  it('success → 200 HTML, exchanges with PKCE verifier, saves connection', async () => {
    vi.mocked(readStateCookie).mockReturnValue({
      athlete_id: BigInt(5),
      code_verifier: 'verifier-s256',
    });
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 3600,
      scope: 'openid mcp.tools offline_access',
      raw: {},
    });
    vi.mocked(saveWearableConnection).mockResolvedValue(undefined);

    const res = await GET(req('?code=abc&state=xyz'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Cuenta COROS conectada');
    expect(html).toContain('Ya puedes volver a la app');
    expect(exchangeCodeForTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        codeVerifier: 'verifier-s256',
        tokenEndpoint: 'https://mcpus.coros.com/oauth2/token',
      }),
    );
    expect(saveWearableConnection).toHaveBeenCalledTimes(1);
  });

  it('provider error → 400 HTML, no token exchange', async () => {
    const res = await GET(req('?error=access_denied&error_description=Denegado'));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('No se pudo conectar COROS');
    expect(html).toContain('Denegado');
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it('missing code → 400 HTML', async () => {
    const res = await GET(req('?state=xyz'));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Falta el código');
  });
});
