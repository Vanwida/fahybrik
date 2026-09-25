import 'server-only';

// Fase 0 — registrar el archivo de señal inercial de una ejecución.
// Los bytes NO pasan por esta API: el cliente hace PUT a un blob prefirmado
// y aquí solo se escribe la fila con el pathname y los parámetros de captura.

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

export const SENSOR_CAPTURE_CONSENT_VERSION = '2026-09-25.v1';
/**
 * El reloj archiva 50 Hz × 9 canales × int16 = 900 B/s ≈ 3,2 MB por hora, sin tope
 * de duración. Los 4 MB de antes cortaban a los ~74 min: una simulación de HYROX
 * o una tirada larga se rechazaban enteras. 32 MB son ~10 h. Es mecanismo, no
 * método: el tamaño lo decide el formato del archivo, no el coach.
 */
export const SENSOR_CAPTURE_MAX_BYTES = 32 * 1024 * 1024;

/**
 * Pedir dónde subir el archivo. La app manda la ASIGNACIÓN, que es lo único que el
 * reloj sabe del entreno (`execution_local_id`), y aquí se resuelve la ejecución:
 * el servidor guarda una por asignación (`on conflict (assignment_id)`). Así el
 * orden entre el sobre de la ejecución y el archivo deja de importar en el móvil.
 * `execution_id` sigue valiendo para quien ya lo tenga.
 */
export const sensorCaptureUploadUrlSchema = z
  .object({
    execution_id: z.number().int().positive().optional(),
    assignment_id: z.number().int().positive().optional(),
    size_bytes: z.number().int().positive().max(SENSOR_CAPTURE_MAX_BYTES),
  })
  .refine((b) => b.execution_id !== undefined || b.assignment_id !== undefined, {
    message: 'execution_id or assignment_id required',
  });

export type SensorCaptureUploadUrl = z.infer<typeof sensorCaptureUploadUrlSchema>;

/**
 * La ejecución del atleta a la que cuelga el archivo, o null si todavía no existe
 * (el entreno aún viaja en la cola del móvil) o no es suya. La app trata ese null
 * como «todavía no» y vuelve a probar más tarde.
 */
export async function resolveSensorCaptureExecution(args: {
  athleteId: number;
  target: Pick<SensorCaptureUploadUrl, 'execution_id' | 'assignment_id'>;
  client?: Sql;
}): Promise<number | null> {
  const client = args.client ?? defaultSql;
  const { execution_id: executionId, assignment_id: assignmentId } = args.target;
  const rows =
    executionId !== undefined
      ? await client<Array<{ id: string }>>`
          select id::text as id from workout_executions
          where id = ${executionId} and athlete_id = ${args.athleteId}
          limit 1
        `
      : await client<Array<{ id: string }>>`
          select id::text as id from workout_executions
          where assignment_id = ${assignmentId!} and athlete_id = ${args.athleteId}
          limit 1
        `;
  const id = Number(rows[0]?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const sensorCaptureRegisterSchema = z.object({
  execution_id: z.number().int().positive(),
  storage_pathname: z.string().min(8).max(512),
  byte_size: z.number().int().positive().max(SENSOR_CAPTURE_MAX_BYTES),
  format_version: z.number().int().positive().default(1),
  sample_hz: z.number().positive().max(200),
  channels: z.array(z.string().min(1).max(16)).min(1).max(12),
  capture_mode: z.enum(['batched', 'classic']),
  watch_model: z.string().max(64).nullish(),
  wrist: z.enum(['left', 'right']).nullish(),
  duration_s: z.number().nonnegative(),
  started_at: z.string().datetime(),
  ended_at: z.string().datetime(),
  consent_version: z.string().min(1).max(64),
});

export type SensorCaptureRegister = z.infer<typeof sensorCaptureRegisterSchema>;

export type RegisterSensorCaptureResult =
  | { ok: false; reason: 'not_found' | 'no_consent' | 'bad_pathname' }
  | { ok: true; id: number };

/**
 * Inserta/actualiza la fila de captura. Exige consentimiento del atleta y que
 * la ejecución sea suya. El pathname debe vivir bajo sensor/<athlete_id>/.
 */
export async function registerSensorCapture(args: {
  athlete_id: number;
  payload: SensorCaptureRegister;
  client?: Sql;
}): Promise<RegisterSensorCaptureResult> {
  const client = args.client ?? defaultSql;
  const p = args.payload;

  const expectedPrefix = `sensor/${args.athlete_id}/`;
  if (!p.storage_pathname.startsWith(expectedPrefix)) {
    return { ok: false, reason: 'bad_pathname' };
  }

  const athlete = await client<Array<{ consent_version: string | null }>>`
    select sensor_capture_consent_version as consent_version
    from athletes
    where id = ${args.athlete_id}
    limit 1
  `;
  const consent = athlete[0]?.consent_version;
  if (!consent || consent !== p.consent_version) {
    return { ok: false, reason: 'no_consent' };
  }

  const owned = await client<Array<{ id: string }>>`
    select id::text as id from workout_executions
    where id = ${p.execution_id} and athlete_id = ${args.athlete_id}
    limit 1
  `;
  if (owned.length === 0) return { ok: false, reason: 'not_found' };

  const rows = await client<Array<{ id: string }>>`
    insert into workout_sensor_captures (
      execution_id, athlete_id, storage_pathname, byte_size,
      format_version, sample_hz, channels, capture_mode,
      watch_model, wrist, duration_s, started_at, ended_at, consent_version
    ) values (
      ${p.execution_id},
      ${args.athlete_id},
      ${p.storage_pathname},
      ${p.byte_size},
      ${p.format_version},
      ${p.sample_hz},
      ${p.channels}::text[],
      ${p.capture_mode},
      ${p.watch_model ?? null},
      ${p.wrist ?? null},
      ${p.duration_s},
      ${p.started_at}::timestamptz,
      ${p.ended_at}::timestamptz,
      ${p.consent_version}
    )
    on conflict (execution_id) do update set
      storage_pathname = excluded.storage_pathname,
      byte_size        = excluded.byte_size,
      format_version   = excluded.format_version,
      sample_hz        = excluded.sample_hz,
      channels         = excluded.channels,
      capture_mode     = excluded.capture_mode,
      watch_model      = excluded.watch_model,
      wrist            = excluded.wrist,
      duration_s       = excluded.duration_s,
      started_at       = excluded.started_at,
      ended_at         = excluded.ended_at,
      consent_version  = excluded.consent_version
    returning id::text
  `;

  return { ok: true, id: Number(rows[0]!.id) };
}
