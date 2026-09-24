/**
 * Catálogo de carreras entre clubs (hallazgo P1 nº5). Un coach editaba el
 * catálogo compartido que ven los atletas de todos los clubs, y la carrera
 * visible de un club salía en la app de los atletas de cualquier otro.
 */
import { afterAll, expect, test } from 'vitest';

import { listEvents } from '@/lib/coach/events';
import { updateEvent } from '@/lib/coach/events-write';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete } from '../utils/db-fixtures';

describeWithDb('tenancy — catálogo de carreras', () => {
  const sql = getTestSql();
  afterAll(async () => {
    await closeTestSql();
  });

  async function seed(name: string, coachId: number | null): Promise<number> {
    const r = await sql<{ id: string }[]>`
      insert into events (slug, name, type, is_visible_to_athletes, created_by_coach_id)
      values (${`tn-${name}-${Date.now()}-${Math.random()}`}, ${name}, 'hyrox', true, ${coachId})
      returning id::text as id`;
    return Number(r[0]!.id);
  }

  test('un coach no renombra ni oculta una carrera del catálogo compartido', async () => {
    const A = await makeCoachAndAthlete(sql);
    const cat = await seed('Catalogo', null);
    try {
      await expect(
        updateEvent({ event_id: BigInt(cat), owner: { kind: 'coach', coach_id: A.coachId }, input: { name: 'renombrada' }, client: sql }),
      ).rejects.toMatchObject({ status: 403 });
      const r = await sql<{ name: string }[]>`select name from events where id = ${cat}`;
      expect(r[0]!.name).toBe('Catalogo');
      // El admin sí.
      const adm = await updateEvent({ event_id: BigInt(cat), owner: { kind: 'admin' }, input: { name: 'curada' }, client: sql });
      expect(adm.name).toBe('curada');
    } finally {
      await sql`delete from events where id = ${cat}`;
      await A.cleanup();
    }
  });

  test('el atleta ve el catálogo y las carreras de SU club, no las visibles de otro', async () => {
    const A = await makeCoachAndAthlete(sql);
    const B = await makeCoachAndAthlete(sql);
    const cat = await seed('Catalogo', null);
    const ownA = await seed('ClubA', A.coachId);
    const ownB = await seed('ClubB', B.coachId);
    const ids = [cat, ownA, ownB];
    try {
      const seen = async (opts: Parameters<typeof listEvents>[0]) =>
        (await listEvents({ scope: 'all', visibility: 'visible', ...opts }, sql)).map((e) => Number(e.event_id)).filter((id) => ids.includes(id));
      expect((await seen({ athlete_id: A.athleteId })).sort()).toEqual([cat, ownA].sort());
      expect(await seen({ catalog_only: true })).toEqual([cat]);
    } finally {
      await sql`delete from events where id in ${sql(ids)}`;
      await A.cleanup();
      await B.cleanup();
    }
  });
});
