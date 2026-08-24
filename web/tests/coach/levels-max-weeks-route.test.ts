import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MICROCICLO_DEFAULT_MAX_WEEKS } from '@fahybrid/shared/domain/coach/program-months';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/coach/microcycle-limits', () => ({
  loadCoachMaxMicrocicloWeeks: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { loadCoachMaxMicrocicloWeeks } = await import('@/lib/coach/microcycle-limits');
const { sql } = await import('@/lib/db');
const { GET } = await import('@/app/api/coach/levels/route');

const LEVEL = {
  id: '11',
  coach_id: '60',
  name: 'N2',
  label: 'Base',
  description: null,
  sort_order: 1,
};

function session(coach_id: bigint) {
  return { coach_id } as Awaited<ReturnType<typeof getCoachSession>>;
}

describe('GET /api/coach/levels — tope de semanas no tumba los niveles', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(loadCoachMaxMicrocicloWeeks).mockReset();
    vi.mocked(sql).mockReset();
  });

  test('sin sesión: 401 y no lee', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(loadCoachMaxMicrocicloWeeks).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  test('si falla el tope, 200 con los niveles y el defecto de semanas', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(60)));
    vi.mocked(sql).mockResolvedValue([LEVEL] as never);
    vi.mocked(loadCoachMaxMicrocicloWeeks).mockRejectedValue(
      Object.assign(new Error('column "max_microcycle_weeks" does not exist'), { code: '42703' }),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      levels: typeof LEVEL[];
      max_microcycle_weeks: number;
    };
    expect(body.levels).toEqual([LEVEL]);
    expect(body.max_microcycle_weeks).toBe(MICROCICLO_DEFAULT_MAX_WEEKS);
  });

  test('si el tope existe, viaja el del coach', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(60)));
    vi.mocked(sql).mockResolvedValue([LEVEL] as never);
    vi.mocked(loadCoachMaxMicrocicloWeeks).mockResolvedValue(3);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { max_microcycle_weeks: number };
    expect(body.max_microcycle_weeks).toBe(3);
  });
});
