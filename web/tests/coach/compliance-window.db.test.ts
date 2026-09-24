// La adherencia de ventana de la ficha y de la cohorte usa LA regla (plan §4.2):
// solo lo debido, «partial» es hecho y lo de hoy sin hacer no cuenta. Antes
// contaba completed/scheduled con su propia consulta (25 % donde es 67 %).

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { loadCompliancePct, loadDailyAssignmentCounts } from '@/lib/coach/compliance-window';
import { boxToday } from '@/lib/coach/week-publishing';

function plus(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describeWithDb('ventana de adherencia debida (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  const today = boxToday();

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const tpl = await makeTemplate({ fx, name: 'Entreno' });
    for (const [off, status] of [[-3, 'partial'], [-2, 'missed'], [-1, 'completed'], [0, 'scheduled'], [1, 'scheduled']] as const) {
      await sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
                values (${fx.athleteId}, ${plus(today, off)}::date, ${tpl}, 1, ${status}::assignment_status)`;
    }
  });
  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  test('3 debidas (partial, missed, completed), 2 hechas → 67 %; hoy y mañana no cuentan', async () => {
    expect(await loadCompliancePct({ athlete_id: fx.athleteId, on_date: new Date(), days: 7, client: sql })).toBe(67);
  });

  test('por día: solo lo debido', async () => {
    const daily = await loadDailyAssignmentCounts({ athlete_id: fx.athleteId, on_date: new Date(), days: 7, client: sql });
    expect(daily).toEqual([
      { date: plus(today, -3), scheduled: 1, completed: 1 },
      { date: plus(today, -2), scheduled: 1, completed: 0 },
      { date: plus(today, -1), scheduled: 1, completed: 1 },
    ]);
  });
});
