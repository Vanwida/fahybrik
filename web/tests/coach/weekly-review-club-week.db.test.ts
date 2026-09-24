// La revisión semanal va en el calendario del CLUB (DECISIONS «Qué día es en cada
// sitio»): su semana es la del lunes del club y «posponer» es a su mañana. Y no
// inventa un plan: el que devolvía era una rotación fija, no el del club.
//
// El instante: domingo 9 mar 2031, 12:00 UTC → lunes 10, 01:00, en Auckland. En
// UTC la semana es la del lunes 3; para el club, ya es la del 10.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { getCurrentReview, saveReview } from '@/lib/coach/weekly-review';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2031-03-09T12:00:00Z');

describeWithDb('revisión semanal: la semana del club, sin plan inventado (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`update coaches set timezone = 'Pacific/Auckland' where id = ${fx.coachId}`;
  });

  afterAll(async () => {
    await sql`delete from coach_weekly_reviews where coach_id = ${fx.coachId}`;
    await fx?.cleanup();
    await closeTestSql();
  });

  it('la semana abierta es la del lunes del club, y no trae plan inventado', async () => {
    const current = await getCurrentReview({ coach_id: fx.coachId, now: NOW, client: sql });
    expect(current.review.iso_week_start).toBe('2031-03-10');
    expect(current.plan).toEqual([]);
  });

  it('posponer es a mañana en el calendario del club', async () => {
    const saved = await saveReview({
      coach_id: fx.coachId,
      iso_week_start: '2031-03-10',
      action: 'defer',
      now: NOW,
      client: sql,
    });
    expect(saved.deferred_until).toBe('2031-03-11');
  });
});
