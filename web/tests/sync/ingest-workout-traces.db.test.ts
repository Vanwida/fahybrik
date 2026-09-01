import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { ingestWorkoutTraces } from '@/lib/sync/ingest-workout-traces';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

// El camino que se rompe en silencio: un re-sync en dos pasos (pulso ahora,
// velocidad más tarde) deja media cabecera si el segundo POST no relee lo que
// ya había. `ingestWorkoutTraces` siempre relee TODAS las trazas guardadas de
// la ejecución (no solo el payload del request actual) — este test prueba
// exactamente eso contra una base real, no contra la lógica en abstracto.

function dense(start: number, end: number, step: number, value: number): { offsets_s: number[]; values: number[] } {
  const offsets_s: number[] = [];
  const values: number[] = [];
  for (let t = start; t <= end; t += step) {
    offsets_s.push(t);
    values.push(value);
  }
  return { offsets_s, values };
}

describeWithDb('ingestWorkoutTraces (real DB) — reenvío en dos pasos', () => {
  const sql = getTestSql();
  let fx: Fixture;
  const executionIds: number[] = [];

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
  });

  afterEach(async () => {
    for (const id of executionIds.splice(0)) {
      await sql`delete from workout_traces where execution_id = ${id}`;
      await sql`delete from workout_executions where id = ${id}`;
    }
  });

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  it('sube pulso primero y velocidad después: la deriva se completa en el segundo POST sin perder la primera mitad', async () => {
    const startedAtIso = '2026-08-02T06:00:00Z';
    const templateId = await makeTemplate({ fx, name: 'Rodaje' });
    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: startedAtIso.slice(0, 10) });
    const execRows = await sql<Array<{ id: string }>>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at)
      values (${assignmentId}, ${fx.athleteId}, ${startedAtIso}::timestamptz, ${startedAtIso}::timestamptz + interval '50 minutes')
      returning id::text
    `;
    const executionId = Number(execRows[0]!.id);
    executionIds.push(executionId);

    // Tramo sostenido [0,3000] (50 min, muy por encima del mínimo de 20 min).
    // Mitad 1: 150 lpm / 3.2 m/s. Mitad 2: 158 lpm / 2.9 m/s — deriva positiva clara.
    const hr1 = dense(0, 1490, 20, 150);
    const hr2 = dense(1510, 3000, 20, 158);
    const speed1 = dense(0, 1490, 20, 3.2);
    const speed2 = dense(1510, 3000, 20, 2.9);

    // Paso 1: solo pulso. Dispara el recálculo (hasHeaderSignal), pero sin
    // velocidad la deriva no se puede completar — tiene que quedar null.
    const step1 = await ingestWorkoutTraces({
      athlete_id: fx.athleteId,
      payload: {
        execution_id: executionId,
        traces: [
          {
            signal: 'hr',
            source: 'healthkit',
            started_at: startedAtIso,
            offsets_s: [...hr1.offsets_s, ...hr2.offsets_s],
            values: [...hr1.values, ...hr2.values],
          },
        ],
      },
      client: sql,
    });
    expect(step1.ok).toBe(true);
    if (step1.ok) expect(step1.header_recomputed).toBe(true);

    const midRows = await sql<Array<{ decoupling_pct: string | null }>>`
      select decoupling_pct from workout_executions where id = ${executionId}
    `;
    expect(midRows[0]!.decoupling_pct).toBeNull();

    // Paso 2: solo velocidad, en un segundo request independiente. Si el
    // recálculo NO releyera el pulso ya guardado, esto seguiría dando null.
    const step2 = await ingestWorkoutTraces({
      athlete_id: fx.athleteId,
      payload: {
        execution_id: executionId,
        traces: [
          {
            signal: 'speed',
            source: 'gps',
            started_at: startedAtIso,
            offsets_s: [...speed1.offsets_s, ...speed2.offsets_s],
            values: [...speed1.values, ...speed2.values],
          },
        ],
      },
      client: sql,
    });
    expect(step2.ok).toBe(true);

    const finalRows = await sql<Array<{ decoupling_pct: string | null }>>`
      select decoupling_pct from workout_executions where id = ${executionId}
    `;
    expect(finalRows[0]!.decoupling_pct).not.toBeNull();
    expect(Number(finalRows[0]!.decoupling_pct)).toBeGreaterThan(0); // EF cayó de la 1ª a la 2ª mitad
  });
});
