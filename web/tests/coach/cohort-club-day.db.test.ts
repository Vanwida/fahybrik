// El roster es la vista del coach: «Hoy» / «Mañana» de la próxima sesión se
// cuentan desde el día del CLUB (DECISIONS «Qué día es en cada sitio»), no desde
// el día UTC del reloj.
//
// El instante: domingo 9 mar 2031, 12:00 UTC → lunes 10, 01:00, en Auckland. La
// sesión del martes 11 es «Mañana» para el club; con el día UTC salía a dos días
// y se pintaba como fecha.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildCohort } from '@/lib/coach/cohort';
import { nextSessionLabel } from '@/lib/coach/cohort-row';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2031-03-09T12:00:00Z');

it('la etiqueta cuenta entre días ya resueltos', () => {
  expect(nextSessionLabel('2031-03-10', '2031-03-10')).toBe('Hoy');
  expect(nextSessionLabel('2031-03-11', '2031-03-10')).toBe('Mañana');
  expect(nextSessionLabel('2031-03-14', '2031-03-10')).toMatch(/14/);
});

describeWithDb('roster: la próxima sesión en el día del club (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`update coaches set timezone = 'Pacific/Auckland' where id = ${fx.coachId}`;
    const templateId = await makeTemplate({ fx, name: `Rodaje ${Date.now()}` });
    await makeAssignment({ fx, templateId, scheduledForIso: '2031-03-11' });
  });

  afterAll(async () => {
    await fx?.cleanup();
    await closeTestSql();
  });

  it('la sesión del martes es «Mañana» para un club que ya está en lunes', async () => {
    const rows = await buildCohort({ coach_id: fx.coachId, now: NOW, client: sql });
    const row = rows.find((r) => Number(r.athlete_id) === fx.athleteId);
    expect(row?.next_session).toEqual({ label: 'Mañana', iso_date: '2031-03-11' });
  });
});
