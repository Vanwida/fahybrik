// El huso del coach desde la base (`coaches.timezone`, mig 0241), ya con su
// defecto (`effectiveCoachTimezone`). Una consulta por índice primario.

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isSafeTimezone } from '@/lib/time-zones';
import { effectiveCoachTimezone } from '@fahybrid/shared/domain/coach/coach-timezone';
import { BOX_TIMEZONE, zonedDayString } from '@fahybrid/shared/domain/dates';

export async function loadCoachTimezone(coach_id: bigint | number, client: Sql | TransactionClient = defaultSql): Promise<string> {
  const rows = await client<Array<{ tz: string | null }>>`
    -- to_jsonb: tolera un entorno sin la columna (mig 0241) → defecto.
    select to_jsonb(c) ->> 'timezone' as tz from coaches c where c.id = ${Number(coach_id)} limit 1
  `;
  return effectiveCoachTimezone(rows[0]?.tz ?? null);
}

/** El huso del coach de un atleta (lo que el coach decide para él va en el calendario del club). */
export async function loadCoachTimezoneOfAthlete(
  athlete_id: bigint | number,
  client: Sql | TransactionClient = defaultSql,
): Promise<string> {
  const rows = await client<Array<{ tz: string | null }>>`
    select to_jsonb(c) ->> 'timezone' as tz
    from athletes a join coaches c on c.id = a.coach_id
    where a.id = ${Number(athlete_id)} limit 1
  `;
  return effectiveCoachTimezone(rows[0]?.tz ?? null);
}

/** «Hoy» del coach (YYYY-MM-DD en su huso). */
export async function loadCoachToday(
  coach_id: bigint | number,
  opts: { now?: Date; client?: Sql | TransactionClient } = {},
): Promise<string> {
  return zonedDayString(opts.now ?? new Date(), await loadCoachTimezone(coach_id, opts.client ?? defaultSql));
}

/** «Hoy» del coach de un atleta (YYYY-MM-DD en el huso del club). */
export async function loadCoachTodayOfAthlete(
  athlete_id: bigint | number,
  opts: { now?: Date; client?: Sql | TransactionClient } = {},
): Promise<string> {
  return zonedDayString(opts.now ?? new Date(), await loadCoachTimezoneOfAthlete(athlete_id, opts.client ?? defaultSql));
}

export interface CoachTimezoneSetting {
  /** Lo guardado; null = el defecto del producto. */
  timezone: string | null;
  effective: string;
  default_timezone: string;
}

function toSetting(stored: string | null): CoachTimezoneSetting {
  return { timezone: stored, effective: effectiveCoachTimezone(stored), default_timezone: BOX_TIMEZONE };
}

export async function getCoachTimezoneSetting(coach_id: bigint | number, client: Sql = defaultSql): Promise<CoachTimezoneSetting> {
  const rows = await client<Array<{ tz: string | null }>>`
    select to_jsonb(c) ->> 'timezone' as tz from coaches c where c.id = ${Number(coach_id)} limit 1
  `;
  return toSetting(rows[0]?.tz ?? null);
}

/** Un huso que no se guarda. El mensaje es para el coach. */
export class CoachTimezoneError extends Error {}

/**
 * La forma que admite la columna (`coaches_timezone_chk`, mig 0241): 3–64
 * caracteres, un primer tramo solo de letras y «_», y los siguientes tras «/».
 * Intl y Postgres conocen husos que no la cumplen ('EST5EDT', 'PST8PDT'…); sin
 * mirarla aquí, el CHECK los rechazaba al escribir y la ruta daba un 500 en vez
 * del «no se puede usar». El combo nunca los ofrece.
 */
const COACH_TIMEZONE_COLUMN_SHAPE = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/;

function fitsCoachTimezoneColumn(tz: string): boolean {
  return tz.length >= 3 && tz.length <= 64 && COACH_TIMEZONE_COLUMN_SHAPE.test(tz);
}

/**
 * Guardar el huso. El mismo defecto se guarda como NULL. Solo se guarda uno que
 * conocen los dos motores de fechas (`isSafeTimezone`: Intl y Postgres, nombre a
 * nombre) y que cabe en la columna; si no, `CoachTimezoneError` y la columna no
 * cambia, porque cada lectura en SQL lo pasa a `at time zone` y uno desconocido
 * la tumbaría.
 */
export async function setCoachTimezone(
  coach_id: bigint | number,
  tz: string | null,
  client: Sql = defaultSql,
): Promise<CoachTimezoneSetting> {
  const value = tz == null || tz === BOX_TIMEZONE ? null : tz;
  if (value != null && !(fitsCoachTimezoneColumn(value) && (await isSafeTimezone(value, client)))) {
    throw new CoachTimezoneError('Ese huso no se puede usar. Elige uno de la lista.');
  }
  await client`update coaches set timezone = ${value}, updated_at = now() where id = ${Number(coach_id)}`;
  return toSetting(value);
}
