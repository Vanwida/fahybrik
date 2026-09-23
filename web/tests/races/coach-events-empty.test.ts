// GET /api/coach/events — una lista vacía es una lista vacía. Antes, un coach
// real sin carreras veía carreras inventadas (el «demo» de relleno). Ahora la
// ruta devuelve lo que hay, y el panel pinta su estado vacío.

import { beforeEach, describe, expect, it, vi } from 'vitest';

let listed: unknown[] = [];

vi.mock('@/lib/auth/coach-session', () => ({
  getCoachSession: async () => ({ coach_id: 7n, user_id: 70n }),
}));

vi.mock('@/lib/coach/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coach/events')>();
  return { ...actual, listEvents: vi.fn(async () => listed) };
});

import { GET } from '@/app/api/coach/events/route';

describe('GET /api/coach/events', () => {
  beforeEach(() => {
    listed = [];
  });

  it('sin carreras: devuelve [] (nada inventado)', async () => {
    const res = await GET(new Request('http://x/api/coach/events?scope=upcoming'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[] };
    expect(body.events).toEqual([]);
  });

  it('con carreras: devuelve las del coach tal cual', async () => {
    listed = [{ id: '1', name: 'Carrera del club' }];
    const res = await GET(new Request('http://x/api/coach/events'));
    const body = (await res.json()) as { events: unknown[] };
    expect(body.events).toEqual(listed);
  });
});
