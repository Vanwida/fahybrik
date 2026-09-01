// El cargador compartido de sesiones de carrera (web/lib/athlete/running/
// sessions.ts) contra una base real: dos cifras de metros (total vs trabajo),
// la importada sin assignment, el desnivel del encabezado y el contexto
// calle/cinta.
//
// WRITE, do NOT run here (TCP egress bloqueado); Alex/CI corre esta suite
// contra una rama de Neon de prueba (TEST_DATABASE_URL) — mismo patrón que
// `web/tests/import/fit-materialize.db.test.ts`.

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { loadRunSessionRows } from '@/lib/athlete/running/sessions';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeExercise, makeTemplate, type Fixture } from '../utils/db-fixtures';

const iso = (d: Date) => d.toISOString();

describeWithDb('loadRunSessionRows (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  async function athlete(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    cleanups.push(async () => {
      await sql`delete from segment_executions where execution_id in (
        select id from workout_executions where athlete_id = ${fx.athleteId}
      )`;
      await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
    });
    return fx;
  }

  test('sesión viva con serie: km TOTAL incluye la recuperación, ritmo/FC/cadencia ponderan solo el trabajo', async () => {
    const fx = await athlete();
    const exerciseId = await makeExercise({ fx, category: 'cardio', modality: 'run', slug: 'run-generic' });
    const templateId = await makeTemplate({ fx, name: 'Series 6x800', format: 'test' });
    const [seg] = await sql<Array<{ id: string }>>`
      insert into template_segments (template_id, position, exercise_id, prescription_json)
      values (${templateId}, 0, ${exerciseId}, ${sql.json({
        scheme: 'intervals',
        modality: 'run',
        structure: [
          {
            role: 'main',
            elements: [
              {
                times: 6,
                elements: [
                  { kind: 'work', measure: { type: 'distance', m: 800 }, target: { type: 'pace_zone', zone: 4 } },
                  { kind: 'recovery', measure: { type: 'duration', s: 90 }, target: null, recovery_mode: 'trote' },
                ],
              },
            ],
          },
        ],
      })})
      returning id::text
    `;
    const templateSegmentId = Number(seg!.id);

    const scheduledFor = '2026-03-10';
    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: scheduledFor });

    const started = new Date('2026-03-10T07:00:00.000Z');
    const ended = new Date(started.getTime() + 30 * 60_000);
    const exec = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
        source, recorded_via, elevation_gain_m
      ) values (
        ${assignmentId}, ${fx.athleteId}, ${iso(started)}::timestamptz, ${iso(ended)}::timestamptz,
        1800, 'gps'::biometric_source, 'live'::execution_recording_method, 24.5
      )
      returning id::text
    `;
    const executionId = exec[0]!.id;

    // 6×800 de trabajo (4800 m) + 6×~150 m de trote de vuelta ≈ 900 m — dos
    // filas resumen (no las 12 reales) porque el cargador solo necesita sumar.
    await sql`
      insert into segment_executions (
        execution_id, template_segment_id, position, started_at, ended_at, modality,
        distance_meters, avg_pace_s_per_km, avg_hr, run_cadence_spm, source,
        leg_index, leg_role, leg_phase
      ) values (
        ${executionId}::bigint, ${templateSegmentId}, 0, ${iso(started)}::timestamptz,
        ${iso(new Date(started.getTime() + 20 * 60_000))}::timestamptz, 'run',
        4800, 258, 172, 176, 'gps', 0, 'work', 'main'
      )
    `;
    await sql`
      insert into segment_executions (
        execution_id, template_segment_id, position, started_at, ended_at, modality,
        distance_meters, avg_pace_s_per_km, avg_hr, run_cadence_spm, source,
        leg_index, leg_role, leg_phase
      ) values (
        ${executionId}::bigint, ${templateSegmentId}, 1, ${iso(new Date(started.getTime() + 20 * 60_000))}::timestamptz,
        ${iso(ended)}::timestamptz, 'run',
        900, 600, 130, 160, 'gps', 1, 'recovery', 'main'
      )
    `;

    const rows = await loadRunSessionRows(sql, fx.athleteId, new Date('2026-03-01'), new Date('2026-03-20'));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.execution_id).toBe(executionId);
    expect(row.assignment_id).toBe(String(assignmentId));
    expect(row.origen).toBe('app');
    expect(row.contexto).toBe('street');
    // Total: 4800 + 900 = 5700 m = 5.7 km. Trabajo: solo los 4800 m.
    expect(row.km).toBeCloseTo(5.7, 2);
    expect(row.work_km).toBeCloseTo(4.8, 2);
    // Ritmo/FC/cadencia son el valor del ÚNICO tramo de trabajo — el trote no
    // los arrastra hacia abajo.
    expect(row.pace_s_per_km).toBeCloseTo(258, 0);
    expect(row.hr_avg).toBe(172);
    expect(row.cadence_spm).toBe(176);
    expect(row.elevation_gain_m).toBeCloseTo(24.5, 1);
    expect(row.seconds).toBe(1800);
    expect(row.prescription_json).not.toBeNull();
  });

  test('sesión importada (sin assignment, cinta): origen=imported, contexto=treadmill', async () => {
    const fx = await athlete();
    const started = new Date('2026-03-11T06:00:00.000Z');
    const ended = new Date(started.getTime() + 25 * 60_000);
    const exec = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
        source, recorded_via
      ) values (
        null, ${fx.athleteId}, ${iso(started)}::timestamptz, ${iso(ended)}::timestamptz,
        1500, 'garmin'::biometric_source, 'imported'::execution_recording_method
      )
      returning id::text
    `;
    const executionId = exec[0]!.id;
    await sql`
      insert into segment_executions (execution_id, position, started_at, ended_at, modality, distance_meters, source)
      values (${executionId}::bigint, 0, ${iso(started)}::timestamptz, ${iso(ended)}::timestamptz, 'run', 5000, 'treadmill')
    `;

    const rows = await loadRunSessionRows(sql, fx.athleteId, new Date('2026-03-01'), new Date('2026-03-20'));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.assignment_id).toBeNull();
    expect(row.origen).toBe('imported');
    expect(row.contexto).toBe('treadmill');
    expect(row.prescription_json).toBeNull();
    expect(row.km).toBeCloseTo(5, 2);
  });
});
