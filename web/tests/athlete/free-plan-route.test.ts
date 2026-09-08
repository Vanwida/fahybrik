// POST /api/athlete/workouts/free/plan — plan-only save (no execution row).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/db', () => ({ sql: vi.fn() }));
vi.mock('@/lib/athlete/create-free-workout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/athlete/create-free-workout')>();
  return {
    ...actual,
    saveFreeWorkoutPlan: vi.fn(),
    updateFreeWorkoutPlan: vi.fn(),
  };
});

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { sql } = await import('@/lib/db');
const { saveFreeWorkoutPlan, updateFreeWorkoutPlan, FreeWorkoutError } = await import(
  '@/lib/athlete/create-free-workout',
);
const { POST } = await import('@/app/api/athlete/workouts/free/plan/route');

const SESSION = { athlete_id: BigInt(7) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

const ROW_BODY = {
  title: 'Remo libre',
  modality: 'row',
  prescription: {
    scheme: 'intervals',
    modality: 'row',
    rounds: 3,
    rest_s: 60,
    sets: [{ measure: { kind: 'distance', meters: 500 }, rest_s: 60 }],
  },
};

function req(body: unknown, withAuth = true): Request {
  return new Request('http://localhost/api/athlete/workouts/free/plan', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(withAuth ? { authorization: 'Bearer token' } : {}),
    },
    body: JSON.stringify(body),
  });
}

function stubCoachRow(coach_id: string | null) {
  vi.mocked(sql).mockResolvedValue([{ coach_id }] as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
  vi.mocked(saveFreeWorkoutPlan).mockResolvedValue({ assignment_id: '801' });
  vi.mocked(updateFreeWorkoutPlan).mockResolvedValue({ assignment_id: '802' });
});

describe('POST /api/athlete/workouts/free/plan', () => {
  it('401 sin bearer', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    const res = await POST(req(ROW_BODY, false));
    expect(res.status).toBe(401);
    expect(saveFreeWorkoutPlan).not.toHaveBeenCalled();
  });

  it('create → 200 sin execution_id, saveFreeWorkoutPlan recibe coachId', async () => {
    stubCoachRow('60');
    const res = await POST(req(ROW_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      saved: true,
      assignment_id: '801',
      origin: 'self',
    });
    expect(saveFreeWorkoutPlan).toHaveBeenCalledTimes(1);
    expect(updateFreeWorkoutPlan).not.toHaveBeenCalled();
    expect(saveFreeWorkoutPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: 7,
        coachId: 60,
        title: 'Remo libre',
        kind: 'measured',
      }),
    );
  });

  it('update con assignment_id → updateFreeWorkoutPlan', async () => {
    stubCoachRow('60');
    const res = await POST(req({ ...ROW_BODY, assignment_id: 802 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      saved: true,
      assignment_id: '802',
      origin: 'self',
    });
    expect(updateFreeWorkoutPlan).toHaveBeenCalledWith(
      expect.objectContaining({ assignmentId: 802, athleteId: 7 }),
    );
    expect(saveFreeWorkoutPlan).not.toHaveBeenCalled();
  });

  it('409 plan_not_editable', async () => {
    stubCoachRow('60');
    vi.mocked(updateFreeWorkoutPlan).mockRejectedValue(
      new FreeWorkoutError('plan_not_editable', 'Cannot edit'),
    );
    const res = await POST(req({ ...ROW_BODY, assignment_id: 99 }));
    expect(res.status).toBe(409);
  });

  it('422 estructural antes de tocar la DB', async () => {
    const res = await POST(req({ title: 'x', modality: 'strength', items: [] }));
    expect(res.status).toBe(422);
    expect(sql).not.toHaveBeenCalled();
    expect(saveFreeWorkoutPlan).not.toHaveBeenCalled();
  });
});
