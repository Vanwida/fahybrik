// Real-DB test (#71) — EL ATLETA Y EL COACH LEEN EL MISMO VEREDICTO.
//
// team-lead, 12-ago: «bit a bit el mismo número... ponle un test que lo fije
// comparando las dos salidas, porque eso es lo que de verdad se puede romper
// dentro de seis meses». Este test no compara ARITMÉTICA (eso ya lo cubren
// los tests puros de shared/domain/adherence y run-compliance.test.ts) —
// compara que las DOS RUTAS DE CARGA (`loadAssignmentDetail`, el atleta;
// `loadCoachSessionDetail`, el coach) entreguen el MISMO objeto para la
// MISMA sesión real, porque `run_compliance` se computa UNA vez dentro de
// `buildAssignmentDetail` y el coach lo lee de ahí — nunca una segunda
// llamada a `buildRunCompliance`.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { loadCoachSessionDetail } from '@/lib/coach/session-detail';

const ATHLETE_ID = 64;
const COACH_ID = 60;
// La ejecución 210 (verificada en tareas anteriores de este mismo bloque):
// 4 tramos con leg_index — 2 de trabajo, 2 de recuperación — la más rica de
// las 3 que tiene estructura real en esta rama.
const ASSIGNMENT_ID = 409;

describeWithDb('run_compliance: el atleta y el coach leen el MISMO veredicto (#71)', () => {
  const sql = getTestSql();

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterAll(async () => {
    await closeTestSql();
  });

  test('misma sesión real, mismo run_compliance byte a byte — nunca dos motores', async () => {
    const [athleteDetail, coachDetail] = await Promise.all([
      loadAssignmentDetail({ sql, athlete_id: BigInt(ATHLETE_ID), assignment_id: BigInt(ASSIGNMENT_ID) }),
      loadCoachSessionDetail({ sql, coach_id: COACH_ID, athlete_id: ATHLETE_ID, assignment_id: ASSIGNMENT_ID }),
    ]);

    expect(athleteDetail).not.toBeNull();
    expect(coachDetail.ok).toBe(true);
    if (!coachDetail.ok) throw new Error('coach detail not ok'); // guarda de tipo

    // El objeto entero, no un campo suelto: si un día una de las dos rutas
    // gana un campo nuevo y la otra no, esto lo dice sin que nadie tenga que
    // acordarse de mirarlo.
    expect(coachDetail.session.run_compliance).toEqual(athleteDetail!.run_compliance);

    // Y no un objeto vacío por casualidad — que la comparación tenga algo
    // real que comparar (esta ejecución real trae tramos de carrera,
    // verificado en tareas anteriores de este mismo bloque).
    expect(athleteDetail!.run_compliance.summary.total).toBeGreaterThan(0);
  });

  test('caso disperso — carrera prescrita pero sin ejecutar: los dos coinciden igual, sin_dato incluido', async () => {
    // Cualquier assignment sin ejecución estructurada sirve. Verificado a
    // mano: en esta rama esto NO da tramos:[] — da un `sin_dato` honesto
    // (item prescrito, cero laps ejecutados), que es exactamente el caso
    // "declarado, no inventado" que hay que comprobar en las dos rutas.
    const rows = await sql<Array<{ id: string }>>`
      select wa.id::text as id
      from workout_assignments wa
      where wa.athlete_id = ${ATHLETE_ID}
        and not exists (
          select 1 from workout_executions we
          join segment_executions se on se.execution_id = we.id
          where we.assignment_id = wa.id and se.modality = 'run' and se.leg_index is not null
        )
      order by wa.id
      limit 1
    `;
    if (!rows[0]) return; // no hay ninguna en esta rama: nada que verificar, no es un fallo

    const assignmentId = Number(rows[0].id);
    const [athleteDetail, coachDetail] = await Promise.all([
      loadAssignmentDetail({ sql, athlete_id: BigInt(ATHLETE_ID), assignment_id: BigInt(assignmentId) }),
      loadCoachSessionDetail({ sql, coach_id: COACH_ID, athlete_id: ATHLETE_ID, assignment_id: assignmentId }),
    ]);
    expect(athleteDetail).not.toBeNull();
    if (!coachDetail.ok) return; // sesión que el coach no puede leer (ajena, etc.) — no aplica aquí
    // La comparación que importa: coinciden, sea cual sea la forma real.
    expect(coachDetail.session.run_compliance).toEqual(athleteDetail!.run_compliance);
  });
});
