// GET /api/athlete/running/historial (web/lib/athlete/running/historial.ts)
// contra una base real: el tipo se deriva de la estructura real (el fartlek
// dictado el 10-ago), la importada sin assignment aparece con tipo null, y
// `record` se cruza contra una marca del mismo día.
//
// WRITE, do NOT run here (TCP egress bloqueado); Alex/CI corre esta suite
// contra una rama de Neon de prueba (TEST_DATABASE_URL).

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { buildRunningHistorial } from '@/lib/athlete/running/historial';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeExercise, makeTemplate, type Fixture } from '../utils/db-fixtures';

const iso = (d: Date) => d.toISOString();

describeWithDb('buildRunningHistorial (real DB)', () => {
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
      await sql`delete from athlete_benchmarks where athlete_id = ${fx.athleteId}`;
    });
    return fx;
  }

  test('el fartlek real clasifica, record cruza con la marca del día, y la importada entra sin tipo', async () => {
    const fx = await athlete();
    const exerciseId = await makeExercise({ fx, category: 'cardio', modality: 'run', slug: 'run-fartlek' });
    const templateId = await makeTemplate({ fx, name: 'Fartlek 16x500', format: 'test' });
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
                times: 16,
                elements: [
                  { kind: 'work', measure: { type: 'distance', m: 500 }, target: { type: 'hr_zone', zone: 4 } },
                  {
                    kind: 'recovery',
                    measure: { type: 'duration', s: 60 },
                    target: { type: 'hr_zone', zone: 2 },
                    recovery_mode: 'trote',
                  },
                ],
              },
            ],
          },
        ],
      })})
      returning id::text
    `;
    const templateSegmentId = Number(seg!.id);
    const scheduledFor = '2026-04-06'; // lunes
    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: scheduledFor });

    const started = new Date('2026-04-06T07:00:00.000Z');
    const ended = new Date(started.getTime() + 45 * 60_000);
    const exec = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source, recorded_via
      ) values (
        ${assignmentId}, ${fx.athleteId}, ${iso(started)}::timestamptz, ${iso(ended)}::timestamptz,
        2700, 'gps'::biometric_source, 'live'::execution_recording_method
      )
      returning id::text
    `;
    const executionId = exec[0]!.id;
    await sql`
      insert into segment_executions (
        execution_id, template_segment_id, position, started_at, ended_at, modality,
        distance_meters, avg_pace_s_per_km, avg_hr, source, leg_index, leg_role, leg_phase
      ) values (
        ${executionId}::bigint, ${templateSegmentId}, 0, ${iso(started)}::timestamptz,
        ${iso(ended)}::timestamptz, 'run', 8000, 245, 168, 'gps', 0, 'work', 'main'
      )
    `;

    // La marca del mismo día, calle (run_context='outdoor') — dispara `record`.
    await sql`
      insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, source, run_context, recorded_at)
      values (${fx.athleteId}, 'run_5k', 1150, 'seconds', 'athlete_test', 'outdoor', ${iso(started)}::timestamptz)
    `;

    // Una sesión importada, sin assignment, el mismo mes — sin estructura.
    const importedStarted = new Date('2026-04-08T06:00:00.000Z');
    const importedEnded = new Date(importedStarted.getTime() + 20 * 60_000);
    const importedExec = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source, recorded_via
      ) values (
        null, ${fx.athleteId}, ${iso(importedStarted)}::timestamptz, ${iso(importedEnded)}::timestamptz,
        1200, 'garmin'::biometric_source, 'imported'::execution_recording_method
      )
      returning id::text
    `;
    await sql`
      insert into segment_executions (execution_id, position, started_at, ended_at, modality, distance_meters, source)
      values (${importedExec[0]!.id}::bigint, 0, ${iso(importedStarted)}::timestamptz, ${iso(importedEnded)}::timestamptz, 'run', 3500, 'garmin')
    `;

    const result = await buildRunningHistorial({
      athlete_id: fx.athleteId,
      window: '30d',
      tipo: 'all',
      now: new Date('2026-04-13T12:00:00.000Z'),
      client: sql,
    });

    expect(result.aggregates.salidas).toBe(2);
    expect(result.tipos).toEqual([{ slug: 'fartlek', label_es: 'Fartlek', count: 1 }]);

    const allRows = result.weeks.flatMap((w) => w.rows);
    const fartlekRow = allRows.find((r) => r.execution_id === executionId)!;
    expect(fartlekRow.tipo_slug).toBe('fartlek');
    expect(fartlekRow.dosis_label).toBe('16×500');
    expect(fartlekRow.origen).toBe('app');
    expect(fartlekRow.record).toBe(true);
    expect(fartlekRow.veredicto).toBeNull();

    const importedRow = allRows.find((r) => r.assignment_id === null)!;
    expect(importedRow.tipo_slug).toBeNull();
    expect(importedRow.dosis_label).toBeNull();
    expect(importedRow.origen).toBe('imported');
    expect(importedRow.record).toBe(false);

    // Filtrar por tipo recalcula agregados sobre lo filtrado, sin perder el chip.
    const filtered = await buildRunningHistorial({
      athlete_id: fx.athleteId,
      window: '30d',
      tipo: 'fartlek',
      now: new Date('2026-04-13T12:00:00.000Z'),
      client: sql,
    });
    expect(filtered.aggregates.salidas).toBe(1);
    expect(filtered.tipos).toEqual([{ slug: 'fartlek', label_es: 'Fartlek', count: 1 }]);
  });
});
