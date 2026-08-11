import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { computeMeasuredHeader } from '@/lib/execution/measured-header';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

// Integración real (no mock): traza en `workout_traces` + tramo en
// `segment_executions` → `computeMeasuredHeader` → columnas de
// `workout_executions` escritas. La MATEMÁTICA de cada función pura ya está
// cubierta a fondo en tests/running/{decoupling,elevation,hr-recovery}.test.ts
// (puros, sin DB) — esta suite verifica el CABLEADO: que se lee lo que hay que
// leer, en el eje correcto, y se escribe donde toca.

const SIGNAL_HR = 'hr';
const SIGNAL_SPEED = 'speed';
const SIGNAL_ALTITUDE = 'altitude';

describeWithDb('computeMeasuredHeader (real DB)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  const executionIds: number[] = [];

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
  });

  afterEach(async () => {
    for (const id of executionIds.splice(0)) {
      await sql`delete from segment_executions where execution_id = ${id}`;
      await sql`delete from workout_traces where execution_id = ${id}`;
      await sql`delete from workout_executions where id = ${id}`;
    }
  });

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  async function makeExecution(startedAtIso: string): Promise<number> {
    const templateId = await makeTemplate({ fx, name: 'Rodaje' });
    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: startedAtIso.slice(0, 10) });
    const rows = await sql<Array<{ id: string }>>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at)
      values (${assignmentId}, ${fx.athleteId}, ${startedAtIso}::timestamptz, ${startedAtIso}::timestamptz + interval '40 minutes')
      returning id::text
    `;
    const id = Number(rows[0]!.id);
    executionIds.push(id);
    return id;
  }

  async function insertTrace(
    executionId: number,
    signal: string,
    startedAtIso: string,
    offsets_s: number[],
    values: number[],
    // 'gps' mide velocidad/posición, no pulso — `hrTraceFidelity('gps') === 0`
    // (channel.ts), así que una traza `hr` con esa fuente NUNCA gana en
    // `bestHrTrace` (es la fidelidad correcta: el propio comentario del
    // fichero lo llama "una traza que no debería existir"). Las llamadas para
    // `signal: 'hr'` pasan una fuente que sí mide pulso.
    source: string = 'gps',
  ): Promise<void> {
    await sql`
      insert into workout_traces (execution_id, signal, source, started_at, offsets_s, values)
      values (${executionId}, ${signal}, ${source}, ${startedAtIso}::timestamptz, ${offsets_s}::int[], ${values}::real[])
    `;
  }

  /** Rango denso [start,end] a `step` segundos, todo al mismo valor — igual que
   *  el helper `dense()` de los tests puros, reimplementado aquí para no
   *  acoplar una suite con DB a los módulos de dominio. */
  function dense(start: number, end: number, step: number, value: number): { offsets_s: number[]; values: number[] } {
    const offsets_s: number[] = [];
    const values: number[] = [];
    for (let t = start; t <= end; t += step) {
      offsets_s.push(t);
      values.push(value);
    }
    return { offsets_s, values };
  }

  it('lee traza + tramo, calcula las tres derivadas y las escribe en workout_executions', async () => {
    const startedAtIso = '2026-08-01T06:00:00Z';
    const executionId = await makeExecution(startedAtIso);

    // Un tramo main sostenido de 1500 s [600,2100] — por encima del mínimo.
    await sql`
      insert into segment_executions (
        execution_id, position, started_at, ended_at, modality,
        leg_index, leg_role, leg_phase
      ) values (
        ${executionId}, 0,
        ${startedAtIso}::timestamptz + interval '600 seconds',
        ${startedAtIso}::timestamptz + interval '2100 seconds',
        'run', 0, 'work', 'main'
      )
    `;

    // HR: 150 lpm la primera mitad, 158 la segunda, más una cola de
    // recuperación hasta el segundo 2165 (cubre el umbral de 58 s).
    const hr1 = dense(600, 1340, 20, 150);
    const hr2 = dense(1360, 2100, 20, 158);
    const hrRecoveryTail = dense(2158, 2165, 4, 135);
    await insertTrace(
      executionId,
      SIGNAL_HR,
      startedAtIso,
      [...hr1.offsets_s, ...hr2.offsets_s, ...hrRecoveryTail.offsets_s],
      [...hr1.values, ...hr2.values, ...hrRecoveryTail.values],
      'healthkit',
    );

    // Speed: 3.2 m/s primera mitad, 2.9 m/s segunda — EF cae, deriva positiva.
    const speed1 = dense(600, 1340, 20, 3.2);
    const speed2 = dense(1360, 2100, 20, 2.9);
    await insertTrace(executionId, SIGNAL_SPEED, startedAtIso, [...speed1.offsets_s, ...speed2.offsets_s], [
      ...speed1.values, ...speed2.values,
    ]);

    // Altitud llana con ruido de ±1 m (bajo el umbral de 3 m) toda la sesión.
    const altOffsets = Array.from({ length: 20 }, (_, i) => i * 100);
    const altValues = altOffsets.map((_, i) => (i % 2 === 0 ? 50 : 51));
    await insertTrace(executionId, SIGNAL_ALTITUDE, startedAtIso, altOffsets, altValues);

    const result = await computeMeasuredHeader({ execution_id: executionId, client: sql });
    expect(result.written).toBe(true);
    expect(result.decoupling_pct).not.toBeNull();
    expect(result.decoupling_pct!).toBeGreaterThan(10); // ~13.97 %, con margen
    expect(result.decoupling_pct!).toBeLessThan(18);
    expect(result.elevation_gain_m).toBe(0);
    expect(result.elevation_loss_m).toBe(0);
    expect(result.hr_recovery_60_bpm).toBe(23); // 158 − 135

    const rows = await sql<
      Array<{
        decoupling_pct: string | null;
        elevation_gain_m: string | null;
        elevation_loss_m: string | null;
        hr_recovery_60_bpm: number | null;
      }>
    >`
      select decoupling_pct, elevation_gain_m, elevation_loss_m, hr_recovery_60_bpm
      from workout_executions where id = ${executionId}
    `;
    const row = rows[0]!;
    expect(Number(row.decoupling_pct)).toBeCloseTo(result.decoupling_pct!, 1);
    expect(Number(row.elevation_gain_m)).toBe(0);
    expect(Number(row.elevation_loss_m)).toBe(0);
    expect(row.hr_recovery_60_bpm).toBe(23);
  });

  it('una sesión de series (2+ tramos main) escribe decoupling_pct null, sin tocar elevación ni recuperación', async () => {
    const startedAtIso = '2026-08-01T07:00:00Z';
    const executionId = await makeExecution(startedAtIso);

    await sql`
      insert into segment_executions (execution_id, position, started_at, ended_at, modality, leg_index, leg_role, leg_phase)
      values
        (${executionId}, 0, ${startedAtIso}::timestamptz + interval '0 seconds', ${startedAtIso}::timestamptz + interval '200 seconds', 'run', 0, 'work', 'main'),
        (${executionId}, 1, ${startedAtIso}::timestamptz + interval '200 seconds', ${startedAtIso}::timestamptz + interval '260 seconds', 'run', 1, 'recovery', 'main'),
        (${executionId}, 2, ${startedAtIso}::timestamptz + interval '260 seconds', ${startedAtIso}::timestamptz + interval '460 seconds', 'run', 2, 'work', 'main')
    `;
    const hr = dense(0, 460, 10, 150);
    const speed = dense(0, 460, 10, 3);
    // Fuente con fidelidad de pulso real (no 'gps') — el punto de este test es
    // probar la guarda de "sesión de series", no una traza de FC descartada
    // por su fuente antes de llegar a esa guarda.
    await insertTrace(executionId, SIGNAL_HR, startedAtIso, hr.offsets_s, hr.values, 'healthkit');
    await insertTrace(executionId, SIGNAL_SPEED, startedAtIso, speed.offsets_s, speed.values);

    const result = await computeMeasuredHeader({ execution_id: executionId, client: sql });
    expect(result.written).toBe(true);
    expect(result.decoupling_pct).toBeNull();
  });

  it('sin ninguna traza guardada, no escribe nada (written: false)', async () => {
    const executionId = await makeExecution('2026-08-01T08:00:00Z');
    const result = await computeMeasuredHeader({ execution_id: executionId, client: sql });
    expect(result.written).toBe(false);
    expect(result.decoupling_pct).toBeNull();
  });

  it('idempotente: recalcular la misma traza da la misma cabecera', async () => {
    const startedAtIso = '2026-08-01T09:00:00Z';
    const executionId = await makeExecution(startedAtIso);
    const alt = dense(0, 600, 60, 50);
    await insertTrace(executionId, SIGNAL_ALTITUDE, startedAtIso, alt.offsets_s, alt.values);

    const first = await computeMeasuredHeader({ execution_id: executionId, client: sql });
    const second = await computeMeasuredHeader({ execution_id: executionId, client: sql });
    expect(second).toEqual(first);
  });
});
