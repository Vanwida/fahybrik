import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/coach/phrase-dictionary', () => ({
  getCoachPhraseDictionary: vi.fn(),
  upsertCoachPhraseDictionary: vi.fn(),
}));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { getCoachPhraseDictionary, upsertCoachPhraseDictionary } = await import(
  '@/lib/coach/phrase-dictionary'
);
const { GET, PUT } = await import('@/app/api/coach/phrase-dictionary/route');

const SESSION = { coach_id: BigInt(4) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getCoachSession>>
>;

const EMPTY = { entries: [], updated_at: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/coach/phrase-dictionary', () => {
  it('401 sin sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getCoachPhraseDictionary).not.toHaveBeenCalled();
  });

  it('200 sirve el mapa del coach de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    vi.mocked(getCoachPhraseDictionary).mockResolvedValue(EMPTY);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(EMPTY);
    expect(getCoachPhraseDictionary).toHaveBeenCalledWith(BigInt(4));
  });
});

describe('PUT /api/coach/phrase-dictionary', () => {
  it('401 sin sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await PUT(
      new Request('http://localhost/api/coach/phrase-dictionary', { method: 'PUT', body: '{}' }),
    );
    expect(res.status).toBe(401);
  });

  it('400 si el body no es JSON', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    const res = await PUT(
      new Request('http://localhost/api/coach/phrase-dictionary', {
        method: 'PUT',
        body: 'no-json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('422 si el techo es menor que el suelo', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    const res = await PUT(
      new Request('http://localhost/api/coach/phrase-dictionary', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entries: [{ phrase: 'carga media', as: 'competition_percent', value: 70, value_max: 50 }],
        }),
      }),
    );
    expect(res.status).toBe(422);
    expect(upsertCoachPhraseDictionary).not.toHaveBeenCalled();
  });

  it('200 guarda las frases del coach de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    vi.mocked(upsertCoachPhraseDictionary).mockResolvedValue(EMPTY);
    const body = { entries: [{ phrase: 'carga media', as: 'competition_percent', value: 60 }] };
    const res = await PUT(
      new Request('http://localhost/api/coach/phrase-dictionary', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(200);
    expect(upsertCoachPhraseDictionary).toHaveBeenCalledWith(BigInt(4), body);
  });
});
