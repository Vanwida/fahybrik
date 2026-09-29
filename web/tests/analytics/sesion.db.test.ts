/**
 * El detalle de sesión de las analíticas contra una base REAL (rama Neon
 * desechable; se salta, nunca en verde falso, sin TEST_DATABASE_URL): tramo a
 * tramo lo prescrito, lo hecho, sus zonas y su carga con su peldaño, la traza
 * con las bandas de pulso del coach, la carga frente a la planificada, la
 * paridad atleta ↔ coach (A1) y el ámbito (una sesión ajena no existe).
 */

import { afterAll, beforeAll, expect, test } from 'vitest';
import { cargarSesion } from '@/lib/analytics/sesion';
import { desdeSesionDeAtleta, verificarAtletaDelCoach } from '@/lib/analytics/atleta-verificado';
import { prescriptionToText } from '@fahybrid/shared/domain/prescription/to-text';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { closeTestSql, describeWithDb, getTestSql, settleCleanup } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeExercise, makeTemplate, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2026-06-15T10:00:00.000Z');

const CORRER: Prescription = { scheme: 'steady', modality: 'run', total_s: 1800, target: { kind: 'hr_zone', value: 2 } } as Prescription;
const SENTADILLA: Prescription = {
  scheme: 'sets',
  modality: 'strength',
  sets: [{ measure: { kind: 'reps', value: 5 }, target: { kind: 'rpe', value: 8 } }],
} as Prescription;

