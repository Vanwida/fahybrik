// GET /api/athlete/wearables/garmin/plan — el plan compacto de los próximos días.
//
// Se simula la frontera de lectura (auth + la fuente de sesiones) para fijar lo
// que decide la ruta: la validación de `from` y `days` y la forma exacta del
// cable. Qué hay en cada plan lo cubre `garmin-plan.test.ts`; de dónde salen las
// sesiones, `garmin-plan-source.test.ts`.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/wearables/garmin-plan-source', () => ({ loadGarminPlanSessions: vi.fn() }));

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { loadGarminPlanSessions } = await import('@/lib/wearables/garmin-plan-source');
const { GET } = await import('@/app/api/athlete/wearables/garmin/plan/route');

const SESSION = { athlete_id: BigInt(7), user_id: BigInt(3) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

function req(query: string): Request {
  return new Request(`https://fahybrid.com/api/athlete/wearables/garmin/plan${query}`, {
    headers: { authorization: 'Bearer t' },
  });
}

beforeEach(() => {
  vi.mocked(getAthleteSessionFromBearer).mockReset().mockResolvedValue(SESSION);
  vi.mocked(loadGarminPlanSessions).mockReset().mockResolvedValue([]);
});

describe('autenticación y entrada', () => {
  it('sin bearer válido, 401 y no se lee nada', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    expect((await GET(req('?from=2026-10-01'))).status).toBe(401);
    expect(loadGarminPlanSessions).not.toHaveBeenCalled();
  });

  it('sin from, o con from que no es YYYY-MM-DD, 400: el reloj SIEMPRE manda su fecha local', async () => {
    for (const q of ['', '?days=3', '?from=01-10-2026', '?from=2026-10-1']) {
      expect((await GET(req(q))).status).toBe(400);
    }
    expect(loadGarminPlanSessions).not.toHaveBeenCalled();
  });

  it('days va de 1 a 14: fuera de rango o no numérico, 400', async () => {
    for (const d of ['0', '15', '-1', '2.5', 'abc']) {
      expect((await GET(req(`?from=2026-10-01&days=${d}`))).status).toBe(400);
    }
    for (const d of ['1', '14']) {
      expect((await GET(req(`?from=2026-10-01&days=${d}`))).status).toBe(200);
    }
  });
});

describe('la respuesta', () => {
  it('sin days, siete días; el atleta es el del bearer y from se pasa tal cual (fecha local del reloj)', async () => {
    await GET(req('?from=2026-10-01'));
    expect(loadGarminPlanSessions).toHaveBeenCalledWith({ athlete_id: BigInt(7), user_id: BigInt(3), from: '2026-10-01', days: 7 });
  });

  it('days explícito llega a la fuente', async () => {
    await GET(req('?from=2026-10-01&days=3'));
    expect(vi.mocked(loadGarminPlanSessions).mock.calls[0]![0]).toMatchObject({ days: 3 });
  });

  it('{ v, sesiones } con id y huella fuera del blob, y el motivo de las que no van', async () => {
    const sesiones = [
      { asignacion_id: 494, fecha: '2026-10-01', huella: 283253031, soportada: true, plan: 'AhMG' },
      { asignacion_id: 495, fecha: '2026-10-02', huella: null, soportada: false, motivo: 'fase_2' },
    ];
    vi.mocked(loadGarminPlanSessions).mockResolvedValue(sesiones as never);
    const res = await GET(req('?from=2026-10-01&days=2'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ v: 2, sesiones });
  });

  it('sin sesiones: 200 con la lista vacía (no hay nada es un estado, no un error)', async () => {
    const res = await GET(req('?from=2026-10-01'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ v: 2, sesiones: [] });
  });
});
