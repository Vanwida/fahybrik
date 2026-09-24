import 'server-only';

// Lo que la pantalla de Hoy necesita ALREDEDOR de la bandeja (`loadHoy`, plan
// §4.3) y el contrato no trae: quiénes son los atletas de cada grupo (para «Ver
// quiénes», la vista Altas y los nombres del panel de asignar), qué marcó el
// coach como hecho hoy (para verlo y reabrirlo), cuántos entrenos se han
// registrado hoy (una línea) y cuándo se publica sola la semana que viene (el
// «todo al día» dice cuándo llega lo siguiente). Un número CONSTANTE de
// consultas, en paralelo, sea cual sea el roster.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { BOX_TIMEZONE, zonedWallClockToUtc } from '@fahybrid/shared/domain/dates';
import { startOfDayInTz } from '@fahybrid/shared/domain/coach/coach-timezone';
import { effectiveAutoPublishDays } from '@fahybrid/shared/domain/coach/week-publishing';
import type { SignalKind } from '@fahybrid/shared/domain/coach/signals';

/** Un atleta de un grupo de causa compartida. */
export interface HoyPerson {
  athlete_id: string;
  name: string;
  avatar_url: string | null;
  level_label: string | null;
  /** ISO — cuándo terminó el cuestionario de entrada (la edad de un alta). */
  onboarded_at: string | null;
}

/** Un atleta que el coach marcó «hecho» hoy (fila del pie «Resuelto hoy»). */
export interface HoyResolved {
  athlete_id: string;
  name: string;
  avatar_url: string | null;
  level_label: string | null;
  /** Las señales que se cerraron (para reabrirlas). */
  kinds: SignalKind[];
  /** ISO — el último «hecho» de hoy. */
  at: string;
}

export interface HoyExtras {
  people: HoyPerson[];
  resolved: HoyResolved[];
  /** Entrenos registrados hoy por sus atletas (null = no se ha podido saber). */
  activity_today: number | null;
  /** N de «se publica sola N días antes» (con su defecto). */
  auto_publish_days: number;
}

/** El día de HOY del coach (su huso), como dos instantes. */
function dayBounds(now: Date, tz: string): { start: string; end: string } {
  const today = startOfDayInTz(now, tz);
  return {
    start: zonedWallClockToUtc(today, tz).toISOString(),
    end: zonedWallClockToUtc(today, tz, { days: 1 }).toISOString(),
  };
}

export async function loadHoyPeople(params: {
  coach_id: bigint | number;
  athlete_ids: ReadonlyArray<string>;
  client?: Sql;
}): Promise<HoyPerson[]> {
  const client = params.client ?? defaultSql;
  const ids = [...new Set(params.athlete_ids)].map(Number).filter((n) => Number.isFinite(n));
  if (ids.length === 0) return [];
  const rows = await client<
    Array<{ id: string; name: string; avatar_url: string | null; level_label: string | null; onboarded_at: Date | null }>
  >`
    select a.id::text as id, a.full_name as name, a.avatar_url, al.label as level_label, a.onboarded_at
    from athletes a
    left join athlete_levels al on al.id = a.level_id
    where a.coach_id = ${Number(params.coach_id)}
      and a.id = any(${ids}::bigint[])
    order by a.full_name
  `;
  return rows.map((r) => ({
    athlete_id: r.id,
    name: r.name,
    avatar_url: r.avatar_url,
    level_label: r.level_label,
    onboarded_at: r.onboarded_at ? r.onboarded_at.toISOString() : null,
  }));
}

export async function loadResolvedToday(params: {
  coach_id: bigint | number;
  now?: Date;
  /** El huso del coach (`HoyView.timezone`). */
  tz?: string;
  client?: Sql;
}): Promise<HoyResolved[]> {
  const client = params.client ?? defaultSql;
  const { start } = dayBounds(params.now ?? new Date(), params.tz ?? BOX_TIMEZONE);
  const rows = await client<
    Array<{
      athlete_id: string;
      name: string;
      avatar_url: string | null;
      level_label: string | null;
      kinds: string[];
      at: Date;
    }>
  >`
    select
      o.athlete_id::text                                   as athlete_id,
      a.full_name                                          as name,
      a.avatar_url                                         as avatar_url,
      al.label                                             as level_label,
      array_agg(o.signal_kind::text order by o.signal_kind) as kinds,
      max(o.dismissed_at)                                  as at
    from coach_alert_overrides o
    join athletes a on a.id = o.athlete_id and a.lifecycle_status = 'activo'
    left join athlete_levels al on al.id = a.level_id
    where o.coach_id = ${Number(params.coach_id)}
      and a.coach_id = ${Number(params.coach_id)}
      and o.override_kind = 'done'
      and o.dismissed_at >= ${start}::timestamptz
    group by o.athlete_id, a.full_name, a.avatar_url, al.label
    order by max(o.dismissed_at) desc
  `;
  return rows.map((r) => ({
    athlete_id: r.athlete_id,
    name: r.name,
    avatar_url: r.avatar_url,
    level_label: r.level_label,
    kinds: r.kinds as SignalKind[],
    at: r.at.toISOString(),
  }));
}

async function loadScalars(
  client: Sql,
  coach_id: number,
  now: Date,
  tz: string,
): Promise<{ activity_today: number; auto_publish_days: number }> {
  const { start, end } = dayBounds(now, tz);
  const rows = await client<Array<{ activity: number; auto_days: number | null }>>`
    select
      (
        select count(*)
        from workout_executions we
        join athletes a on a.id = we.athlete_id
        where a.coach_id = ${coach_id}
          and coalesce(we.ended_at, we.started_at, we.created_at) >= ${start}::timestamptz
          and coalesce(we.ended_at, we.started_at, we.created_at) <  ${end}::timestamptz
      )::int as activity,
      (select c.auto_publish_days_before from coaches c where c.id = ${coach_id}) as auto_days
  `;
  const r = rows[0];
  return {
    activity_today: r?.activity ?? 0,
    auto_publish_days: effectiveAutoPublishDays(r?.auto_days ?? null),
  };
}

/** Todo lo de alrededor, en paralelo. Cada parte cae por su lado (la bandeja sigue). */
export async function loadHoyExtras(params: {
  coach_id: bigint | number;
  athlete_ids: ReadonlyArray<string>;
  now?: Date;
  /** El huso del coach (`HoyView.timezone`); sin él, el defecto. */
  tz?: string;
  client?: Sql;
}): Promise<HoyExtras> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const tz = params.tz ?? BOX_TIMEZONE;
  const coach_id = Number(params.coach_id);
  const [people, resolved, scalars] = await Promise.all([
    loadHoyPeople({ coach_id, athlete_ids: params.athlete_ids, client }).catch((): HoyPerson[] => []),
    loadResolvedToday({ coach_id, now, tz, client }).catch((): HoyResolved[] => []),
    loadScalars(client, coach_id, now, tz).catch(() => null),
  ]);
  return {
    people,
    resolved,
    activity_today: scalars?.activity_today ?? null,
    auto_publish_days: scalars?.auto_publish_days ?? effectiveAutoPublishDays(null),
  };
}
