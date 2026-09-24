// El registro técnico de los aparatos (0273): lo que el móvil y el reloj cuentan
// del enlace, de la sesión de entreno y de los guardados. Fase 0 del diseño
// Watch-first; alcance decidido por Alex (24-09): todos los atletas, solo datos
// técnicos, 30 días.
//
// El aparato escribe cada evento en su disco ANTES de mandarlo y lo reenvía
// hasta que el servidor contesta 2xx; por eso escribir es idempotente
// (atleta + instalación + seq) y un lote entero es la unidad de acuse.

import { z } from 'zod';
import { sql as defaultSql, type Sql } from '@/lib/db';

/** Días que se guarda un evento (decisión de Alex, 24-09; se dice así en la política de privacidad). */
export const DEVICE_EVENTS_RETENTION_DAYS = 30;
export const DEVICE_EVENTS_MAX_BATCH = 500;

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const deviceEventSchema = z.object({
  install_id: z.string().uuid(),
  seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  device: z.enum(['phone', 'watch']),
  kind: z.enum(['link', 'session', 'save', 'lifecycle', 'diagnostic']),
  name: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  at: z.string().datetime({ offset: true }),
  workout_id: z.string().uuid().nullish().transform((v) => v ?? null),
  outcome: z.enum(['ok', 'failed']).nullish().transform((v) => v ?? null),
  code: z.number().int().min(-2147483648).max(2147483647).nullish().transform((v) => v ?? null),
  domain: optionalText(80),
  // Más largo que el límite de la columna: se recorta, no se rechaza el lote.
  detail: z.string().max(4000).nullish().transform((v) => (v ? v.slice(0, 300) : null)),
  app_version: optionalText(40),
  app_build: optionalText(40),
  os_version: optionalText(40),
  device_model: optionalText(60),
});

export const deviceEventsBatchSchema = z.object({
  events: z.array(deviceEventSchema).min(1).max(DEVICE_EVENTS_MAX_BATCH),
});

export type DeviceEvent = z.infer<typeof deviceEventSchema>;

/**
 * Guarda un lote del atleta de la sesión. Devuelve cuántos eran nuevos (el resto
 * ya estaba: un reenvío). Poda lo suyo de más de 30 días de paso.
 */
export async function recordDeviceEvents(args: {
  athleteId: bigint;
  events: DeviceEvent[];
  sql?: Sql;
}): Promise<{ stored: number; duplicates: number }> {
  const client = args.sql ?? defaultSql;
  const rows = args.events.map((e) => ({
    athlete_id: args.athleteId.toString(),
    install_id: e.install_id,
    seq: e.seq,
    device: e.device,
    kind: e.kind,
    name: e.name,
    occurred_at: e.at,
    workout_id: e.workout_id,
    outcome: e.outcome,
    code: e.code,
    domain: e.domain,
    detail: e.detail,
    app_version: e.app_version,
    app_build: e.app_build,
    os_version: e.os_version,
    device_model: e.device_model,
  }));

  // tenancy: athlete-session — athleteId sale del bearer del atleta (la ruta), nunca del cuerpo.
  const inserted = await client<{ id: string }[]>`
    insert into device_events ${client(rows)}
    on conflict (athlete_id, install_id, seq) do nothing
    returning id::text as id
  `;

  // tenancy: athlete-session — la poda del propio atleta, con el mismo id de la sesión.
  await client`
    delete from device_events
    where athlete_id = ${args.athleteId.toString()}
      and received_at < now() - make_interval(days => ${DEVICE_EVENTS_RETENTION_DAYS})
  `;

  return { stored: inserted.length, duplicates: rows.length - inserted.length };
}

/** La poda de todos (cron diario): lo que ningún aparato vuelve a tocar también caduca. */
export async function pruneDeviceEvents(sql: Sql = defaultSql): Promise<number> {
  // tenancy: platform — la retención es igual para todos los clubs.
  const rows = await sql<{ id: string }[]>`
    delete from device_events
    where received_at < now() - make_interval(days => ${DEVICE_EVENTS_RETENTION_DAYS})
    returning id::text as id
  `;
  return rows.length;
}

/**
 * Una línea por lote en el log de Vercel: cómo se lee una prueba en aparato sin
 * acceso a la base (la salida de la fase 0: «la primera prueba queda registrada y
 * se lee desde aquí»). Solo campos técnicos — lo mismo que la tabla.
 */
export function deviceEventsLogLine(athleteId: bigint, events: DeviceEvent[]): string {
  const compact = events.map((e) =>
    [e.at, e.device, e.kind, e.name, e.outcome ?? '', e.code ?? '', e.domain ?? '', e.workout_id?.slice(0, 8) ?? '', e.detail ?? '']
      .join('|')
      .replace(/\|+$/, ''),
  );
  return JSON.stringify({ tag: 'device_events', athlete_id: athleteId.toString(), n: events.length, events: compact });
}
