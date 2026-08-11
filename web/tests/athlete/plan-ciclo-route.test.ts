// GET /api/athlete/plan/ciclo — ROUTE layer. Mocks auth + los tres resolutores
// (camino, end_policy, carreras) para pinchar la ORQUESTACIÓN del route, no sus
// libs (ya probadas contra DB real en camino.db.test.ts): bearer obligatorio
// (401), y el ensamblado exacto del contrato fijado — `carrera` prefiere la
// objetivo sobre la próxima, y los tres campos viajan tal cual devuelven sus
// resolutores.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/plan/camino', () => ({ resolvePlanPath: vi.fn(), resolveEndPolicy: vi.fn() }));
vi.mock('@/lib/races/next-race', () => ({ getTargetRace: vi.fn(), getNextRace: vi.fn() }));

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { resolvePlanPath, resolveEndPolicy } = await import('@/lib/plan/camino');
const { getTargetRace, getNextRace } = await import('@/lib/races/next-race');
const { GET } = await import('@/app/api/athlete/plan/ciclo/route');

function req(withAuth = true): Request {
  return new Request('http://localhost/api/athlete/plan/ciclo', {
    headers: withAuth ? { authorization: 'Bearer token' } : {},
  });
}

const SESSION = { athlete_id: BigInt(9) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

const NO_RACE = null;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolvePlanPath).mockResolvedValue(null);
  vi.mocked(resolveEndPolicy).mockResolvedValue(null);
  vi.mocked(getTargetRace).mockResolvedValue(NO_RACE);
  vi.mocked(getNextRace).mockResolvedValue(NO_RACE);
});

describe('GET /api/athlete/plan/ciclo', () => {
  it('401 sin bearer — no llama a ningún resolutor', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    const res = await GET(req(false));
    expect(res.status).toBe(401);
    expect(resolvePlanPath).not.toHaveBeenCalled();
  });

  it('sin nada asignado: camino null, al_acabar null, carrera null', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ camino: null, al_acabar: null, carrera: null });
    expect(resolvePlanPath).toHaveBeenCalledWith({ athlete_id: BigInt(9) });
  });

  it('camino y al_acabar viajan tal cual los devuelven sus resolutores', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    const camino = { total_weeks: 4, current_position: 0, segments: [] };
    vi.mocked(resolvePlanPath).mockResolvedValue(camino as never);
    vi.mocked(resolveEndPolicy).mockResolvedValue('repeat');

    const res = await GET(req());
    const body = await res.json();
    expect(body.camino).toEqual(camino);
    expect(body.al_acabar).toBe('repeat');
  });

  it('carrera: la OBJETIVO manda sobre la próxima cuando hay las dos', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    vi.mocked(getTargetRace).mockResolvedValue({
      name: 'HYROX Barcelona',
      race_date: '2026-11-15',
      goal_time_seconds: 5400,
    } as never);
    vi.mocked(getNextRace).mockResolvedValue({
      name: 'DEKA de calentamiento',
      race_date: '2026-09-01',
      goal_time_seconds: null,
    } as never);

    const res = await GET(req());
    const body = await res.json();
    expect(body.carrera).toEqual({ name: 'HYROX Barcelona', date: '2026-11-15', goal_time_s: 5400 });
  });

  it('carrera: sin objetivo marcado, cae a la próxima con fecha', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
    vi.mocked(getTargetRace).mockResolvedValue(NO_RACE);
    vi.mocked(getNextRace).mockResolvedValue({
      name: 'DEKA de calentamiento',
      race_date: '2026-09-01',
      goal_time_seconds: null,
    } as never);

    const res = await GET(req());
    const body = await res.json();
    expect(body.carrera).toEqual({ name: 'DEKA de calentamiento', date: '2026-09-01', goal_time_s: null });
  });
});
