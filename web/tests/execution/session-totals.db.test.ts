import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { computeSessionTotals } from '@/lib/execution/session-totals';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

// Integración real (no mock): tramos en `segment_executions` + traza opcional en
// `workout_traces` → `computeSessionTotals` → columnas de `workout_executions`
// escritas. Cubre las tres reglas de la card 126 (FC media/máxima, distancia
// total, calorías) contra una base real, incluida la comprobación en ROJO de
// que romper la regla de distancia (sumar entre modalidades) hace caer el test
// correspondiente — hecho a mano en el editor durante el desarrollo, no forma
// parte de esta suite.

describeWithDb('computeSessionTotals (real DB)', () => {
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

  async function makeExecution(startedAtIso: string, durationMinutes = 40): Promise<number> {
    const templateId = await makeTemplate({ fx, name: 'Sesión totales' });
    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: startedAtIso.slice(0, 10) });
    const rows = await sql<Array<{ id: string }>>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at)
      values (
        ${assignmentId}, ${fx.athleteId}, ${startedAtIso}::timestamptz,
        ${startedAtIso}::timestamptz + (${durationMinutes} || ' minutes')::interval
      )
      returning id::text
    `;
    const id = Number(rows[0]!.id);
    executionIds.push(id);
    return id;
  }

  async function insertSegment(params: {
    executionId: number;
    position: number;
    startedAtIso: string;
    durationSeconds: number;
    modality: string;
    avgHr?: number | null;
    maxHr?: number | null;
    distanceMeters?: number | null;
    calories?: number | null;
  }): Promise<void> {
    await sql`
      insert into segment_executions (
        execution_id, position, started_at, ended_at, modality,
        avg_hr, max_hr, distance_meters, calories
      ) values (
        ${params.executionId}, ${params.position},
        ${params.startedAtIso}::timestamptz,
        ${params.startedAtIso}::timestamptz + (${params.durationSeconds} || ' seconds')::interval,
        ${params.modality},
        ${params.avgHr ?? null}, ${params.maxHr ?? null},
        ${params.distanceMeters ?? null}, ${params.calories ?? null}
      )
    `;
  }

  async function insertHrTrace(
    executionId: number,
    startedAtIso: string,
    values: number[],
    source = 'healthkit',
  ): Promise<void> {
    const offsets_s = values.map((_, i) => i * 10);
    await sql`
      insert into workout_traces (execution_id, signal, source, started_at, offsets_s, values)
      values (${executionId}, 'hr', ${source}, ${startedAtIso}::timestamptz, ${offsets_s}::int[], ${values}::real[])
    `;
  }

  // ── Regla 1 · la traza manda cuando existe ───────────────────────────────
  it('con traza de pulso: la FC media y máxima salen de la traza, no de los tramos', async () => {
    const startedAtIso = '2026-08-20T06:00:00Z';
    const executionId = await makeExecution(startedAtIso);

    // El tramo dice 120/130 — si el cálculo lo usara, se notaría enseguida.
    await insertSegment({
      executionId,
      position: 0,
      startedAtIso,
      durationSeconds: 1200,
      modality: 'run',
      avgHr: 120,
      maxHr: 130,
    });
    // La traza real: 140,150,160 → media 150, máximo 160.
    await insertHrTrace(executionId, startedAtIso, [140, 150, 160]);

    const result = await computeSessionTotals({ execution_id: executionId, client: sql });
    expect(result.written).toBe(true);
    expect(result.avg_hr).toBe(150);
    expect(result.max_hr).toBe(160);
  });

  // ── Regla 1 · fallback a tramos, PONDERADO por duración ──────────────────
  it('sin traza: la FC media de los tramos se pondera por duración, no es la media simple', async () => {
    const startedAtIso = '2026-08-20T07:00:00Z';
    const executionId = await makeExecution(startedAtIso, 60);

    // Duraciones muy distintas a propósito: un tramo de 55 min a 140 lpm y uno
    // de 5 min a 170 lpm. Media simple = 155. Ponderada por duración ≈ 142.5.
    await insertSegment({
      executionId,
      position: 0,
      startedAtIso,
      durationSeconds: 3300, // 55 min
      modality: 'run',
      avgHr: 140,
      maxHr: 148,
    });
    await insertSegment({
      executionId,
      position: 1,
      startedAtIso: '2026-08-20T07:55:00Z',
      durationSeconds: 300, // 5 min
      modality: 'run',
      avgHr: 170,
      maxHr: 175,
    });

    const result = await computeSessionTotals({ execution_id: executionId, client: sql });
    expect(result.written).toBe(true);
    // Ponderada: (140*3300 + 170*300) / 3600 = 142.5 → redondeado 143 o 142.
    expect(result.avg_hr).toBeGreaterThanOrEqual(142);
    expect(result.avg_hr).toBeLessThanOrEqual(143);
    expect(result.avg_hr).not.toBe(155); // la media SIMPLE habría dado esto
    expect(result.max_hr).toBe(175); // el mayor max_hr de tramo, no el del último
  });

  // ── Regla 1 · sin ningún pulso, NULL — nunca cero ────────────────────────
  it('sin traza ni tramo con pulso: avg_hr y max_hr quedan NULL, nunca 0', async () => {
    const startedAtIso = '2026-08-20T08:00:00Z';
    const executionId = await makeExecution(startedAtIso);
    await insertSegment({
      executionId,
      position: 0,
      startedAtIso,
      durationSeconds: 600,
      modality: 'strength',
    });

    const result = await computeSessionTotals({ execution_id: executionId, client: sql });
    expect(result.written).toBe(true);
    expect(result.avg_hr).toBeNull();
    expect(result.max_hr).toBeNull();
  });

  // ── Regla 1 · banda fisiológica sobre la traza cruda ─────────────────────
  it('un pico de traza fuera de banda (30..260) no se cuela: max_hr sale NULL', async () => {
    const startedAtIso = '2026-08-20T08:30:00Z';
    const executionId = await makeExecution(startedAtIso);
    // Un artefacto de 300 lpm mezclado con lecturas normales.
    await insertHrTrace(executionId, startedAtIso, [140, 150, 300]);

    const result = await computeSessionTotals({ execution_id: executionId, client: sql });
    // La MEDIA (140+150+300)/3 = ~196.7 sigue en banda; el MÁXIMO (300) no.
    expect(result.avg_hr).not.toBeNull();
    expect(result.max_hr).toBeNull();
  });

  // ── Regla 2 · una sola modalidad midió distancia ─────────────────────────
  it('solo correr midió distancia: total_distance_m es la suma de sus tramos', async () => {
    const startedAtIso = '2026-08-20T09:00:00Z';
    const executionId = await makeExecution(startedAtIso);
    await insertSegment({
      executionId,
      position: 0,
      startedAtIso,
      durationSeconds: 600,
      modality: 'run',
      distanceMeters: 2000,
    });
    await insertSegment({
      executionId,
      position: 1,
      startedAtIso: '2026-08-20T09:10:00Z',
      durationSeconds: 300,
      modality: 'run',
      distanceMeters: 1000,
    });
    // Un tramo de fuerza SIN distancia no afecta a la modalidad ganadora.
    await insertSegment({
      executionId,
      position: 2,
      startedAtIso: '2026-08-20T09:15:00Z',
      durationSeconds: 600,
      modality: 'strength',
    });

    const result = await computeSessionTotals({ execution_id: executionId, client: sql });
    expect(result.total_distance_m).toBe(3000);
  });

  // ── Regla 2 · dos modalidades midieron distancia → NULL a propósito ──────
  it('correr Y remo midieron distancia: total_distance_m queda NULL', async () => {
    const startedAtIso = '2026-08-20T10:00:00Z';
    const executionId = await makeExecution(startedAtIso);
    await insertSegment({
      executionId,
      position: 0,
      startedAtIso,
      durationSeconds: 600,
      modality: 'run',
      distanceMeters: 2000,
    });
    await insertSegment({
      executionId,
      position: 1,
      startedAtIso: '2026-08-20T10:10:00Z',
      durationSeconds: 300,
      modality: 'row',
      distanceMeters: 500,
    });

    const result = await computeSessionTotals({ execution_id: executionId, client: sql });
    expect(result.total_distance_m).toBeNull();
  });

  // ── Regla 3 · calorías ────────────────────────────────────────────────────
  it('calorías: suma de los tramos que las traen; NULL si ninguno las trae', async () => {
    const startedAtIso = '2026-08-20T11:00:00Z';
    const executionId = await makeExecution(startedAtIso);
    await insertSegment({
      executionId,
      position: 0,
      startedAtIso,
      durationSeconds: 600,
      modality: 'row',
      calories: 120,
    });
    await insertSegment({
      executionId,
      position: 1,
      startedAtIso: '2026-08-20T11:10:00Z',
      durationSeconds: 300,
      modality: 'strength', // sin calorías — no cuenta como "ninguno las trae"
    });
    await insertSegment({
      executionId,
      position: 2,
      startedAtIso: '2026-08-20T11:15:00Z',
      durationSeconds: 300,
      modality: 'run',
      calories: 80,
    });

    const result = await computeSessionTotals({ execution_id: executionId, client: sql });
    expect(result.total_calories).toBe(200);
  });

  it('ningún tramo trae calorías: total_calories queda NULL, no 0', async () => {
    const startedAtIso = '2026-08-20T12:00:00Z';
    const executionId = await makeExecution(startedAtIso);
    await insertSegment({ executionId, position: 0, startedAtIso, durationSeconds: 600, modality: 'strength' });

    const result = await computeSessionTotals({ execution_id: executionId, client: sql });
    expect(result.total_calories).toBeNull();
  });

  // ── Sin ninguna evidencia ─────────────────────────────────────────────────
  it('sin tramos ni trazas: written false, nada que recalcular', async () => {
    const executionId = await makeExecution('2026-08-20T13:00:00Z');
    const result = await computeSessionTotals({ execution_id: executionId, client: sql });
    expect(result.written).toBe(false);
  });

  // ── Idempotencia ──────────────────────────────────────────────────────────
  it('idempotente: recalcular la misma evidencia da el mismo resultado, no lo acumula', async () => {
    const startedAtIso = '2026-08-20T14:00:00Z';
    const executionId = await makeExecution(startedAtIso);
    await insertSegment({
      executionId,
      position: 0,
      startedAtIso,
      durationSeconds: 600,
      modality: 'run',
      avgHr: 140,
      maxHr: 150,
      distanceMeters: 2000,
      calories: 100,
    });

    const first = await computeSessionTotals({ execution_id: executionId, client: sql });
    const second = await computeSessionTotals({ execution_id: executionId, client: sql });
    const third = await computeSessionTotals({ execution_id: executionId, client: sql });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(first.total_distance_m).toBe(2000); // no se dobla ni se triplica
    expect(first.total_calories).toBe(100);
  });
});
