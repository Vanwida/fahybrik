import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { loadSessionTrace, EMPTY_TRACE } from '@/lib/execution/session-trace';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

// El camino de lectura, contra una base real: la regla que decide este módulo
// —lo derivado sale de la traza COMPLETA, la curva se reduce DESPUÉS, nunca
// antes— solo se prueba de verdad leyendo filas reales de workout_traces, no
// llamando a las funciones puras en abstracto (esas ya están cubiertas en
// tests/running/{km-splits,downsample}.test.ts).

describeWithDb('loadSessionTrace / loadAssignmentDetail (real DB) — el camino de lectura', () => {
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

  async function makeExecution(startedAtIso: string): Promise<{ executionId: number; assignmentId: number }> {
    const templateId = await makeTemplate({ fx, name: 'Rodaje' });
    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: startedAtIso.slice(0, 10) });
    const rows = await sql<Array<{ id: string }>>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at)
      values (${assignmentId}, ${fx.athleteId}, ${startedAtIso}::timestamptz, ${startedAtIso}::timestamptz + interval '40 minutes')
      returning id::text
    `;
    const executionId = Number(rows[0]!.id);
    executionIds.push(executionId);
    // El status vive en workout_assignments, no en workout_executions.
    // loadAssignmentDetail trata la sesión como hecha por 'completed'/'partial'.
    await sql`update workout_assignments set status = 'completed' where id = ${assignmentId}`;
    return { executionId, assignmentId };
  }

  async function insertTrace(executionId: number, signal: string, startedAtIso: string, offsets_s: number[], values: number[], source = 'gps') {
    await sql`
      insert into workout_traces (execution_id, signal, source, started_at, offsets_s, values)
      values (${executionId}, ${signal}, ${source}, ${startedAtIso}::timestamptz, ${offsets_s}::int[], ${values}::real[])
    `;
  }

  it('sesión sin traza: available:false, arrays vacíos — nunca un error, nunca un 404', async () => {
    const { executionId } = await makeExecution('2026-08-03T06:00:00Z');
    const execRow = await sql<Array<{ started_at: Date }>>`select started_at from workout_executions where id = ${executionId}`;
    const trace = await loadSessionTrace({ execution_id: executionId, started_at: execRow[0]!.started_at, client: sql });
    expect(trace).toEqual(EMPTY_TRACE);
    expect(trace.available).toBe(false);
    expect(trace.splits).toEqual([]);
    expect(trace.display_curve).toEqual({ pace: null, hr: null });
  });

  it('splits de fidelidad completa aunque display_curve esté reducido — la regla que decide este módulo', async () => {
    const startedAtIso = '2026-08-03T08:00:00Z';
    const { executionId } = await makeExecution(startedAtIso);

    // 5000 m a 2.5 m/s constantes, muestreados cada 2 s → 1001 muestras. Muy
    // por encima del presupuesto de la curva (600): si el código redujera
    // ANTES de derivar, los splits saldrían mal (menos de 5 km, o mal cortados).
    const offsets_s = Array.from({ length: 1001 }, (_, i) => i * 2);
    const distanceValues = offsets_s.map((t) => t * 2.5);
    const speedValues = offsets_s.map(() => 2.5);
    const hrValues = offsets_s.map(() => 150);
    await insertTrace(executionId, 'distance', startedAtIso, offsets_s, distanceValues);
    await insertTrace(executionId, 'speed', startedAtIso, offsets_s, speedValues);
    await insertTrace(executionId, 'hr', startedAtIso, offsets_s, hrValues, 'healthkit');

    const execRow = await sql<Array<{ started_at: Date }>>`select started_at from workout_executions where id = ${executionId}`;
    const trace = await loadSessionTrace({ execution_id: executionId, started_at: execRow[0]!.started_at, client: sql });

    expect(trace.available).toBe(true);
    // Fidelidad completa: 5 km exactos, cada uno con su duración real.
    expect(trace.splits).toHaveLength(5);
    for (const split of trace.splits) {
      expect(split.distance_m).toBe(1000);
      expect(split.duration_s).toBeCloseTo(400, 5); // 1000 m / 2.5 m/s
      expect(split.partial).toBe(false);
    }
    // La curva SÍ está reducida — nunca los 1001 puntos crudos.
    expect(trace.display_curve.pace).not.toBeNull();
    expect(trace.display_curve.hr).not.toBeNull();
    expect(trace.display_curve.pace!.values.length).toBeLessThan(1001);
    expect(trace.display_curve.pace!.values.length).toBeLessThanOrEqual(600);
    expect(trace.display_curve.hr!.values.length).toBeLessThanOrEqual(600);
  });

  it('un hueco real en la traza deja su kilómetro en null — visto por el camino completo, no solo por la función pura', async () => {
    const startedAtIso = '2026-08-03T09:00:00Z';
    const { executionId } = await makeExecution(startedAtIso);

    // Los mismos números que el test puro de km-splits.test.ts para el hueco
    // sin cobertura: km1 limpio (cruce en 97.5s), km2 con un hueco de 130 s
    // en medio (sin cobertura), km3 parcial limpio.
    const offsets_s = [0, 50, 95, 100, 230, 235, 240];
    const values = [0, 500, 980, 1020, 1900, 1950, 2050];
    await insertTrace(executionId, 'distance', startedAtIso, offsets_s, values);

    const execRow = await sql<Array<{ started_at: Date }>>`select started_at from workout_executions where id = ${executionId}`;
    const trace = await loadSessionTrace({ execution_id: executionId, started_at: execRow[0]!.started_at, client: sql });

    expect(trace.available).toBe(true);
    expect(trace.splits).toHaveLength(3);
    expect(trace.splits[0]).toMatchObject({ index: 1, distance_m: 1000 });
    expect(trace.splits[0]!.duration_s).toBeCloseTo(97.5, 1);
    expect(trace.splits[1]).toMatchObject({ index: 2, distance_m: 1000, duration_s: null, avg_pace_s_per_km: null });
    expect(trace.splits[2]).toMatchObject({ index: 3, partial: true, distance_m: 50 });
    expect(trace.splits[2]!.duration_s).toBeCloseTo(2.5, 1);
  });

  it('loadAssignmentDetail expone la traza en execution.trace — el camino real que sirve al atleta y al coach', async () => {
    const startedAtIso = '2026-08-03T10:00:00Z';
    const { executionId, assignmentId } = await makeExecution(startedAtIso);
    const offsets_s = Array.from({ length: 20 }, (_, i) => i * 100); // 0..1900
    const distanceValues = offsets_s.map((t) => t); // 1 m/s constante, 1900 m
    await insertTrace(executionId, 'distance', startedAtIso, offsets_s, distanceValues);

    const detail = await loadAssignmentDetail({ sql, athlete_id: BigInt(fx.athleteId), assignment_id: BigInt(assignmentId) });
    expect(detail).not.toBeNull();
    expect(detail!.execution).not.toBeNull();
    expect(detail!.execution!.trace.available).toBe(true);
    // 1900 m → 1 km completo + una cola parcial de 900 m, nunca escondida ni redondeada.
    expect(detail!.execution!.trace.splits).toHaveLength(2);
    expect(detail!.execution!.trace.splits[1]).toMatchObject({ partial: true, distance_m: 900 });
  });
});
