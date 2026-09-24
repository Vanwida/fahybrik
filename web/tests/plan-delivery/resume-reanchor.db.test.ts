// Reanudar a un atleta en pausa re-ancla su plan en el lunes que viene — también
// si su grupo NO tiene regla nivel × días (0215). Antes el re-anclaje resolvía la
// secuencia por la celda nivel × días y a esos atletas no les hacía nada.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeClub, makeProgram, mondayPlus, type Club } from './fixtures';
import { createGroup } from '@/lib/coach/groups';
import { boxToday } from '@/lib/coach/week-publishing';
import { reanchorPlanAfterResume } from '@/lib/coach/athlete-lifecycle-plan';

describeWithDb('re-anclar el plan al reanudar (DB real)', () => {
  const sql = getTestSql();
  let club: Club;
  let A: number;
  let B: number;
  const nextMonday = mondayPlus(boxToday(), 1);

  beforeAll(async () => {
    club = await makeClub(sql, 1);
    A = await makeProgram(club, 2, 'Base');
    B = await makeProgram(club, 3, 'Build');
  });

  afterAll(async () => {
    await club.cleanup();
    await closeTestSql();
  });

  test('grupo sin nivel ni días: materializa el programa de SU posición el lunes que viene, una vez', async () => {
    const g = await createGroup(
      club.coachId,
      { name: 'Sin regla', end_policy: 'stop', programs: [{ program_id: String(A) }, { program_id: String(B) }] },
      sql,
    );
    const athlete = club.athleteIds[0]!;
    await sql`insert into athlete_sequence_progress (athlete_id, coach_id, sequence_id, current_position)
              values (${athlete}, ${club.coachId}, ${Number(g.id)}, 2)`;

    await reanchorPlanAfterResume(BigInt(athlete), sql);
    await reanchorPlanAfterResume(BigInt(athlete), sql); // doble reanudar: no duplica

    const receipts = await sql<Array<{ month_template_id: string; start_date: string }>>`
      select month_template_id::text, to_char(start_date, 'YYYY-MM-DD') as start_date
      from athlete_month_assignments where athlete_id = ${athlete}
    `;
    expect(receipts).toEqual([{ month_template_id: String(B), start_date: nextMonday }]);
  });
});
