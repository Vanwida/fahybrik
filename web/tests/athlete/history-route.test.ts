// ATHLETE HISTORY — ROUTE layer. Mocks the auth + lib boundaries so the tests pin
// the route ORCHESTRATION: bearer required (401), month regex validation (400,
// without touching the DB lib), and a valid request handing (athlete_id, month) to
// the builder and returning its payload (200).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/athlete/history', () => ({ buildAthleteHistoryMonth: vi.fn() }));

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { buildAthleteHistoryMonth } = await import('@/lib/athlete/history');
const { GET } = await import('@/app/api/athlete/history/route');

function req(month: string | null, withAuth = true): Request {
  const url = month == null ? 'http://localhost/api/athlete/history' : `http://localhost/api/athlete/history?month=${month}`;
  return new Request(url, {
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  });
}

const SESSION = { athlete_id: BigInt(7) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/athlete/history', () => {
  it('401 without a bearer token', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    const res = await GET(req('2026-05', false));
    expect(res.status).toBe(401);
    expect(buildAthleteHistoryMonth).not.toHaveBeenCalled();
  });

  it('400 on a missing / malformed month', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    for (const bad of [null, 'garbage', '2026-13', '2026-00', '26-5', '2026-5']) {
      const res = await GET(req(bad));
      expect(res.status).toBe(400);
    }
    expect(buildAthleteHistoryMonth).not.toHaveBeenCalled();
  });

  it('200 hands (athlete_id, month) to the builder and returns its payload', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    const payload = { month: '2026-05', days: [] };
    vi.mocked(buildAthleteHistoryMonth).mockResolvedValue(payload);

    const res = await GET(req('2026-05'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    expect(buildAthleteHistoryMonth).toHaveBeenCalledWith(BigInt(7), '2026-05');
  });
});
