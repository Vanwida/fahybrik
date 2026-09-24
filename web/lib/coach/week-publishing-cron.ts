// El cron diario de «publicar por semana»: abre las semanas en borrador
// automático cuyo lunes está a N días o menos (N del coach) en el día de CADA
// coach. El resto del ciclo de una semana (el ajuste, leer y escribir filas, los
// actos del coach) vive en ./week-publishing.ts.

import 'server-only';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, BOX_TIMEZONE, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import {
  AUTO_PUBLISH_DAYS_MAX,
  DEFAULT_AUTO_PUBLISH_DAYS_BEFORE,
} from '@fahybrid/shared/domain/coach/week-publishing';
import { boxToday, notifyWeekVisible, sessionsByWeek } from './week-publishing';

export interface AutoPublishRunResult {
  today: string;
  published: number;
  notified: number;
}

/**
 * Abre las semanas en borrador AUTOMÁTICO cuyo lunes está a N días o menos (N del
 * coach de cada atleta) y que no han acabado ya. Una semana retenida no se toca;
 * un atleta pausado o de baja tampoco (su plan está congelado). Un aviso por
 * atleta (la semana más temprana abierta) y solo si esa semana tiene entrenos.
 * Si un día falla, al siguiente recoge lo que quedó (no solo «el lunes que viene»).
 */
export async function runAutoPublish(
  params: {
    client?: Sql;
    now?: Date;
    /** Solo las semanas de los atletas de este coach (pruebas, relanzar un club). */
    coach_id?: number | bigint;
  } = {},
): Promise<AutoPublishRunResult> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const today = boxToday(now);
  const onlyCoach = params.coach_id == null ? null : Number(params.coach_id);
  // «Hoy» es el de CADA coach (su huso; uno que Postgres no conozca cae al
  // defecto en vez de tumbar el barrido de todos).
  const opened = await client<Array<{ athlete_id: string; week_start: string }>>`
    with valid as (select name from pg_timezone_names),
    coach_day as (
      select c.id as coach_id,
             c.auto_publish_days_before,
             (${now.toISOString()}::timestamptz at time zone
               coalesce((select v.name from valid v where v.name = c.timezone), ${BOX_TIMEZONE}))::date as today
      from coaches c
    )
    update weekly_plans wp
       set status = 'published', updated_at = now()
      from athletes a
      left join coach_day d on d.coach_id = a.coach_id
     where a.id = wp.athlete_id
       and wp.status = 'draft'
       and wp.delivery_mode = 'scheduled'
       and a.lifecycle_status = 'activo'
       and (${onlyCoach}::bigint is null or a.coach_id = ${onlyCoach}::bigint)
       and wp.week_start - coalesce(d.auto_publish_days_before, ${DEFAULT_AUTO_PUBLISH_DAYS_BEFORE})::int
           <= coalesce(d.today, ${today}::date)
       and wp.week_start + 6 >= coalesce(d.today, ${today}::date)
    returning wp.athlete_id::text as athlete_id, to_char(wp.week_start, 'YYYY-MM-DD') as week_start
  `;

  const firstByAthlete = new Map<number, string>();
  for (const row of opened) {
    const id = Number(row.athlete_id);
    const cur = firstByAthlete.get(id);
    if (!cur || row.week_start < cur) firstByAthlete.set(id, row.week_start);
  }
  if (firstByAthlete.size === 0) return { today, published: 0, notified: 0 };

  const ids = [...firstByAthlete.keys()];
  const lastSunday = isoDateString(addDays(parseIsoDate(today), 6 + AUTO_PUBLISH_DAYS_MAX));
  const sessions = await sessionsByWeek(client, ids, isoDateString(addDays(parseIsoDate(today), -6)), lastSunday);
  let notified = 0;
  for (const [id, week] of firstByAthlete) {
    if ((sessions.get(`${id}|${week}`) ?? 0) === 0) continue;
    if (await notifyWeekVisible(client, id, week, now)) notified += 1;
  }
  return { today, published: opened.length, notified };
}
