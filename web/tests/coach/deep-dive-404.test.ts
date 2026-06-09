// A16 — Coach deep-dive must return 404 (not 403) when the athlete is not
// assigned to the coach, so existence of other coaches' athletes isn't leaked.
// 401 is preserved for unauthenticated requests.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let session: { coach_id: bigint; user_id: bigint } | null = null;
let deepDiveBehaviour: 'forbidden' | 'not_found' | 'ok' = 'ok';

vi.mock('@/lib/auth/coach-session', () => ({
  getCoachSession: async () => session,
}));

class AthleteDeepDiveError extends Error {
  constructor(public code: 'not_found' | 'forbidden', message: string) {
    super(message);
  }
}

vi.mock('@/lib/coach/athlete-deep-dive', () => ({
  AthleteDeepDiveError,
  buildAthleteDeepDive: async () => {
    if (deepDiveBehaviour === 'forbidden') {
      throw new AthleteDeepDiveError('forbidden', 'athlete not assigned to coach');
    }
    if (deepDiveBehaviour === 'not_found') {
      throw new AthleteDeepDiveError('not_found', 'athlete not found');
    }
    return { athlete: { id: '1' } };
  },
  appendNote: async () => {
    if (deepDiveBehaviour === 'forbidden') {
      throw new AthleteDeepDiveError('forbidden', 'athlete not assigned to coach');
    }
    return { id: '1', body: 'x', created_at: new Date() };
  },
}));

const { GET } = await import('@/app/api/coach/athletes/[id]/route');

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/coach/athletes/[id] — 403 vs 404 (A16)', () => {
  beforeEach(() => {
    session = { coach_id: BigInt(10), user_id: BigInt(1) };
    deepDiveBehaviour = 'ok';
  });
  afterEach(() => vi.clearAllMocks());

  it("returns 404 (not 403) when athlete isn't assigned to the coach", async () => {
    deepDiveBehaviour = 'forbidden';
    const res = await GET(new Request('http://localhost'), ctx('5'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('returns 404 for a genuinely non-existent athlete', async () => {
    deepDiveBehaviour = 'not_found';
    const res = await GET(new Request('http://localhost'), ctx('5'));
    expect(res.status).toBe(404);
  });

  it('returns 401 for an unauthenticated request', async () => {
    session = null;
    const res = await GET(new Request('http://localhost'), ctx('5'));
    expect(res.status).toBe(401);
  });

  it('returns 200 for an owned athlete', async () => {
    const res = await GET(new Request('http://localhost'), ctx('5'));
    expect(res.status).toBe(200);
  });
});
