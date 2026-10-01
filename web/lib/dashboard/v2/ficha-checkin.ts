import 'server-only';

import type { Sql } from '@/lib/db';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import type { FichaEstado } from './atleta-detalle-types';

/** Las cinco respuestas, fechadas en el huso del atleta; un día sin respuesta es un hueco. */
export async function loadFichaCheckin(client: Sql, coach_id: number, athlete_id: number): Promise<
  Pick<FichaEstado, 'last_checkin' | 'checkin_week'>
> {
  const [latest, week] = await Promise.all([
    client<NonNullable<FichaEstado['last_checkin']>[]>`
      with a as (
        select id, coalesce(timezone, ${BOX_TIMEZONE}) as tz,
               (now() at time zone coalesce(timezone, ${BOX_TIMEZONE}))::date as today
        from athletes where id = ${athlete_id} and coach_id = ${coach_id}
      )
      select to_char(dc.recorded_for, 'YYYY-MM-DD') as recorded_for,
             to_char(dc.recorded_at at time zone a.tz, 'HH24:MI') as time_label,
             (a.today - dc.recorded_for)::int as days_ago,
             dc.soreness::int, dc.mood::int, dc.motivation::int, dc.fatigue::int,
             dc.sleep_quality::int, dc.sub_score::int, dc.adaptive_flag,
             nullif(btrim(dc.notes), '') as notes,
             exists (
               select 1 from chat_threads t
               join chat_messages m on m.thread_id = t.id and m.deleted_at is null
               where t.athlete_id = dc.athlete_id and m.sender_role::text = 'coach'
                 and m.created_at > dc.recorded_at
             ) as answered
      from daily_checkins dc join a on a.id = dc.athlete_id
      where dc.recorded_for <= a.today
      order by dc.recorded_for desc, dc.recorded_at desc limit 1
    `,
    client<FichaEstado['checkin_week']>`
      with a as (
        select id, (now() at time zone coalesce(timezone, ${BOX_TIMEZONE}))::date as today
        from athletes where id = ${athlete_id} and coach_id = ${coach_id}
      )
      select to_char(a.today - 6 + day.n, 'YYYY-MM-DD') as iso, extract(isodow from a.today - 6 + day.n)::int as dow,
             dc.sub_score::int as sub_score
      from a cross join generate_series(0, 6) day(n)
      left join daily_checkins dc on dc.athlete_id = a.id and dc.recorded_for = a.today - 6 + day.n
      order by day.n
    `,
  ]);
  return { last_checkin: latest[0] ?? null, checkin_week: week };
}
