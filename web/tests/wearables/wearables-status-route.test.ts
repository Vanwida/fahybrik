// GET /api/athlete/wearables — route orchestration. Mocks the auth + status-lib
// boundaries so the test pins: bearer required (401) and a valid request handing
// the bearer athlete_id to the reader and returning its payload under `providers`.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/wearables/status', () => ({ listWearableConnections: vi.fn() }));
vi.mock('@/lib/sync/coros-link', () => ({ listPendingCorosLinks: vi.fn() }));
vi.mock('@/lib/db', () => ({ sql: {} }));

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { listWearableConnections } = await import('@/lib/wearables/status');
const { listPendingCorosLinks } = await import('@/lib/sync/coros-link');
const { GET } = await import('@/app/api/athlete/wearables/route');

const SESSION = { athlete_id: BigInt(7) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

function req(withAuth = true): Request {
  return new Request('http://localhost/api/athlete/wearables', {
    headers: withAuth ? { authorization: 'Bearer t' } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPendingCorosLinks).mockResolvedValue([]);
});

describe('GET /api/athlete/wearables', () => {
  it('401 without a bearer', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    const res = await GET(req(false));
    expect(res.status).toBe(401);
    expect(listWearableConnections).not.toHaveBeenCalled();
  });

  it('200 hands the bearer athlete_id to the reader and returns { providers }', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    const providers = [{ provider: 'polar' as const, connected: true, connected_at: '2026-07-01T00:00:00.000Z' }];
    vi.mocked(listWearableConnections).mockResolvedValue(providers);

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providers, pending_links: [] });
    expect(listWearableConnections).toHaveBeenCalledWith({ athlete_id: BigInt(7) });
  });

  it('200 with an empty providers list when the athlete has no connections', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    vi.mocked(listWearableConnections).mockResolvedValue([]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providers: [], pending_links: [] });
  });
});
