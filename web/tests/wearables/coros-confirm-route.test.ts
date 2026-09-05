import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/sync/coros-link', () => ({ confirmCorosLink: vi.fn() }));
vi.mock('@/lib/db', () => ({ sql: {} }));

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { confirmCorosLink } = await import('@/lib/sync/coros-link');
const { POST } = await import('@/app/api/athlete/wearables/coros/confirm/route');

const SESSION = { athlete_id: BigInt(7) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

function req(body: unknown): Request {
  return new Request('http://localhost/api/athlete/wearables/coros/confirm', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/athlete/wearables/coros/confirm', () => {
  it('401 without bearer', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    const res = await POST(req({ confirmation_id: '1', answer: 'yes' }));
    expect(res.status).toBe(401);
  });

  it('400 on missing answer', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    const res = await POST(req({ confirmation_id: '1' }));
    expect(res.status).toBe(400);
  });

  it('200 yes delegates to confirmCorosLink', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    vi.mocked(confirmCorosLink).mockResolvedValue({ ok: true, answer: 'yes' });
    const res = await POST(req({ confirmation_id: '12', answer: 'yes' }));
    expect(res.status).toBe(200);
    expect(confirmCorosLink).toHaveBeenCalledWith(
      expect.objectContaining({ confirmationId: '12', answer: 'yes', athlete_id: BigInt(7) }),
    );
  });
});
