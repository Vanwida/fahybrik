import 'server-only';

// La historia reciente de readiness de N atletas en UNA consulta — lo que
// necesitan la señal (base de 28 d + racha + frescura) y el roster (valor, base
// y serie de 14 d). Lee los snapshots guardados, sin calcular al vuelo: el
// readiness de hoy se materializa al leer el atleta y al ingerir datos
// (DECISIONS 2026-07-27), y las superficies del coach enseñan el último con su
// fecha. Calcular aquí por atleta sería volver al N+1.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { READINESS_HISTORY_DAYS, type ReadinessReading } from './readiness-baseline';

export interface ReadinessHistory {
  /** El «hoy» del atleta en su huso, YYYY-MM-DD. */
  today: string;
  timezone: string;
  /** Lecturas ascendentes (la más vieja primero). */
  series: ReadinessReading[];
}

export async function loadReadinessHistory(params: {
  coach_id: bigint | number;
  athlete_ids?: ReadonlyArray<number | bigint | string>;
  days?: number;
  now?: Date;
  client?: Sql;
}): Promise<Map<string, ReadinessHistory>> {
  const client = params.client ?? defaultSql;
  const ids = params.athlete_ids ? [...new Set(params.athlete_ids.map((x) => Number(x)))] : null;
  const days = params.days ?? READINESS_HISTORY_DAYS;
  const nowIso = (params.now ?? new Date()).toISOString();

  const rows = await client<
    Array<{ athlete_id: string; today: string; timezone: string; on: string | null; score: number | null }>
  >`
    with ath as (
      select a.id,
             coalesce(a.timezone, ${BOX_TIMEZONE}) as tz,
             (${nowIso}::timestamptz at time zone coalesce(a.timezone, ${BOX_TIMEZONE}))::date as today
      from athletes a
      where a.coach_id = ${Number(params.coach_id)}
        and (${ids}::bigint[] is null or a.id = any(${ids}::bigint[]))
    )
    select
      ath.id::text                          as athlete_id,
      to_char(ath.today, 'YYYY-MM-DD')      as today,
      ath.tz                                as timezone,
      to_char(s.recorded_for, 'YYYY-MM-DD') as on,
      s.score                               as score
    from ath
    left join athlete_daily_readiness_snapshots s
      on s.athlete_id = ath.id
     and s.recorded_for between ath.today - ${days}::int and ath.today
    order by ath.id, s.recorded_for
  `;

  const out = new Map<string, ReadinessHistory>();
  for (const r of rows) {
    let h = out.get(r.athlete_id);
    if (!h) {
      h = { today: r.today, timezone: r.timezone, series: [] };
      out.set(r.athlete_id, h);
    }
    if (r.on != null && r.score != null) h.series.push({ on: r.on, score: Number(r.score) });
  }
  return out;
}
