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
//
// Antes leía al atleta 64 / coach 60 / sesión 409 de la rama demo de Neon;
// ahora siembra su propio coach, atleta y sesiones, y los borra al acabar.
//
// LAS DOS RUTAS, COMO LAS LLAMA LA APP. `run_compliance` también transporta el
// umbral de pendiente del coach, y cada ruta lo resuelve antes de cargar: el
// atleta por su coach (app/api/athlete/assignments/[id]/detail/route.ts →
// resolveAthleteRunningThresholds) y el coach por sí mismo (lib/coach/
// session-detail.ts, desde e2fac0f «la lectura de carrera usa su pendiente»).
// Llamar al cargador del atleta SIN ese umbral ya no es la ruta del atleta: da
// null donde las dos apps reciben el número del coach.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import {
  makeRunExecution,
  makeRunExercise,
  makeRunZoneProfile,
  makeTemplateSegment,
  type RunLap,
} from '../utils/run-fixtures';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { loadCoachSessionDetail } from '@/lib/coach/session-detail';
import { patchCoachRunningThresholds, resolveAthleteRunningThresholds } from '@/lib/coach/running-thresholds';

// Un umbral propio del coach, distinto del defecto: si una de las dos rutas
// resolviera los defectos en vez de la fila del coach, la comparación lo ve.
const COACH_GRADIENT_PCT = 6;

describeWithDb('run_compliance: el atleta y el coach leen el MISMO veredicto (#71)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let executedId = 0;
  let unexecutedId = 0;

  /** El detalle del atleta tal y como lo pide su app (misma resolución del umbral). */
  async function athleteRoute(assignmentId: number) {
    const thresholds = await resolveAthleteRunningThresholds(fx.athleteId, sql);
    return loadAssignmentDetail({
      sql,
      athlete_id: BigInt(fx.athleteId),
      assignment_id: BigInt(assignmentId),
      gradient_retires_pace_pct: thresholds.gradient_retires_pace_pct,
    });
  }

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await patchCoachRunningThresholds(fx.coachId, { gradient_retires_pace_pct: COACH_GRADIENT_PCT }, sql);
    await makeRunZoneProfile(fx);
    const run = await makeRunExercise(fx);

    // La sesión ejecutada: 2×1000 @Z4 con 90 s de trote → 4 tramos con
    // leg_index, 2 de trabajo y 2 de recuperación (la forma de la ejecución
    // 210 que usaba la rama demo).
    const seriesTpl = await makeTemplate({ fx, name: 'Series 2×1000', format: 'intervals' });
    const seriesLine = await makeTemplateSegment({
      fx,
      templateId: seriesTpl,
      exerciseId: run,
      position: 0,
      prescription: {
        scheme: 'intervals',
        modality: 'run',
        structure: [
          {
            role: 'main',
            elements: [
              {
                times: 2,
                elements: [
                  { kind: 'work', measure: { type: 'distance', m: 1000 }, target: { type: 'pace_zone', zone: 4 } },
                  { kind: 'recovery', measure: { type: 'duration', s: 90 }, target: null, recovery_mode: 'trote' },
                ],
              },
            ],
          },
        ],
      },
    });
    executedId = await makeAssignment({ fx, templateId: seriesTpl, scheduledForIso: '2026-08-10' });
    const laps: RunLap[] = [284, 266].flatMap((pace, i) => [
      { template_segment_id: seriesLine, duration_s: pace, distance_m: 1000, pace_s_per_km: pace, leg: { index: 2 * i, role: 'work', phase: 'main' } },
      { template_segment_id: seriesLine, duration_s: 95, distance_m: 230, leg: { index: 2 * i + 1, role: 'recovery', phase: 'main' } },
    ]);
    await makeRunExecution({ fx, assignmentId: executedId, startedAtIso: '2026-08-10T06:00:00Z', laps });

    // La prescrita sin ejecutar: un rodaje que el atleta todavía no ha corrido.
    const steadyTpl = await makeTemplate({ fx, name: 'Rodaje 40′', format: 'steady' });
    await makeTemplateSegment({
      fx,
      templateId: steadyTpl,
      exerciseId: run,
      position: 0,
      prescription: { scheme: 'steady', modality: 'run', total_s: 2400, target: { kind: 'hr_zone', value: 2 } },
    });
    unexecutedId = await makeAssignment({ fx, templateId: steadyTpl, scheduledForIso: '2026-08-12' });
  }, 60_000);

  afterAll(async () => {
    await fx.cleanup(); // coach_running_thresholds cae en cascada con el coach
    await closeTestSql();
  });

  test('misma sesión real, mismo run_compliance byte a byte — nunca dos motores', async () => {
    const [athleteDetail, coachDetail] = await Promise.all([
      athleteRoute(executedId),
      loadCoachSessionDetail({ sql, coach_id: fx.coachId, athlete_id: fx.athleteId, assignment_id: executedId }),
    ]);

    expect(athleteDetail).not.toBeNull();
    expect(coachDetail.ok).toBe(true);
    if (!coachDetail.ok) throw new Error('coach detail not ok'); // guarda de tipo

    // El objeto entero, no un campo suelto: si un día una de las dos rutas
    // gana un campo nuevo y la otra no, esto lo dice sin que nadie tenga que
    // acordarse de mirarlo.
    expect(coachDetail.session.run_compliance).toEqual(athleteDetail!.run_compliance);

    // Y no un objeto vacío por casualidad — que la comparación tenga algo
    // real que comparar (esta ejecución trae tramos de carrera).
    expect(athleteDetail!.run_compliance.summary.total).toBeGreaterThan(0);
    // Ni un umbral que coincide porque las dos rutas cayeron en el defecto:
    // es el del coach.
    expect(athleteDetail!.run_compliance.gradient_retires_pace_pct).toBe(COACH_GRADIENT_PCT);
  });

  test('caso disperso — carrera prescrita pero sin ejecutar: los dos coinciden igual, sin_dato incluido', async () => {
    // Una sesión sin ejecución estructurada: esto NO da tramos:[] — da un
    // `sin_dato` honesto (item prescrito, cero laps ejecutados), que es
    // exactamente el caso "declarado, no inventado" que hay que comprobar en
    // las dos rutas. Antes, si la rama no tenía una sesión así, el test
    // volvía sin comprobar nada; ahora la siembra y la exige.
    const [athleteDetail, coachDetail] = await Promise.all([
      athleteRoute(unexecutedId),
      loadCoachSessionDetail({ sql, coach_id: fx.coachId, athlete_id: fx.athleteId, assignment_id: unexecutedId }),
    ]);
    expect(athleteDetail).not.toBeNull();
    expect(coachDetail.ok).toBe(true);
    if (!coachDetail.ok) throw new Error('coach detail not ok'); // guarda de tipo
    // La comparación que importa: coinciden, sea cual sea la forma real.
    expect(coachDetail.session.run_compliance).toEqual(athleteDetail!.run_compliance);
    expect(athleteDetail!.run_compliance.summary.sin_dato).toBeGreaterThan(0);
  });
});
