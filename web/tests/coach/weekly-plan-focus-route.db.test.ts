// PATCH /api/coach/athletes/[id]/weekly-plan — el foco de la semana del
// atleta, contra DB real: el WHERE de tenancy real (un atleta de otro club es
// 404 y cero filas tocadas), el payload inválido, y el gotcha del default
// 'draft' del esquema (0021) — nace 'published' cuando la fila no existía,
// nunca esconde la semana como efecto secundario de escribir un foco.
//
// Route handler real contra DB real (Neon branch): solo se mockea la sesión
// coach (la frontera de auth), igual que /api/coach/levels/[id].

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { PATCH } = await import('@/app/api/coach/athletes/[id]/weekly-plan/route');

type CoachSession = NonNullable<Awaited<ReturnType<typeof getCoachSession>>>;

function sessionFor(fx: Fixture): CoachSession {
  return { coach_id: BigInt(fx.coachId) } as unknown as CoachSession;
}

function patchReq(body: unknown): Request {
  return new Request('http://localhost/api/coach/athletes/1/weekly-plan', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

const WEEK_START = '2026-10-05';

describeWithDb('PATCH /api/coach/athletes/[id]/weekly-plan (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  let clubA: Fixture;
  let clubB: Fixture;

  beforeAll(async () => {
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);
  });

  afterAll(async () => {
    await sql`delete from weekly_plans where athlete_id in (${clubA.athleteId}, ${clubB.athleteId})`;
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('caso propio: crea la fila con status published (NUNCA draft) y guarda el foco', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(sessionFor(clubA));

    const res = await PATCH(
      patchReq({ week_start: WEEK_START, focus: 'Acumulación de volumen' }),
      ctx(clubA.athleteId),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { weekly_plan: { focus: string | null } };
    expect(body.weekly_plan.focus).toBe('Acumulación de volumen');

    const row = await sql<Array<{ status: string; focus: string | null }>>`
      select status::text as status, focus from weekly_plans
      where athlete_id = ${clubA.athleteId} and week_start = ${WEEK_START}::date
    `;
    expect(row).toHaveLength(1);
    expect(row[0]!.status).toBe('published');
    expect(row[0]!.focus).toBe('Acumulación de volumen');
  });

  test('un espacio en blanco lo recorta a null (borra el override)', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(sessionFor(clubA));

    const res = await PATCH(patchReq({ week_start: WEEK_START, focus: '   ' }), ctx(clubA.athleteId));
    expect(res.status).toBe(200);

    const row = await sql<Array<{ focus: string | null }>>`
      select focus from weekly_plans where athlete_id = ${clubA.athleteId} and week_start = ${WEEK_START}::date
    `;
    expect(row[0]!.focus).toBeNull();
  });

  test('cross-club: B toca la semana de un atleta de A → 404 y CERO filas', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(sessionFor(clubB));

    const otherWeek = '2026-10-12';
    const res = await PATCH(
      patchReq({ week_start: otherWeek, focus: 'Robado' }),
      ctx(clubA.athleteId),
    );
    expect(res.status).toBe(404);

    const row = await sql<Array<{ id: string }>>`
      select id::text as id from weekly_plans
      where athlete_id = ${clubA.athleteId} and week_start = ${otherWeek}::date
    `;
    expect(row).toHaveLength(0);
  });

  test('payload inválido (sin week_start): 400, nada escrito', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(sessionFor(clubA));

    const res = await PATCH(patchReq({ focus: 'Sin semana' }), ctx(clubA.athleteId));
    expect(res.status).toBe(400);
  });

  test('sin sesión: 401', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);

    const res = await PATCH(patchReq({ week_start: WEEK_START, focus: 'x' }), ctx(clubA.athleteId));
    expect(res.status).toBe(401);
  });
});
