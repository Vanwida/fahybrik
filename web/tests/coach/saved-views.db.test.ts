// Vistas guardadas de Atletas contra DB real, por la ruta: crear, listar con las de
// serie, renombrar, reordenar, borrar; nombres de serie reservados; duplicados; y
// tenencia (otro coach no ve ni toca las vistas ajenas).

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
const { getCoachSession } = await import('@/lib/auth/coach-session');
const listRoute = await import('@/app/api/coach/saved-views/route');
const itemRoute = await import('@/app/api/coach/saved-views/[id]/route');

type View = { id: string; name: string; query: string; position: number };

describeWithDb('vistas guardadas (DB real)', () => {
  const sql = getTestSql();
  let a: Fixture;
  let b: Fixture;
  const as = (fx: Fixture) =>
    vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(fx.coachId) } as never);
  const post = (body: unknown) =>
    listRoute.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));
  const patch = (id: string, body: unknown) =>
    itemRoute.PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), {
      params: Promise.resolve({ id }),
    });
  const del = (id: string) =>
    itemRoute.DELETE(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ id }) });

  beforeAll(async () => {
    a = await makeCoachAndAthlete(sql);
    b = await makeCoachAndAthlete(sql);
  });

  afterAll(async () => {
    await sql`delete from coach_saved_views where coach_id in (${a.coachId}, ${b.coachId})`;
    await a.cleanup();
    await b.cleanup();
    await closeTestSql();
  });

  test('crear, listar (con las de serie) y el orden por posición', async () => {
    as(a);
    const one = await post({ name: 'N3 sin plan', query: '?nivel=3&semana=sin_plan' });
    expect(one.status).toBe(201);
    const v1 = ((await one.json()) as { view: View }).view;
    expect(v1).toMatchObject({ query: 'nivel=3&semana=sin_plan', position: 0 });
    const v2 = ((await (await post({ name: 'Carrera en octubre', query: 'carrera=2026-10' })).json()) as { view: View }).view;
    expect(v2.position).toBe(1);

    const list = (await (await listRoute.GET()).json()) as { builtin: Array<{ name: string }>; views: View[] };
    expect(list.builtin.map((v) => v.name)).toEqual(['Necesitan algo', 'Todos', 'Sin plan', 'Empieza pronto', 'No ven su semana', 'Pausados']);
    expect(list.views.map((v) => v.name)).toEqual(['N3 sin plan', 'Carrera en octubre']);

    await patch(v2.id, { position: 0 });
    await patch(v1.id, { position: 1, name: 'N3 · sin plan' });
    const again = (await (await listRoute.GET()).json()) as { views: View[] };
    expect(again.views.map((v) => v.name)).toEqual(['Carrera en octubre', 'N3 · sin plan']);
  });

  test('nombres de serie reservados y duplicados, con un mensaje que dice qué hacer', async () => {
    as(a);
    const reserved = await post({ name: 'todos' });
    expect(reserved.status).toBe(422);
    expect(((await reserved.json()) as { error: { message: string } }).error.message).toMatch(/vista de serie/);
    const dup = await post({ name: 'carrera en OCTUBRE' });
    expect(dup.status).toBe(409);
    const hash = await post({ name: 'Con almohadilla', query: 'a=1#b' });
    expect(hash.status).toBe(422);
  });

  test('otro coach no ve ni toca las vistas ajenas', async () => {
    as(a);
    const mine = ((await (await listRoute.GET()).json()) as { views: View[] }).views[0]!;
    as(b);
    expect(((await (await listRoute.GET()).json()) as { views: View[] }).views).toEqual([]);
    expect((await patch(mine.id, { name: 'Robada' })).status).toBe(404);
    expect((await del(mine.id)).status).toBe(404);
    as(a);
    expect((await del(mine.id)).status).toBe(200);
    expect(((await (await listRoute.GET()).json()) as { views: View[] }).views).toHaveLength(1);
  });
});
