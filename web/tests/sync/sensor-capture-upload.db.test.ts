/**
 * Dónde subir el archivo del movimiento: la app manda la asignación (lo único que
 * sabe el reloj) y el servidor resuelve la ejecución — solo la del atleta, y null
 * mientras el entreno no ha llegado (la app espera y vuelve a probar).
 */
import { afterAll, expect, test } from 'vitest';

import {
  resolveSensorCaptureExecution,
  SENSOR_CAPTURE_MAX_BYTES,
  sensorCaptureUploadUrlSchema,
} from '@/lib/sync/ingest-sensor-capture';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate } from '../utils/db-fixtures';

test('pide la asignación o la ejecución, y cabe una sesión larga', () => {
  expect(sensorCaptureUploadUrlSchema.safeParse({ size_bytes: 10 }).success).toBe(false);
  expect(sensorCaptureUploadUrlSchema.safeParse({ assignment_id: 7, size_bytes: 10 }).success).toBe(true);
  expect(sensorCaptureUploadUrlSchema.safeParse({ execution_id: 7, size_bytes: 10 }).success).toBe(true);
  // 900 B/s (50 Hz × 9 canales × int16): dos horas y media tienen que caber.
  expect(
    sensorCaptureUploadUrlSchema.safeParse({
      assignment_id: 7,
      size_bytes: 900 * 9000,
    }).success,
  ).toBe(true);
  expect(
    sensorCaptureUploadUrlSchema.safeParse({
      assignment_id: 7,
      size_bytes: SENSOR_CAPTURE_MAX_BYTES + 1,
    }).success,
  ).toBe(false);
});

describeWithDb('sensor capture upload target', () => {
  const sql = getTestSql();
  afterAll(async () => {
    await closeTestSql();
  });

  test('resuelve la ejecución por la asignación, solo la del atleta', async () => {
    const A = await makeCoachAndAthlete(sql);
    const B = await makeCoachAndAthlete(sql);
    try {
      const templateId = await makeTemplate({ fx: A, name: 'Sensor' });
      const assignmentId = await makeAssignment({
        fx: A,
        templateId,
        scheduledForIso: '2026-09-20',
      });

      // El entreno aún viaja en la cola del móvil: todavía no.
      expect(
        await resolveSensorCaptureExecution({
          athleteId: A.athleteId,
          target: { assignment_id: assignmentId },
          client: sql,
        }),
      ).toBeNull();

      const exec = await sql<Array<{ id: string }>>`
        insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source)
        values (${assignmentId}, ${A.athleteId}, '2026-09-20T08:00:00Z', '2026-09-20T09:00:00Z', 3600, 'healthkit')
        returning id::text
      `;
      const executionId = Number(exec[0]!.id);

      expect(
        await resolveSensorCaptureExecution({
          athleteId: A.athleteId,
          target: { assignment_id: assignmentId },
          client: sql,
        }),
      ).toBe(executionId);
      expect(
        await resolveSensorCaptureExecution({
          athleteId: A.athleteId,
          target: { execution_id: executionId },
          client: sql,
        }),
      ).toBe(executionId);
      // Otro atleta no llega a la ejecución de A por ningún camino.
      expect(
        await resolveSensorCaptureExecution({
          athleteId: B.athleteId,
          target: { assignment_id: assignmentId },
          client: sql,
        }),
      ).toBeNull();
      expect(
        await resolveSensorCaptureExecution({
          athleteId: B.athleteId,
          target: { execution_id: executionId },
          client: sql,
        }),
      ).toBeNull();
    } finally {
      await A.cleanup();
      await B.cleanup();
    }
  });
});
