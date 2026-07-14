// POST /api/athlete/wearables/polar/connect-url — route orchestration.
// Mocks only the auth boundary; uses REAL crypto + config so the minted token is
// asserted to decode back to the bearer's athlete_id (never a body value).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { POST } = await import('@/app/api/athlete/wearables/polar/connect-url/route');
const { verifyConnectToken } = await import('@/lib/wearables/connect-token');

const SESSION = { athlete_id: BigInt(314) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

function req(withAuth = true, headers: Record<string, string> = {}): Request {
  return new Request('http://internal.local/api/athlete/wearables/polar/connect-url', {
    method: 'POST',
    headers: {
      ...(withAuth ? { authorization: 'Bearer t' } : {}),
      ...headers,
    },
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  // Restore Polar config each test may have toggled.
  setEnv('POLAR_CLIENT_ID', 'client-abc');
});

describe('POST /api/athlete/wearables/polar/connect-url', () => {
  it('401 without a bearer', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    const res = await POST(req(false));
    expect(res.status).toBe(401);
  });

  it('503 polar_not_configured when Polar env is missing', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    setEnv('POLAR_CLIENT_ID', undefined);
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'polar_not_configured' });
  });

  it('200 returns a connect URL whose token decodes to the BEARER athlete_id', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    const res = await POST(
      req(true, { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'app.fahybrid.com' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    const u = new URL(body.url);
    expect(u.origin).toBe('https://app.fahybrid.com');
    expect(u.pathname).toBe('/api/polar/connect');
    const token = u.searchParams.get('token')!;
    expect(token).toBeTruthy();
    const verified = verifyConnectToken({ token, provider: 'polar' });
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.athlete_id).toBe(BigInt(314));
  });

  it('uses the forwarded host/proto for the origin', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    const res = await POST(
      req(true, { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'fahybrik-demo.vercel.app' }),
    );
    const body = (await res.json()) as { url: string };
    expect(body.url.startsWith('https://fahybrik-demo.vercel.app/api/polar/connect?token=')).toBe(
      true,
    );
  });
});
