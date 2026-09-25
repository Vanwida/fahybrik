// EL PERMISO PARA SUBIR EL MOVIMIENTO DEL RELOJ — darlo y retirarlo.
//
// El archivo inercial de la muñeca (0173, `workout_sensor_captures`) solo se sube
// si el atleta dijo que sí a la versión vigente del texto. Hasta ahora nada
// escribía ese sí en el servidor (`athletes.sensor_capture_consent_version`), así
// que toda subida contestaba 403. Esto es la otra mitad (DECISIONS 2026-09-25):
//
//   · DAR (PUT): el atleta pulsó SUBIRLO en la hoja o encendió el interruptor de
//     Perfil › Privacidad. Se guarda la versión exacta del texto que aceptó; si la
//     app manda una versión que ya no es la vigente, no se acepta — ese sí era a
//     otro texto.
//   · RETIRAR (DELETE): apagar el interruptor BORRA lo subido (Alex, 25-09:
//     retirar el permiso es retirarlo del todo). Primero se apaga el permiso —
//     desde ese instante ni se firma ni se registra una subida nueva —, después
//     se borran los ficheros y al final las filas. En ese orden a propósito: si el
//     almacén falla, las filas siguen ahí, la app reintenta y se vuelve a intentar;
//     al revés quedarían ficheros sin fila que nadie sabría encontrar. Los
//     ficheros se borran por PREFIJO del atleta (`sensor/<id>/`), no por fila:
//     así caen también los que se subieron y nunca llegaron a registrarse.
//
// Idempotente: retirar dos veces deja lo mismo y contesta lo mismo.

import { del, list } from '@vercel/blob';
import { z } from 'zod';

import { sql as defaultSql, type Sql } from '@/lib/db';
import { SENSOR_CAPTURE_CONSENT_VERSION } from '@/lib/sync/ingest-sensor-capture';

export const sensorConsentGrantSchema = z.object({
  version: z.string().min(1).max(64),
});

export type SensorConsentGrantResult =
  | { ok: true; version: string }
  | { ok: false; reason: 'stale_version' };

export async function grantSensorConsent(args: {
  athleteId: number;
  version: string;
  sql?: Sql;
}): Promise<SensorConsentGrantResult> {
  if (args.version !== SENSOR_CAPTURE_CONSENT_VERSION) return { ok: false, reason: 'stale_version' };
  const client = args.sql ?? defaultSql;
  // tenancy: athlete-session
  await client`
    update athletes
    set sensor_capture_consent_version = ${args.version},
        sensor_capture_consent_at = now()
    where id = ${args.athleteId}
  `;
  return { ok: true, version: args.version };
}

/** Borra del almacén todo lo que cuelga de un prefijo. Sustituible en los tests. */
export type SensorBlobEraser = (prefix: string) => Promise<number>;

/** Dónde viven los ficheros de un atleta (el mismo prefijo que firma `upload-url`). */
export function sensorBlobPrefix(athleteId: number): string {
  return `sensor/${athleteId}/`;
}

/** El borrado real: lista por páginas bajo el prefijo y borra cada página. */
export const eraseSensorBlobs: SensorBlobEraser = async (prefix) => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('blob storage not configured');
  let erased = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000, token });
    if (page.blobs.length > 0) {
      await del(page.blobs.map((b) => b.pathname), { token });
      erased += page.blobs.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return erased;
};

export async function withdrawSensorConsent(args: {
  athleteId: number;
  eraseBlobs?: SensorBlobEraser;
  sql?: Sql;
}): Promise<{ deleted_captures: number; deleted_files: number }> {
  const client = args.sql ?? defaultSql;
  const erase = args.eraseBlobs ?? eraseSensorBlobs;

  // 1. El permiso se apaga lo primero: `upload-url` y el registro lo comprueban.
  // tenancy: athlete-session
  await client`
    update athletes
    set sensor_capture_consent_version = null,
        sensor_capture_consent_at = null
    where id = ${args.athleteId}
  `;

  // 2. Los ficheros. Si esto falla, se sale con error y las filas se quedan: el
  //    reintento las vuelve a encontrar.
  const deletedFiles = await erase(sensorBlobPrefix(args.athleteId));

  // 3. Las filas, ya sin fichero detrás.
  // tenancy: athlete-session
  const deleted = await client<{ id: string }[]>`
    delete from workout_sensor_captures
    where athlete_id = ${args.athleteId}
    returning id::text as id
  `;
  return { deleted_captures: deleted.length, deleted_files: deletedFiles };
}
