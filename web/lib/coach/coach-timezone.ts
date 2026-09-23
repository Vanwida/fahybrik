// El huso del coach desde la base (`coaches.timezone`, mig 0241), ya con su
// defecto (`effectiveCoachTimezone`). Una consulta por índice primario.

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
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

/** Guardar el huso (validado IANA por quien llama). El mismo defecto se guarda como NULL. */
export async function setCoachTimezone(
  coach_id: bigint | number,
  tz: string | null,
  client: Sql = defaultSql,
): Promise<CoachTimezoneSetting> {
  const value = tz == null || tz === BOX_TIMEZONE ? null : tz;
  await client`update coaches set timezone = ${value}, updated_at = now() where id = ${Number(coach_id)}`;
  return toSetting(value);
}
