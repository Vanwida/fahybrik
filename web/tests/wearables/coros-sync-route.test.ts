// POST /api/athlete/wearables/coros/sync — orchestration + sync payload shape.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/coros/config', () => ({
  loadCorosConfig: vi.fn(),
  corosGatedResponse: vi.fn(),
}));
vi.mock('@/lib/sync/coros-sync', () => ({ runCorosSync: vi.fn() }));
vi.mock('@/lib/sync/coros-link', () => ({ listPendingCorosLinks: vi.fn() }));
vi.mock('@/lib/wearables/status', () => ({ listWearableConnections: vi.fn() }));
vi.mock('@/lib/db', () => ({ sql: {} }));

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { loadCorosConfig, corosGatedResponse } = await import('@/lib/coros/config');
const { runCorosSync } = await import('@/lib/sync/coros-sync');
const { listPendingCorosLinks } = await import('@/lib/sync/coros-link');
const { listWearableConnections } = await import('@/lib/wearables/status');
const { POST } = await import('@/app/api/athlete/wearables/coros/sync/route');

const SESSION = { athlete_id: BigInt(42) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

function req(withAuth = true): Request {
  return new Request('http://localhost/api/athlete/wearables/coros/sync', {
    method: 'POST',
    headers: withAuth ? { authorization: 'Bearer t' } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadCorosConfig).mockReturnValue({ ok: true, config: {} as never });
  vi.mocked(listPendingCorosLinks).mockResolvedValue([]);
  vi.mocked(listWearableConnections).mockResolvedValue([
    { provider: 'coros', connected: true, connected_at: '2026-09-05T10:00:00.000Z' },
  ]);
});

describe('POST /api/athlete/wearables/coros/sync', () => {
  it('401 without a bearer', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    const res = await POST(req(false));
    expect(res.status).toBe(401);
    expect(runCorosSync).not.toHaveBeenCalled();
  });

  it('503 when COROS MCP is not configured', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    vi.mocked(loadCorosConfig).mockReturnValue({ ok: false, missing: ['COROS_OAUTH_CALLBACK_URL'] });
    vi.mocked(corosGatedResponse).mockReturnValue(new Response('gated', { status: 503 }));
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(corosGatedResponse).toHaveBeenCalledWith(['COROS_OAUTH_CALLBACK_URL']);
  });

  it('200 returns imported/asked, diagnostics, providers and pending_links', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    vi.mocked(runCorosSync).mockResolvedValue({
      connections: 1,
      synced: 1,
      skipped: 0,
      errored: 0,
      imported: 0,
      asked: 0,
      activities_found: 0,
      skip_reason: null,
    });
    const pending = [
      {
        confirmation_id: '9',
        provider: 'coros' as const,
        source_workout_ref: 'coros:1',
        execution_id: '100',
        assignment_id: '200',
        started_at: '2026-09-05T08:00:00Z',
        name: 'Run',
      },
    ];
    vi.mocked(listPendingCorosLinks).mockResolvedValue(pending);

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      imported: 0,
      asked: 0,
      activities_found: 0,
      skip_reason: null,
      errored: 0,
      providers: [{ provider: 'coros', connected: true, connected_at: '2026-09-05T10:00:00.000Z' }],
      pending_links: pending,
    });
    expect(runCorosSync).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: BigInt(42) }),
    );
  });
});
