/**
 * Objetivo de carrera entre clubs: el atleta solo apunta a una carrera del
 * catálogo compartido, de su club o suya, y su fecha nunca reescribe una carrera
 * del catálogo compartido (es de todos los clubs).
 */
import { afterAll, expect, test } from 'vitest';

import { setAthleteTargetRace } from '@/lib/races/target-race-write';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete } from '../utils/db-fixtures';

describeWithDb('tenancy — objetivo de carrera', () => {
  const sql = getTestSql();
  afterAll(async () => {
    await closeTestSql();
  });

  async function seed(name: string, coachId: number | null, tentative = false): Promise<number> {
    const r = await sql<{ id: string }[]>`
      insert into events (slug, name, type, is_visible_to_athletes, created_by_coach_id, start_date, is_tentative)
      values (${`tr-${name}-${Date.now()}-${Math.random()}`}, ${name}, 'hyrox', true, ${coachId},
              ${tentative ? null : '2027-03-01'}::date, ${tentative})
      returning id::text as id`;
    return Number(r[0]!.id);
  }

  test('no apunta a una carrera de otro club; sí a la de su club y al catálogo', async () => {
    const A = await makeCoachAndAthlete(sql);
    const B = await makeCoachAndAthlete(sql);
    const ownB = await seed('ClubB', B.coachId);
    const ownA = await seed('ClubA', A.coachId);
    const cat = await seed('Catalogo', null);
    try {
      const set = (event_id: number) =>
        setAthleteTargetRace({ athlete_id: A.athleteId, event_id, start_date: '2027-03-01', require_visible: true, client: sql });
      await expect(set(ownB)).rejects.toMatchObject({ code: 'event_not_found' });
      await expect(set(ownA)).resolves.toBeTruthy();
      await expect(set(cat)).resolves.toBeTruthy();
    } finally {
      await sql`delete from races where athlete_id = ${A.athleteId}`;
      await sql`delete from events where id in ${sql([ownA, ownB, cat])}`;
      await A.cleanup();
      await B.cleanup();
    }
  });

  test('la fecha del atleta no reescribe una carrera «por confirmar» del catálogo', async () => {
    const A = await makeCoachAndAthlete(sql);
    const cat = await seed('PorConfirmar', null, true);
    try {
      await setAthleteTargetRace({ athlete_id: A.athleteId, event_id: cat, start_date: '2027-05-10', require_visible: true, client: sql });
      const e = await sql<{ start_date: string | null; is_tentative: boolean }[]>`
        select to_char(start_date, 'YYYY-MM-DD') as start_date, is_tentative from events where id = ${cat}`;
      expect(e[0]).toEqual({ start_date: null, is_tentative: true });
      const r = await sql<{ d: string }[]>`
        select to_char(race_date, 'YYYY-MM-DD') as d from races where athlete_id = ${A.athleteId} and event_id = ${cat}`;
      expect(r[0]!.d).toBe('2027-05-10');
    } finally {
      await sql`delete from races where athlete_id = ${A.athleteId}`;
      await sql`delete from events where id = ${cat}`;
      await A.cleanup();
    }
  });
});
