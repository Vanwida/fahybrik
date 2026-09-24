// Acciones en bloque sobre atletas contra DB real, por la ruta, con dos coaches:
// nivel (todo o nada), pausar/reanudar (el que no toca se salta con motivo), añadir
// y sacar de un grupo, y tenencia (un atleta o un nivel ajeno → 404, nada tocado).

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeClub, makeLevel, makeProgram, type Club } from '../plan-delivery/fixtures';
import { createGroup } from '@/lib/coach/groups';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
const { getCoachSession } = await import('@/lib/auth/coach-session');
const bulkRoute = await import('@/app/api/coach/athletes/bulk/route');

type Bulk = {
  changed: number;
  skipped: number;
  results: Array<{ athlete_id: string; ok: boolean; code: string | null; message: string | null }>;
  assign?: { applied?: { batch_id: string; assigned: number } };
};

describeWithDb('acciones en bloque (DB real)', () => {
  const sql = getTestSql();
  let a: Club;
  let b: Club;
  let levelA: number;
  let levelB: number;

  const as = (club: Club) =>
    vi.mocked(getCoachSession).mockResolvedValue({
      coach_id: BigInt(club.coachId),
      user_id: BigInt(club.fx.coachUserId),
    } as never);
  const post = (body: unknown) =>
    bulkRoute.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));
  const levelsOf = async (ids: number[]) =>
    (await sql<Array<{ level_id: string | null }>>`
      select level_id::text from athletes where id = any(${ids}::bigint[]) order by id
    `).map((r) => r.level_id);

  beforeAll(async () => {
    a = await makeClub(sql, 4);
    b = await makeClub(sql, 1);
    levelA = await makeLevel(a, 'N2', 2);
    levelB = await makeLevel(b, 'N9', 9);
  });

  afterAll(async () => {
    await a.cleanup();
    await b.cleanup();
    await closeTestSql();
  });

  test('nivel a varios: todos o ninguno', async () => {
    as(a);
    const ids = a.athleteIds.slice(0, 3);
    const res = await post({ action: 'set_level', athlete_ids: ids.map(String), level_id: String(levelA) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Bulk).changed).toBe(3);
    expect(await levelsOf(ids)).toEqual(ids.map(() => String(levelA)));

    const foreignLevel = await post({ action: 'set_level', athlete_ids: [String(a.athleteIds[3])], level_id: String(levelB) });
    expect(foreignLevel.status).toBe(404);
    expect(await levelsOf([a.athleteIds[3]!])).toEqual([null]);
  });

  test('un atleta de otro coach en la selección: 404 y nadie cambia', async () => {
    as(a);
    const before = await levelsOf([a.athleteIds[3]!]);
    const res = await post({
      action: 'set_level',
      athlete_ids: [String(a.athleteIds[3]), String(b.athleteIds[0])],
      level_id: String(levelA),
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/no se ha cambiado nada/);
    expect(await levelsOf([a.athleteIds[3]!])).toEqual(before);

    const pauseMixed = await post({ action: 'pause', reason: 'vacaciones', athlete_ids: [String(a.athleteIds[0]), String(b.athleteIds[0])] });
    expect(pauseMixed.status).toBe(404);
    const states = await sql`select lifecycle_status from athletes where id in (${a.athleteIds[0]!}, ${b.athleteIds[0]!}) and lifecycle_status <> 'activo'`;
    expect(states).toHaveLength(0);
  });

  test('pausar sin motivo pide el motivo; pausar y reanudar se saltan a quien no toca', async () => {
    as(a);
    const noReason = await post({ action: 'pause', athlete_ids: [String(a.athleteIds[0])] });
    expect(noReason.status).toBe(422);
    expect(((await noReason.json()) as { error: { message: string } }).error.message).toMatch(/motivo/);

    const [x, y] = [a.athleteIds[0]!, a.athleteIds[1]!];
    await post({ action: 'pause', reason: 'lesion', athlete_ids: [String(x)] });
    const both = (await (await post({ action: 'pause', reason: 'vacaciones', athlete_ids: [String(x), String(y)] })).json()) as Bulk;
    expect(both.changed).toBe(1);
    expect(both.results.find((r) => r.athlete_id === String(x))).toMatchObject({ ok: false, code: 'not_active' });

    const resumed = (await (await post({ action: 'resume', athlete_ids: [String(x), String(y), String(a.athleteIds[2])] })).json()) as Bulk;
    expect(resumed.changed).toBe(2);
    expect(resumed.results.find((r) => r.athlete_id === String(a.athleteIds[2]))).toMatchObject({ ok: false, code: 'not_paused' });
    const paused = await sql`select 1 from athletes where id = any(${a.athleteIds}::bigint[]) and lifecycle_status = 'pausado'`;
    expect(paused).toHaveLength(0);
  });

  test('añadir a un grupo y sacar de él', async () => {
    as(a);
    const program = await makeProgram(a, 2, 'Base');
    const group = await createGroup(a.coachId, { name: 'Bloque', end_policy: 'stop', programs: [{ program_id: String(program) }] }, sql);
    const ids = a.athleteIds.slice(2, 4).map(String);
    const added = (await (await post({ action: 'add_to_group', group_id: group.id, athlete_ids: ids })).json()) as Bulk;
    expect(added.changed).toBe(2);
    expect(added.assign?.applied?.assigned).toBe(2);

    // Otro coach no puede meter a sus atletas en este grupo.
    as(b);
    expect((await post({ action: 'add_to_group', group_id: group.id, athlete_ids: [String(b.athleteIds[0])] })).status).toBe(404);

    as(a);
    const removed = (await (await post({ action: 'remove_from_group', group_id: group.id, athlete_ids: [...ids, String(a.athleteIds[0])] })).json()) as Bulk;
    expect(removed.changed).toBe(2);
    expect(removed.results.find((r) => r.athlete_id === String(a.athleteIds[0]))).toMatchObject({ ok: false, code: 'not_member' });
  });
});
