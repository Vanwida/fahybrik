import 'server-only';

// KILÓMETROS POR SEMANA — el wire de `shared/domain/running/weekly-volume.ts`
// (#71, mockup carrera-en-el-panel §06). Espeja el patrón de
// `web/lib/zones/weekly.ts` (agrega en Postgres, corta la semana en la zona
// del atleta), con una diferencia real: aquí NO se omite ninguna semana del
// rango. El tiempo en zonas distingue "no sé" de "no corrió"; los kilómetros
// no tienen esa ambigüedad — una semana sin carrera dentro del rango pedido
// es un cero de verdad, así que la serie sale siempre completa (`generate_
// series` + LEFT JOIN, zero-fill en el propio SQL).
//
// `SEG_COUNTS_AS_VOLUME`, no `SEG_IS_WORK_EFFORT`: los kilómetros de una
// recuperación de series se corrieron de verdad (ver la cabecera de
// `segment-work.ts` — "los kilómetros no mienten cuando se suman"). Es el
// MISMO predicado que ya usa `athlete-deep-dive.ts#loadModality` para el
// reparto semanal de km: dos lectores preguntando lo mismo con el mismo
// predicado, a propósito.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { SEG_COUNTS_AS_VOLUME } from '@/lib/execution/segment-work';
import {
  weeklyVolumeTrend,
  type WeeklyVolumeTrend,
  type WeeklyVolumeWeek,
} from '@fahybrid/shared/domain/running/weekly-volume';

/** Cuántas semanas se enseñan por defecto — 8, la misma barra que dibuja el
 *  mockup (§06). No es método del coach: es cuánto cabe legible en una
 *  tarjeta, no un umbral de juicio. */
export const WEEKLY_VOLUME_DEFAULT_WEEKS = 8;
/** Medio año largo. Más atrás la barra deja de leerse en una pantalla. */
export const WEEKLY_VOLUME_MAX_WEEKS = 26;

export interface WeeklyRunVolumePayload {
  athlete_id: string;
  weeks: WeeklyVolumeWeek[];
  trend: WeeklyVolumeTrend;
}

export async function loadWeeklyRunVolume(args: {
  athlete_id: number;
  weeks?: number;
  now?: Date;
  client?: Sql;
}): Promise<WeeklyRunVolumePayload> {
  const client = args.client ?? defaultSql;
  const now = args.now ?? new Date();
  const weeks = Math.min(
    WEEKLY_VOLUME_MAX_WEEKS,
    Math.max(1, Math.trunc(args.weeks ?? WEEKLY_VOLUME_DEFAULT_WEEKS)),
  );

  const rows = await client<Array<{ week_start: string; km: number }>>`
    with athlete_tz as (
      -- coalesce envuelve la SUBCONSULTA entera, no la columna: si el
      -- atleta no existiera, la subconsulta no devuelve fila y el escalar
      -- es NULL igual que una timezone en blanco. Sin este envoltorio,
      -- date_trunc con "at time zone NULL" sale NULL y generate_series con
      -- límites NULL no genera ninguna fila — la serie saldría vacía en
      -- silencio en vez de zero-filled, que es la garantía de este módulo.
      select coalesce((select a.timezone from athletes a where a.id = ${args.athlete_id}), ${BOX_TIMEZONE}) as tz
    ),
    bounds as (
      select date_trunc('week', ${now.toISOString()}::timestamptz at time zone (select tz from athlete_tz))::date as this_monday
    ),
    weeks as (
      select generate_series(
        (select this_monday from bounds) - (${(weeks - 1) * 7}::int),
        (select this_monday from bounds),
        interval '7 days'
      )::date as week_start
    ),
    km as (
      select
        date_trunc('week', coalesce(we.ended_at, we.started_at) at time zone (select tz from athlete_tz))::date as week_start,
        sum(coalesce(se.distance_meters, 0))::float / 1000.0 as km
      from segment_executions se
      join workout_executions we on we.id = se.execution_id
      where we.athlete_id = ${args.athlete_id}
        and se.modality = 'run'
        and ${SEG_COUNTS_AS_VOLUME(client)}
        and coalesce(we.ended_at, we.started_at) >= (select min(week_start) from weeks)::timestamptz
      group by 1
    )
    select w.week_start::text as week_start, coalesce(k.km, 0) as km
    from weeks w
    left join km k on k.week_start = w.week_start
    order by w.week_start asc
  `;

  const weekRows: WeeklyVolumeWeek[] = rows.map((r, i) => ({
    week_start: r.week_start,
    km: Math.round(r.km * 10) / 10,
    // La serie SIEMPRE termina en la semana que contiene `now` (así se
    // construyó el rango arriba), así que sólo la última fila puede estar
    // en curso.
    en_curso: i === rows.length - 1,
  }));

  return {
    athlete_id: String(args.athlete_id),
    weeks: weekRows,
    trend: weeklyVolumeTrend(weekRows),
  };
}
