// POST /api/athlete/plan/session/reset — portero, sin Neon.
//
// Clase (card 183): trabajo real + confirm:false → 409 needs_confirmation y
// no borra. confirm:true → borra la ejecución y deja scheduled. El envelope
// del 409 es el que iOS debe leer (APIErrorBody), no un error genérico.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  assignment: null as { id: string; status: string } | null,
  execution: null as { execution_id: string; has_recorded_work: boolean } | null,
  deleted: false,
  statusUpdated: false,
}));

vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/coach/attention/recompute', () => ({
  recomputeAthlete: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/db', () => {
  const run = async (strings: TemplateStringsArray) => {
    const raw = strings.join('?');
    if (/delete from workout_executions/i.test(raw)) {
      db.deleted = true;
      return db.execution ? [{ id: db.execution.execution_id }] : [];
    }
    if (/update workout_assignments/i.test(raw)) {
      db.statusUpdated = true;
      return [];
    }
    if (/from workout_assignments/i.test(raw)) {
      return db.assignment ? [db.assignment] : [];
    }
    if (/has_recorded_work/i.test(raw) || /from workout_executions/i.test(raw)) {
      return db.execution ? [db.execution] : [];
    }
    return [];
  };
  return {
    sql: Object.assign(run, {
      begin: async <T>(fn: (tx: typeof run) => Promise<T>) => fn(run),
    }),
  };
});

const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const { recomputeAthlete } = await import('@/lib/coach/attention/recompute');
const { POST } = await import('@/app/api/athlete/plan/session/reset/route');

const SESSION = { athlete_id: BigInt(64) } as unknown as NonNullable<
  Awaited<ReturnType<typeof getAthleteSessionFromBearer>>
>;

function req(body: unknown, withAuth = true): Request {
  return new Request('http://localhost/api/athlete/plan/session/reset', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(withAuth ? { authorization: 'Bearer token' } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(SESSION);
  db.assignment = { id: '510', status: 'completed' };
  db.execution = { execution_id: '88', has_recorded_work: true };
  db.deleted = false;
  db.statusUpdated = false;
});

describe('POST /api/athlete/plan/session/reset', () => {
  it('401 sin bearer', async () => {
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue(null);
    const res = await POST(req({ assignment_id: 510 }, false));
    expect(res.status).toBe(401);
    expect(db.deleted).toBe(false);
  });

  it('trabajo real + confirm:false → 409 needs_confirmation y no borra', async () => {
    const res = await POST(req({ assignment_id: 510, confirm: false }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('needs_confirmation');
    expect(body.error.details).toEqual({ has_recorded_work: true });
    expect(db.deleted).toBe(false);
    expect(db.statusUpdated).toBe(false);
    expect(recomputeAthlete).not.toHaveBeenCalled();
  });

  it('trabajo real + confirm:true borra la ejecución y deja scheduled', async () => {
    const res = await POST(req({ assignment_id: 510, confirm: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      reset: true,
      status: 'scheduled',
      deleted_execution: true,
    });
    expect(db.deleted).toBe(true);
    expect(db.statusUpdated).toBe(true);
  });

  it('sin trabajo real borra a la primera (confirm:false)', async () => {
    db.execution = { execution_id: '88', has_recorded_work: false };
    const res = await POST(req({ assignment_id: 510, confirm: false }));
    expect(res.status).toBe(200);
    expect(db.deleted).toBe(true);
    expect(db.statusUpdated).toBe(true);
  });
});
