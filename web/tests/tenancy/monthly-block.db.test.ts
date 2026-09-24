/**
 * La propuesta de bloque mensual pendiente de un atleta solo la lee su coach
 * (hallazgo P1 nº4: el GET devolvía la de cualquier atleta por id).
 */
import { afterAll, expect, test } from 'vitest';

import { loadPendingMonthlyBlock } from '@/lib/dashboard/coach/monthly-block-proposal';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeMonthTemplate, makeTemplate } from '../utils/db-fixtures';

describeWithDb('tenancy — propuesta de bloque mensual', () => {
  const sql = getTestSql();
  afterAll(async () => {
    await closeTestSql();
  });

  test('el coach A no lee la propuesta pendiente del atleta de B', async () => {
    const A = await makeCoachAndAthlete(sql);
    const B = await makeCoachAndAthlete(sql);
    try {
      const tpl = await makeTemplate({ fx: B, name: 'B' });
      const month = await makeMonthTemplate({ fx: B, weekCount: 1, workoutDays: [1], workoutTemplateId: tpl });
      await sql`
        insert into monthly_block_proposals (athlete_id, month_template_id, proposed_start_date, rationale)
        values (${B.athleteId}, ${month.monthId}, '2026-11-02', 'RAZÓN PRIVADA DE B')
      `;
      expect(await loadPendingMonthlyBlock({ coach_id: A.coachId, athlete_id: B.athleteId, client: sql })).toBeNull();
      const own = await loadPendingMonthlyBlock({ coach_id: B.coachId, athlete_id: B.athleteId, client: sql });
      expect(own?.rationale).toBe('RAZÓN PRIVADA DE B');
    } finally {
      await sql`delete from monthly_block_proposals where athlete_id = ${B.athleteId}`;
      await A.cleanup();
      await B.cleanup();
    }
  });
});
