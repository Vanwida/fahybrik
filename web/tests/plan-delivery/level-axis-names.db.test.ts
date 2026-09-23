// Un grupo sin nombre propio se llama por su regla CON el eje del coach, en la
// lista de grupos y en la biblioteca de programas (antes: «Nivel …» a mano).

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeClub, makeLevel, makeProgram, type Club } from './fixtures';
import { createGroup, listGroups } from '@/lib/coach/groups';
import { listPrograms } from '@/lib/dashboard/programming/programs';

describeWithDb('nombre de grupo con el eje del coach (DB real)', () => {
  const sql = getTestSql();
  let club: Club;

  beforeAll(async () => {
    club = await makeClub(sql, 1);
  });
  afterAll(async () => {
    await sql`update coaches set level_axis_label = null where id = ${club.coachId}`;
    await club.cleanup();
    await closeTestSql();
  });

  test('«Objetivo Sub-60 · 4 días» en grupos y programas', async () => {
    await sql`update coaches set level_axis_label = 'Objetivo' where id = ${club.coachId}`;
    const level = await makeLevel(club, 'Sub-60', 1);
    const program = await makeProgram(club, 2, 'Base');
    const g = await createGroup(
      club.coachId,
      { name: null, level_id: String(level), days_per_week: 4, end_policy: 'repeat', programs: [{ program_id: String(program) }] },
      sql,
    );
    expect(g.display_name).toBe('Objetivo Sub-60 · 4 días');
    expect((await listGroups(club.coachId, sql)).find((x) => x.id === g.id)?.display_name).toBe('Objetivo Sub-60 · 4 días');
    const row = (await listPrograms({ coach_id: club.coachId, client: sql })).find((p) => p.id === String(program));
    expect(row?.groups).toEqual([{ id: g.id, name: 'Objetivo Sub-60 · 4 días' }]);
  });
});
