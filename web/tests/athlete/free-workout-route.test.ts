// ENTRENO LIBRE — ROUTE layer (mocks en las fronteras, como history-route). Lo
// que se clava aquí es la ORQUESTACIÓN de la puerta free (tier FREE, fase 2):
//   · CON coach → igual que siempre: 200, createFreeWorkout recibe el coachId
//     numérico (la precondición del aviso workout_libre) y el payload contract.
//   · SIN coach (coach_id null) → el 422 `no_coach` YA NO EXISTE: 200, el libre
//     se crea igual y createFreeWorkout recibe coachId null (el aviso al coach
//     es best-effort accesorio, nunca parte del contrato de guardado).
// La persistencia real de ambos caminos vive en free-workout.db.test.ts; el
// validador estructural se deja REAL (es DB-free y es el mismo contrato).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/db', () => ({ sql: vi.fn() }));
vi.mock('@/lib/athlete/create-free-workout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/athlete/create-free-workout')>();
  return { ...actual, createFreeWorkout: vi.fn() };
});

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { sql } = await import('@/lib/db');
const { createFreeWorkout, FreeWorkoutError } = await import('@/lib/athlete/create-free-workout');
const { POST } = await import('@/app/api/athlete/workouts/free/route');

const SESSION = { athlete_id: BigInt(7) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

/** Un body de fuerza válido (pasa el validador REAL) con una métrica de ejecución. */
const STRENGTH_BODY = {
  title: 'Fuerza libre',
  modality: 'strength',
  perceived_exertion: 7,
  items: [
    {
      exercise_id: 5,
      prescription: {
        scheme: 'sets',
        modality: 'strength',
        sets: [{ measure: { kind: 'reps', value: 5 } }],
      },
    },
  ],
};

function req(body: unknown, withAuth = true): Request {
  return new Request('http://localhost/api/athlete/workouts/free', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(withAuth ? { authorization: 'Bearer token' } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** El único query del route: el select de athletes.coach_id. */
function stubCoachRow(coach_id: string | null) {
  vi.mocked(sql).mockResolvedValue([{ coach_id }] as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
  vi.mocked(createFreeWorkout).mockResolvedValue({ assignment_id: '901', execution_id: '902' });
});

describe('POST /api/athlete/workouts/free', () => {
  it('401 sin bearer', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    const res = await POST(req(STRENGTH_BODY, false));
    expect(res.status).toBe(401);
    expect(createFreeWorkout).not.toHaveBeenCalled();
  });

  it('CON coach → 200, createFreeWorkout recibe el coachId y responde el contract', async () => {
    stubCoachRow('60');
    const res = await POST(req(STRENGTH_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      saved: true,
      assignment_id: '901',
      execution_id: '902',
      origin: 'self',
    });
    expect(createFreeWorkout).toHaveBeenCalledTimes(1);
    expect(createFreeWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: 7,
        coachId: 60,
        title: 'Fuerza libre',
        scheme: 'sets',
        kind: 'items',
        metrics: { perceived_exertion: 7 },
      }),
    );
  });

  it('SIN coach → 200 igualmente (el 422 no_coach no existe): coachId null, mismo contract', async () => {
    stubCoachRow(null);
    const res = await POST(req(STRENGTH_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      saved: true,
      assignment_id: '901',
      execution_id: '902',
      origin: 'self',
    });
    expect(createFreeWorkout).toHaveBeenCalledTimes(1);
    expect(createFreeWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: 7, coachId: null, kind: 'items' }),
    );
  });

  it('422 de dominio (FreeWorkoutError) se mapea igual en ambos caminos', async () => {
    stubCoachRow(null);
    vi.mocked(createFreeWorkout).mockRejectedValue(
      new FreeWorkoutError('exercise_not_found', 'No exercise found for id 5'),
    );
    const res = await POST(req(STRENGTH_BODY));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('exercise_not_found');
  });

  it('422 estructural antes de tocar la DB (el validador es previo al select de coach)', async () => {
    const res = await POST(req({ title: 'x', modality: 'strength', items: [] }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('items_required');
    expect(sql).not.toHaveBeenCalled();
    expect(createFreeWorkout).not.toHaveBeenCalled();
  });
});
