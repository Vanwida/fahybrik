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

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { POST } = await import('@/app/api/athlete/wearables/coros/connect-url/route');
const { verifyConnectToken } = await import('@/lib/wearables/connect-token');

const SESSION = { athlete_id: BigInt(314) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

function req(withAuth = true): Request {
  return new Request('http://internal.local/api/athlete/wearables/coros/connect-url', {
    method: 'POST',
    headers: withAuth ? { authorization: 'Bearer t' } : {},
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => setEnv('COROS_CLIENT_ID', 'client-abc'));

describe('POST /api/athlete/wearables/coros/connect-url', () => {
  it('401 without a bearer', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    const res = await POST(req(false));
    expect(res.status).toBe(401);
  });

  it('200 without Partner COROS_CLIENT_ID / SECRET (DCR self-service)', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    setEnv('COROS_CLIENT_ID', undefined);
    setEnv('COROS_CLIENT_SECRET', undefined);
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(new URL(body.url).pathname).toBe('/api/coros/connect');
  });

  it('200 returns a connect URL whose token decodes to the BEARER athlete_id', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    const u = new URL(body.url);
    expect(u.pathname).toBe('/api/coros/connect');
    const token = u.searchParams.get('token')!;
    const verified = verifyConnectToken({ token, provider: 'coros' });
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.athlete_id).toBe(BigInt(314));
  });
});
