// GET /api/polar/callback — the athlete lands here in Safari, so every terminal
// response must be human HTML (not JSON). Mocks the token exchange + state read +
// store so the test drives the response SHAPE: success page, provider-error page,
// missing-code page, invalid-state page, and HTML-escaping of provider text. The
// storage/verification wiring is asserted (saveWearableConnection called) but its
// SQL is out of scope here.

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

vi.mock('@/lib/oauth/oauth2', () => ({
  exchangeCodeForTokens: vi.fn(),
  // Route no longer imports OAuth2Error, but keep the export for module parity.
  OAuth2Error: class OAuth2Error extends Error {},
}));
vi.mock('@/lib/oauth/state', () => ({
  readStateCookie: vi.fn(),
  clearStateCookie: vi.fn(() => 'polar_oauth_state=; Path=/api/polar; Max-Age=0'),
}));
vi.mock('@/lib/wearables/token-store', () => ({
  saveWearableConnection: vi.fn(),
}));

const { exchangeCodeForTokens } = await import('@/lib/oauth/oauth2');
const { readStateCookie } = await import('@/lib/oauth/state');
const { saveWearableConnection } = await import('@/lib/wearables/token-store');
const { GET } = await import('@/app/api/polar/callback/route');

function req(query: string): Request {
  return new Request(`https://app.fahybrid.com/api/polar/callback${query}`, {
    headers: { cookie: 'polar_oauth_state=whatever' },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/polar/callback (human HTML)', () => {
  it('success → 200 HTML confirming the connection, clears the state cookie', async () => {
    vi.mocked(readStateCookie).mockReturnValue({ athlete_id: BigInt(5) });
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 3600,
      scope: 'sleep:read',
      raw: {},
    });
    vi.mocked(saveWearableConnection).mockResolvedValue(undefined);

    const res = await GET(req('?code=abc&state=xyz'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('set-cookie')).toContain('polar_oauth_state=');
    const html = await res.text();
    expect(html).toContain('Cuenta Polar conectada');
    expect(html).toContain('Ya puedes volver a la app');
    expect(saveWearableConnection).toHaveBeenCalledTimes(1);
  });

  it('provider error → 400 HTML, no token exchange', async () => {
    const res = await GET(req('?error=access_denied&error_description=Denegado'));
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('No se pudo conectar Polar');
    expect(html).toContain('Denegado');
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it('escapes provider-controlled error text (no raw HTML injection)', async () => {
    const evil = '<script>alert(1)</script>';
    const res = await GET(req(`?error=x&error_description=${encodeURIComponent(evil)}`));
    const html = await res.text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('missing code → 400 HTML', async () => {
    const res = await GET(req('?state=xyz'));
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('No se pudo conectar Polar');
  });

  it('invalid/expired state → 401 HTML, no token exchange', async () => {
    vi.mocked(readStateCookie).mockReturnValue(null);
    const res = await GET(req('?code=abc&state=xyz'));
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('caduc');
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });
});