describeWithDb('detalle de sesión (base real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let otro: Fixture;
  let ejecucion: number;
  let ajena: number;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    otro = await makeCoachAndAthlete(sql);
    await sql`update athletes set timezone = 'Europe/Madrid', max_hr_bpm = 190 where id = ${fx.athleteId}`;
    const correr = await makeExercise({ fx, name: 'Carrera continua', category: 'cardio', modality: 'run' });
    const sentadilla = await makeExercise({ fx, name: 'Sentadilla', category: 'strength', modality: 'strength' });
    const plantilla = await makeTemplate({ fx, name: 'Rodaje + fuerza', format: 'intervals' });
    await sql`
      insert into template_segments (template_id, position, exercise_id, block_position, block_format, prescription_json)
      values (${plantilla}, 0, ${correr}, 0, 'steady', ${sql.json(CORRER)}), (${plantilla}, 1, ${sentadilla}, 1, 'sets', ${sql.json(SENTADILLA)})
    `;
    const asig = await makeAssignment({ fx, templateId: plantilla, scheduledForIso: '2026-06-10', status: 'completed' });
    const inicio = '2026-06-10T18:00:00+02:00';
    const [we] = await sql<Array<{ id: string }>>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, perceived_exertion, source)
      values (${asig}, ${fx.athleteId}, ${inicio}::timestamptz, ${inicio}::timestamptz + interval '45 minutes', 2700, 7, 'manual')
      returning id::text as id
    `;
    ejecucion = Number(we!.id);
    const [run] = await sql<Array<{ id: string }>>`
      insert into segment_executions (execution_id, position, started_at, ended_at, modality, exercise_id, avg_hr, avg_pace_s_per_km, distance_meters, prescription_snapshot)
      values (${ejecucion}, 0, ${inicio}::timestamptz, ${inicio}::timestamptz + interval '30 minutes', 'run', ${correr}, 150, 300, 6000, ${sql.json(CORRER)})
      returning id::text as id
    `;
    const [sq] = await sql<Array<{ id: string }>>`
      insert into segment_executions (execution_id, position, started_at, ended_at, modality, exercise_id, reps_completed, weight_used_kg, prescription_snapshot)
      values (${ejecucion}, 1, ${inicio}::timestamptz + interval '32 minutes', ${inicio}::timestamptz + interval '42 minutes', 'strength', ${sentadilla}, 15, 100, ${sql.json(SENTADILLA)})
      returning id::text as id
    `;
    await sql`
      insert into segment_zone_seconds (segment_execution_id, z1_s, z2_s, z3_s, z4_s, z5_s, no_hr_s, hr_origin, computed_with_anchor, computed_with_lthr_bpm)
      values (${Number(run!.id)}, 0, 1500, 300, 0, 0, 0, 'trace', 'from_max_hr', 167)
    `;
    await sql`
      insert into set_executions (segment_execution_id, set_index, reps_actual, load_actual_kg, rpe, status)
      values (${Number(sq!.id)}, 1, 5, 100, 8, 'done'), (${Number(sq!.id)}, 2, 5, 100, 8, 'done'), (${Number(sq!.id)}, 3, 5, 100, 9, 'done')
    `;
    const offsets = Array.from({ length: 361 }, (_, i) => i * 5);
    await sql`
      insert into workout_traces (execution_id, signal, source, started_at, offsets_s, values)
      values (${ejecucion}, 'hr', 'healthkit', ${inicio}::timestamptz, ${offsets}, ${offsets.map(() => 150)})
    `;

    // Una sesión del OTRO atleta: no existe para éste.
    const [x] = await sql<Array<{ id: string }>>`
      insert into workout_executions (athlete_id, started_at, ended_at, total_duration_seconds, source)
      values (${otro.athleteId}, ${inicio}::timestamptz, ${inicio}::timestamptz + interval '20 minutes', 1200, 'manual')
      returning id::text as id
    `;
    ajena = Number(x!.id);
  }, 120_000);

  afterAll(async () => {
    await settleCleanup(async () => {
      for (const a of [fx.athleteId, otro.athleteId]) {
        await sql`delete from segment_zone_seconds where segment_execution_id in (select se.id from segment_executions se join workout_executions we on we.id = se.execution_id where we.athlete_id = ${a})`;
        await sql`delete from set_executions where segment_execution_id in (select se.id from segment_executions se join workout_executions we on we.id = se.execution_id where we.athlete_id = ${a})`;
        await sql`delete from segment_executions where execution_id in (select id from workout_executions where athlete_id = ${a})`;
        await sql`delete from workout_executions where athlete_id = ${a}`;
      }
      await fx.cleanup();
      await otro.cleanup();
    });
    await closeTestSql();
  }, 120_000);

  test('tramo a tramo: prescrito, hecho, zonas y carga con su peldaño; la traza con las bandas del coach', async () => {
    const d = await cargarSesion({ atleta: desdeSesionDeAtleta({ athlete_id: fx.athleteId }), execution_id: ejecucion, now: NOW, client: sql });
    expect(d).not.toBeNull();
    expect(d!).toMatchObject({ dia: '2026-06-10', titulo_es: 'Rodaje + fuerza', rpe: 7, pendientes: ['cumplimiento'] });
    expect(d!.tramos).toHaveLength(2);

    const [run, sq] = d!.tramos;
    expect(run).toMatchObject({ posicion: 0, familia: 'correr', ejercicio_es: 'Carrera continua', segundos: 1800 });
    expect(run!.prescrito?.texto_es).toBe(prescriptionToText(CORRER));
    expect(run!.hecho).toMatchObject({ distance_meters: 6000, avg_hr: 150 });
    expect(run!.zonas).toEqual({ por_zona: { z1: 0, z2: 1500, z3: 300, z4: 0, z5: 0 }, sin_pulso_s: 0, ancla: 'estimada' });
    expect(run!.carga).toMatchObject({ peldano: 'pulso', ancla: 'estimada', segundos: 1800 });

    expect(sq).toMatchObject({ posicion: 1, familia: 'fuerza' });
    expect(sq!.hecho?.sets.map((s) => s.rpe)).toEqual([8, 8, 9]);
    expect(sq!.carga).toMatchObject({ peldano: 'esfuerzo', ancla: null, segundos: 600 });
    expect(d!.resto?.segundos).toBe(300);

    expect(d!.traza.disponible).toBe(true);
    expect(d!.traza.pulso?.values.length).toBeGreaterThan(0);
    expect(d!.traza.referencias_pulso?.map((r) => r.etiqueta_es)).toEqual(['Z2', 'Z3', 'Z4', 'Z5']);

    const carga = d!.lecturas.find((l) => l.id === 'sesion.carga')!;
    expect(carga.estado).toBe('medida');
    const suma = [run!.carga!.tss ?? 0, sq!.carga!.tss ?? 0, d!.resto?.tss ?? 0].reduce((a, b) => a + b, 0);
    expect(carga.dato!.valor).toBeCloseTo(suma, 10);
    // La sentadilla del plan va por repeticiones y no dice cuánto dura: su carga
    // planificada no se sabe, la de la sesión es un suelo, y un suelo no se compara.
    expect(carga.dato!.referencia).toBeNull();
    expect(d!.lecturas.find((l) => l.id === 'sesion.duracion')!.dato!.referencia).toBeNull();
  });

  test('un cálculo, dos pintores: el coach ve exactamente lo mismo (A1)', async () => {
    const comoAtleta = await cargarSesion({ atleta: desdeSesionDeAtleta({ athlete_id: fx.athleteId }), execution_id: ejecucion, now: NOW, client: sql });
    const coach = await verificarAtletaDelCoach(fx.athleteId, fx.coachId, sql);
    const comoCoach = await cargarSesion({ atleta: coach!, execution_id: ejecucion, now: NOW, client: sql });
    expect(comoCoach).toEqual(comoAtleta);
  });

  test('el ámbito: la sesión de otro atleta no existe, y el coach de otro club no ve a éste', async () => {
    expect(await cargarSesion({ atleta: desdeSesionDeAtleta({ athlete_id: fx.athleteId }), execution_id: ajena, now: NOW, client: sql })).toBeNull();
    expect(await verificarAtletaDelCoach(fx.athleteId, otro.coachId, sql)).toBeNull();
  });
});
