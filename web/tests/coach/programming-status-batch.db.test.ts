// `loadProgrammingStatusMap` set-based (una consulta) ≡ `getAthleteProgrammingStatus`
// atleta por atleta, contra una base REAL. Sustituye al bucle for…await de 1–5
// consultas por atleta (≈310 en serie a 100 atletas, informe B §2.5).

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  getAthleteProgrammingStatus,
  loadProgrammingStatusMap,
} from '@fahybrid/shared/domain/coach/programming-status';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2026-09-23T10:00:00.000Z');

describeWithDb('loadProgrammingStatusMap — set-based', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  beforeAll(async () => {
    // Sin programa.
    fixtures.push(await makeCoachAndAthlete(sql));
    // Programa terminado sin siguiente (bloque terminado).
    const ended = await makeCoachAndAthlete(sql);
    fixtures.push(ended);
    const m = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name) values (${ended.coachId}, 'Viejo') returning id::text
    `;
    ended.monthTemplates.push({ monthId: Number(m[0]!.id), weekIds: [] });
    await sql`insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date)
              values (${ended.athleteId}, ${Number(m[0]!.id)}, '2026-08-01', '2026-08-28')`;
    // Programa con sesiones esta semana (ok).
    const ok = await makeCoachAndAthlete(sql);
    fixtures.push(ok);
    const m2 = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name) values (${ok.coachId}, 'Base') returning id::text
    `;
    ok.monthTemplates.push({ monthId: Number(m2[0]!.id), weekIds: [] });
    await sql`insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date)
              values (${ok.athleteId}, ${Number(m2[0]!.id)}, '2026-09-14', '2026-10-11')`;
    const tpl = await makeTemplate({ fx: ok, name: 'x' });
    await sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version)
              values (${ok.athleteId}, '2026-09-24', ${tpl}, 1)`;
  });

  afterAll(async () => {
    for (const f of fixtures) await f.cleanup();
    await closeTestSql();
  });

  it('da lo mismo que el camino por atleta, para todos los atletas de la base', async () => {
    const all = await sql<Array<{ id: string }>>`select id::text from athletes order by id limit 300`;
    const ids = all.map((r) => Number(r.id));
    const map = await loadProgrammingStatusMap({ athlete_ids: ids, on_date: NOW, client: sql });
    expect(map.size).toBe(ids.length);
    for (const id of ids) {
      const one = await getAthleteProgrammingStatus({ athlete_id: id, on_date: NOW, client: sql });
      expect(map.get(String(id)), `atleta ${id}`).toEqual(one);
    }
    expect(map.get(String(fixtures[0]!.athleteId))!.status).toBe('no_month');
    expect(map.get(String(fixtures[1]!.athleteId))!.status).toBe('block_ended');
    expect(map.get(String(fixtures[2]!.athleteId))!.status).toBe('ok');
  });
});
