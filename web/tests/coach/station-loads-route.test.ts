import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/coach/station-loads', () => ({
  getCoachStationLoads: vi.fn(),
  upsertCoachStationLoads: vi.fn(),
}));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { getCoachStationLoads, upsertCoachStationLoads } = await import(
  '@/lib/coach/station-loads'
);
const { GET, PUT } = await import('@/app/api/coach/station-loads/route');
const { emptyCoachStationLoadGrid, COACH_STATION_LOAD_CELL_COUNT } = await import(
  '@fahybrid/shared/domain/coach/station-loads'
);

const SESSION = { coach_id: BigInt(4) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getCoachSession>>
>;

const EMPTY = {
  cells: emptyCoachStationLoadGrid(),
  filled_count: 0,
  cell_count: COACH_STATION_LOAD_CELL_COUNT,
  updated_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/coach/station-loads', () => {
  it('401 sin sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getCoachStationLoads).not.toHaveBeenCalled();
  });

  it('200 sirve la rejilla del coach de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    vi.mocked(getCoachStationLoads).mockResolvedValue(EMPTY);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(EMPTY);
    expect(getCoachStationLoads).toHaveBeenCalledWith(BigInt(4));
  });
});

describe('PUT /api/coach/station-loads', () => {
  it('401 sin sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await PUT(
      new Request('http://localhost/api/coach/station-loads', { method: 'PUT', body: '{}' }),
    );
    expect(res.status).toBe(401);
  });

  it('400 si el body no es JSON', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    const res = await PUT(
      new Request('http://localhost/api/coach/station-loads', {
        method: 'PUT',
        body: 'no-json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('422 si la estación no tiene eje de carga', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    const res = await PUT(
      new Request('http://localhost/api/coach/station-loads', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cells: [{ station_slug: 'hyrox-burpee-broad-jump', division: 'open', gender: 'men', kg: 20 }],
        }),
      }),
    );
    expect(res.status).toBe(422);
    expect(upsertCoachStationLoads).not.toHaveBeenCalled();
  });

  it('422 si se mandan kilos a un damper', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    const res = await PUT(
      new Request('http://localhost/api/coach/station-loads', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cells: [{ station_slug: 'ski-erg', division: 'open', gender: 'men', kg: 10 }],
        }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it('200 guarda las celdas del coach de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(SESSION);
    vi.mocked(upsertCoachStationLoads).mockResolvedValue(EMPTY);
    const body = {
      cells: [{ station_slug: 'hyrox-sled-push', division: 'open', gender: 'men', kg: 152 }],
    };
    const res = await PUT(
      new Request('http://localhost/api/coach/station-loads', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(200);
    expect(upsertCoachStationLoads).toHaveBeenCalledWith(BigInt(4), body);
  });
});
