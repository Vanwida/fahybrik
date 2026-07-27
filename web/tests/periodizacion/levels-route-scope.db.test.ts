// PATCH/DELETE /api/coach/levels/[id] — la propiedad viaja DENTRO del WHERE de
// cada escritura (obra 0 multi-coach): un nivel de otro club es 404 y CERO filas
// tocadas; el caso propio sigue byte a byte.
//
// Route handlers reales contra DB real (Neon branch): solo se mockea la sesión
// coach (la frontera de auth). El route usa @/lib/db — el runner apunta
// DATABASE_URL y TEST_DATABASE_URL a la misma rama.

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { PATCH, DELETE } = await import('@/app/api/coach/levels/[id]/route');

type CoachSession = NonNullable<Awaited<ReturnType<typeof getCoachSession>>>;

function sessionFor(fx: Fixture): CoachSession {
  return { coach_id: BigInt(fx.coachId) } as unknown as CoachSession;
}

function patchReq(body: unknown): Request {
  return new Request('http://localhost/api/coach/levels/1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describeWithDb('/api/coach/levels/[id] — propiedad en el WHERE (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const levelIds: number[] = [];
  let clubA: Fixture;
  let clubB: Fixture;
  let levelA = 0;

  async function seedLevel(fx: Fixture, name: string): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into athlete_levels (coach_id, name, label, sort_order)
      values (${fx.coachId}, ${name}, ${name}, 0)
      returning id::text as id
    `;
    const id = Number(rows[0]!.id);
    levelIds.push(id);
    return id;
  }

  beforeAll(async () => {
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);
    levelA = await seedLevel(clubA, 'elite-a');
  });

  afterAll(async () => {
    if (levelIds.length) await sql`delete from athlete_levels where id in ${sql(levelIds)}`;
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('cross-club: B hace PATCH al nivel de A → 404 y la fila queda intacta', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(sessionFor(clubB));

    const res = await PATCH(patchReq({ name: 'robado' }), ctx(levelA));
    expect(res.status).toBe(404);

    const row = await sql<{ name: string }[]>`
      select name from athlete_levels where id = ${levelA}
    `;
    expect(row[0]!.name).toBe('elite-a');
  });

  test('cross-club: B hace DELETE al nivel de A → 404 y la fila sigue viva', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(sessionFor(clubB));

    const res = await DELETE(patchReq({}), ctx(levelA));
    expect(res.status).toBe(404);

    const row = await sql<{ id: string }[]>`
      select id::text as id from athlete_levels where id = ${levelA}
    `;
    expect(row).toHaveLength(1);
  });

  test('caso propio: A edita y borra SU nivel exactamente igual que siempre', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(sessionFor(clubA));

    const res = await PATCH(patchReq({ name: 'elite-a2', sort_order: 3 }), ctx(levelA));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      level: { name: string; sort_order: number; coach_id: string };
    };
    expect(body.level.name).toBe('elite-a2');
    expect(body.level.sort_order).toBe(3);
    expect(body.level.coach_id).toBe(String(clubA.coachId));

    const del = await DELETE(patchReq({}), ctx(levelA));
    expect(del.status).toBe(204);
    const row = await sql<{ id: string }[]>`
      select id::text as id from athlete_levels where id = ${levelA}
    `;
    expect(row).toHaveLength(0);
  });
});
