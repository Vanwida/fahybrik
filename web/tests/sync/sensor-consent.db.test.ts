/**
 * El permiso para subir el movimiento del reloj (DECISIONS 2026-09-25): darlo
 * guarda la versión exacta del texto; retirarlo lo apaga y BORRA lo subido —
 * ficheros por el prefijo del atleta y filas —, sin tocar lo de otro atleta.
 * El almacén de ficheros se sustituye (no es la base de datos).
 */
import { afterAll, expect, test } from 'vitest';

import { SENSOR_CAPTURE_CONSENT_VERSION } from '@/lib/sync/ingest-sensor-capture';
import { grantSensorConsent, sensorBlobPrefix, withdrawSensorConsent } from '@/lib/sync/sensor-consent';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

async function captura(sql: ReturnType<typeof getTestSql>, fx: Fixture): Promise<void> {
  const templateId = await makeTemplate({ fx, name: 'Sensor' });
  const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: '2026-09-20', status: 'completed' });
  const exec = await sql<Array<{ id: string }>>`
    insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source)
    values (${assignmentId}, ${fx.athleteId}, '2026-09-20T08:00:00Z', '2026-09-20T09:00:00Z', 3600, 'healthkit')
    returning id::text
  `;
  await sql`
    insert into workout_sensor_captures (
      execution_id, athlete_id, storage_pathname, byte_size, sample_hz, channels,
      capture_mode, duration_s, started_at, ended_at, consent_version
    ) values (
      ${exec[0]!.id}, ${fx.athleteId}, ${`${sensorBlobPrefix(fx.athleteId)}2026/09/x.fhsc`}, 1024, 50,
      ${['ax', 'ay', 'az']}, 'batched', 3600, '2026-09-20T08:00:00Z', '2026-09-20T09:00:00Z',
      ${SENSOR_CAPTURE_CONSENT_VERSION}
    )
  `;
}

async function permiso(sql: ReturnType<typeof getTestSql>, athleteId: number): Promise<string | null> {
  const rows = await sql<Array<{ v: string | null }>>`
    select sensor_capture_consent_version as v from athletes where id = ${athleteId}
  `;
  return rows[0]?.v ?? null;
}

describeWithDb('sensor consent', () => {
  const sql = getTestSql();
  afterAll(async () => {
    await closeTestSql();
  });

  test('darlo guarda la versión vigente; una versión vieja no vale', async () => {
    const A = await makeCoachAndAthlete(sql);
    try {
      expect(await grantSensorConsent({ athleteId: A.athleteId, version: '2026-08-06.v1', sql })).toEqual({
        ok: false,
        reason: 'stale_version',
      });
      expect(await permiso(sql, A.athleteId)).toBeNull();

      expect(await grantSensorConsent({ athleteId: A.athleteId, version: SENSOR_CAPTURE_CONSENT_VERSION, sql })).toEqual({
        ok: true,
        version: SENSOR_CAPTURE_CONSENT_VERSION,
      });
      expect(await permiso(sql, A.athleteId)).toBe(SENSOR_CAPTURE_CONSENT_VERSION);
    } finally {
      await A.cleanup();
    }
  });

  test('retirarlo apaga el permiso y borra ficheros y filas solo de ese atleta', async () => {
    const A = await makeCoachAndAthlete(sql);
    const B = await makeCoachAndAthlete(sql);
    try {
      for (const fx of [A, B]) {
        await grantSensorConsent({ athleteId: fx.athleteId, version: SENSOR_CAPTURE_CONSENT_VERSION, sql });
        await captura(sql, fx);
      }
      const borrados: string[] = [];
      const result = await withdrawSensorConsent({
        athleteId: A.athleteId,
        sql,
        eraseBlobs: async (prefix) => {
          borrados.push(prefix);
          return 1;
        },
      });

      expect(result).toEqual({ deleted_captures: 1, deleted_files: 1 });
      expect(borrados).toEqual([sensorBlobPrefix(A.athleteId)]);
      expect(await permiso(sql, A.athleteId)).toBeNull();
      const deA = await sql`select 1 from workout_sensor_captures where athlete_id = ${A.athleteId}`;
      const deB = await sql`select 1 from workout_sensor_captures where athlete_id = ${B.athleteId}`;
      expect(deA.length).toBe(0);
      expect(deB.length).toBe(1);
      expect(await permiso(sql, B.athleteId)).toBe(SENSOR_CAPTURE_CONSENT_VERSION);
    } finally {
      await A.cleanup();
      await B.cleanup();
    }
  });

  test('si el almacén falla, las filas se quedan para el reintento', async () => {
    const A = await makeCoachAndAthlete(sql);
    try {
      await grantSensorConsent({ athleteId: A.athleteId, version: SENSOR_CAPTURE_CONSENT_VERSION, sql });
      await captura(sql, A);
      await expect(
        withdrawSensorConsent({
          athleteId: A.athleteId,
          sql,
          eraseBlobs: async () => {
            throw new Error('blob down');
          },
        }),
      ).rejects.toThrow('blob down');
      expect(await permiso(sql, A.athleteId)).toBeNull();
      const filas = await sql`select 1 from workout_sensor_captures where athlete_id = ${A.athleteId}`;
      expect(filas.length).toBe(1);

      const reintento = await withdrawSensorConsent({ athleteId: A.athleteId, sql, eraseBlobs: async () => 1 });
      expect(reintento.deleted_captures).toBe(1);
    } finally {
      await A.cleanup();
    }
  });
});
