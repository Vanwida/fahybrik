// La conexión de Google Calendar de CADA COACH (migración 0254): su refresh_token y
// el calendario donde se crean sus citas. Antes era una fila para toda la
// plataforma (0096) y el siguiente coach que conectaba se quedaba las citas de
// todos. Los access tokens NUNCA se guardan: se piden al vuelo con el refresh_token
// (lib/citas/google.ts:getAccessToken).
//
// Toda lectura y escritura lleva `coach_id`. Sin coach no hay conexión: una cita
// sin coach resoluble no crea evento (y el coach pega el enlace a mano).

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

type Client = Sql | TransactionClient;

export interface GoogleConnection {
  refresh_token: string;
  /** El calendario de las citas del coach. `'primary'` si no eligió otro. */
  calendar_id: string;
}

/** El calendario principal de la cuenta conectada (NULL en la fila). */
export const PRIMARY_CALENDAR = 'primary';

/** La conexión del coach, o null si no ha conectado Google (o no hay coach). */
export async function getGoogleConnection(
  coach_id: bigint | number | null | undefined,
  client: Client = defaultSql,
): Promise<GoogleConnection | null> {
  if (coach_id == null) return null;
  const db = client as unknown as Sql;
  const rows = await db<{ refresh_token: string; calendar_id: string | null }[]>`
    select refresh_token, calendar_id from coach_google_connections
    where coach_id = ${Number(coach_id)} limit 1
  `;
  const r = rows[0];
  return r ? { refresh_token: r.refresh_token, calendar_id: r.calendar_id ?? PRIMARY_CALENDAR } : null;
}

/** Guarda (o renueva) el refresh_token del coach. Reconectar no toca su calendario. */
export async function saveGoogleConnection(
  coach_id: bigint | number,
  refresh_token: string,
  client: Client = defaultSql,
): Promise<void> {
  const db = client as unknown as Sql;
  await db`
    insert into coach_google_connections (coach_id, refresh_token)
    values (${Number(coach_id)}, ${refresh_token})
    on conflict (coach_id)
      do update set refresh_token = excluded.refresh_token, updated_at = now()
  `;
}
