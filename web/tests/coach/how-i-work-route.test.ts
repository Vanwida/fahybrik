/**
 * Ruta /api/coach/how-i-work: sesión obligatoria, coach_id de la sesión,
 * validación Zod. No toca DB.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/coach/how-i-work', () => ({
  getHowIWork: vi.fn(),
  upsertHowIWorkText: vi.fn(),
}));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { getHowIWork, upsertHowIWorkText } = await import('@/lib/coach/how-i-work');
const { GET, PUT } = await import('@/app/api/coach/how-i-work/route');

const empty = {
  body_text: null,
  pdf: null,
  has_method: false,
  updated_at: null,
};

function session(coach_id: bigint) {
  return { coach_id } as Awaited<ReturnType<typeof getCoachSession>>;
}

describe('GET /api/coach/how-i-work', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(getHowIWork).mockReset();
    vi.mocked(upsertHowIWorkText).mockReset();
  });

  test('sin sesión: 401', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getHowIWork).not.toHaveBeenCalled();
  });

  test('lee solo el coach_id de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(42)));
    vi.mocked(getHowIWork).mockResolvedValue(empty);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(getHowIWork).toHaveBeenCalledWith(BigInt(42));
    const body = (await res.json()) as { has_method: boolean };
    expect(body.has_method).toBe(false);
  });
});

describe('PUT /api/coach/how-i-work', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(getHowIWork).mockReset();
    vi.mocked(upsertHowIWorkText).mockReset();
  });

  test('sin sesión: 401 y no escribe', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await PUT(
      new Request('http://localhost/api/coach/how-i-work', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body_text: 'hola' }),
      }),
    );
    expect(res.status).toBe(401);
    expect(upsertHowIWorkText).not.toHaveBeenCalled();
  });

  test('rechaza coach_id en el cuerpo', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(1)));
    const res = await PUT(
      new Request('http://localhost/api/coach/how-i-work', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body_text: 'hola', coach_id: 99 }),
      }),
    );
    expect(res.status).toBe(422);
    expect(upsertHowIWorkText).not.toHaveBeenCalled();
  });

  test('guarda el texto del coach de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(7)));
    vi.mocked(upsertHowIWorkText).mockResolvedValue({
      body_text: 'Primero estaciones',
      pdf: null,
      has_method: true,
      updated_at: '2026-08-17T10:00:00.000Z',
    });
    const res = await PUT(
      new Request('http://localhost/api/coach/how-i-work', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body_text: 'Primero estaciones' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(upsertHowIWorkText).toHaveBeenCalledWith(BigInt(7), 'Primero estaciones');
  });
});
