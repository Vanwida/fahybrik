// Una lesión registrada sin fecha de inicio empieza HOY en el calendario del
// atleta lesionado. Antes, el INSERT mandaba null a una columna NOT NULL y el
// coach que dejaba la fecha vacía en su diálogo recibía un 500.
//
// El instante: 10 mar 2031, 12:00 UTC → 01:00 del 11 en Auckland, el 10 en UTC
// y en Madrid (el defecto).

import { afterAll, beforeAll, expect, it } from 'vitest';
import { createInjury } from '@/lib/injuries/injuries';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2031-03-10T12:00:00Z');

describeWithDb('lesión sin fecha de inicio: empieza el hoy del atleta (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
  });

  afterAll(async () => {
    await sql`delete from injuries where athlete_id = ${fx.athleteId}`;
    await fx?.cleanup();
    await closeTestSql();
  });

  const create = (onset_date?: string) =>
    createInjury(
      BigInt(fx.athleteId),
      'coach',
      { zone: 'rodilla', severity: 'leve', ...(onset_date ? { onset_date } : {}) },
      sql,
      NOW,
    );

  it('el coach la registra sin fecha: se guarda, con el día del atleta (Auckland, el 11)', async () => {
    await sql`update athletes set timezone = 'Pacific/Auckland' where id = ${fx.athleteId}`;
    const injury = await create();
    expect(injury.onset_date).toBe('2031-03-11');
  });

  it('una fecha dada manda; sin huso guardado, el defecto', async () => {
    await sql`update athletes set timezone = 'Pacific/Auckland' where id = ${fx.athleteId}`;
    expect((await create('2031-03-02')).onset_date).toBe('2031-03-02');

    await sql`update athletes set timezone = null where id = ${fx.athleteId}`;
    expect((await create()).onset_date).toBe('2031-03-10');
  });
});
