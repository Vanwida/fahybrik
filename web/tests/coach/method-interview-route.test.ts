// GET/PUT /api/coach/method-interview — orquestación: sesión, JSON, Zod.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/coach/method-interview', () => ({
  getCoachMethodInterview: vi.fn(),
  upsertCoachMethodInterview: vi.fn(),
}));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { getCoachMethodInterview, upsertCoachMethodInterview } = await import(
  '@/lib/coach/method-interview'
);
const { GET, PUT } = await import('@/app/api/coach/method-interview/route');
const { emptyInterview, INTERVIEW_QUESTION_COUNT } = await import(
  '@fahybrid/shared/domain/coach/method-interview'
);

const SESSION = { coach_id: BigInt(4) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getCoachSession>>
>;

const EMPTY = {
  ...emptyInterview(),
  answered_count: 0,
  question_count: INTERVIEW_QUESTION_COUNT,
  updated_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/coach/method-interview', () => {
  it('401 sin sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getCoachMethodInterview).not.toHaveBeenCalled();
  });

  it('200 sirve la fila del coach de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    vi.mocked(getCoachMethodInterview).mockResolvedValue(EMPTY);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(EMPTY);
    expect(getCoachMethodInterview).toHaveBeenCalledWith(BigInt(4));
  });
});

describe('PUT /api/coach/method-interview', () => {
  it('401 sin sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await PUT(new Request('http://localhost/api/coach/method-interview', {
      method: 'PUT',
      body: '{}',
    }));
    expect(res.status).toBe(401);
  });

  it('400 si el body no es JSON', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    const res = await PUT(new Request('http://localhost/api/coach/method-interview', {
      method: 'PUT',
      body: 'no-json',
    }));
    expect(res.status).toBe(400);
  });

  it('422 si una casilla no es del catálogo', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    const res = await PUT(
      new Request('http://localhost/api/coach/method-interview', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          answers: { ...emptyInterview().answers, typical_day: 'periodizado' },
        }),
      }),
    );
    expect(res.status).toBe(422);
    expect(upsertCoachMethodInterview).not.toHaveBeenCalled();
  });

  it('200 entrega el conjunto al upsert', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    vi.mocked(upsertCoachMethodInterview).mockResolvedValue(EMPTY);
    const res = await PUT(
      new Request('http://localhost/api/coach/method-interview', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers: emptyInterview().answers }),
      }),
    );
    expect(res.status).toBe(200);
    expect(upsertCoachMethodInterview).toHaveBeenCalledWith(
      BigInt(4),
      expect.objectContaining({ answers: emptyInterview().answers }),
    );
  });
});
