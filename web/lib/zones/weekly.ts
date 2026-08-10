import 'server-only';

// TIEMPO EN ZONAS POR SEMANA — la lectura que dibuja la gráfica de la ficha.
//
// AGREGA EN POSTGRES, y eso no es una optimización para más adelante. La lectura
// que había hasta hoy se traía TODAS las filas de pulso al proceso para contarlas
// en JavaScript, y el histórico repetía esa consulta doce veces, una por semana.
// Son del orden de 10⁵ filas por atleta (89.582 para uno solo, medido el
// 10-ago-2026) y ya iba justa. Aquí sale una consulta y una fila por semana.
//
// UNA SEMANA SIN DATO NO SE PINTA A CERO: no sale en la lista. Un cero dice «esa
// semana no entrenó» y la ausencia dice «de esa semana no sabemos», que son dos
// cosas distintas y el coach actúa distinto ante cada una. `meta` cuenta cuántas
// faltan y desde cuándo hay cobertura, para que la pantalla pueda decirlo en voz
// alta en vez de enseñar seis meses vacíos como si nadie hubiera entrenado.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { DEFAULT_ZONE_WINDOW, zoneWindowWeeks } from '@/lib/zones/chart';
import { resolvePlanPath } from '@/lib/plan/camino';
import { loadAthleteHrZones } from '@/lib/athlete/hr-zones';
import { SEGMENT_MODALITIES, type SegmentModality } from '@/lib/sync/ingest-execution-segments';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import type { PlanPathSegmentDTO } from '@fahybrid/shared/domain/plan-path';
import type { HrAnchorConfidence, HrAnchorSource } from '@fahybrid/shared/domain/methodology';

/**
 * Ventana por defecto: la que la gráfica enseña de entrada. Sale de su catálogo
 * (`lib/zones/chart.ts`, cliente) y no de un 26 escrito aquí: con el número en
 * dos sitios, cambiar el defecto de la pantalla dejaba a la API sirviendo otra
 * ventana y nadie se enteraba hasta ver la gráfica corta.
 */
export const WEEKLY_ZONES_DEFAULT_WEEKS = zoneWindowWeeks(DEFAULT_ZONE_WINDOW);
/** Un año y pico. Más allá la gráfica deja de leerse en una pantalla. */
export const WEEKLY_ZONES_MAX_WEEKS = 78;

export interface WeeklyZoneWeek {
  /** Lunes de la semana, en la zona horaria del atleta. */
  week_start: string;
  z1_s: number;
  z2_s: number;
  z3_s: number;
  z4_s: number;
  z5_s: number;
  /** Tiempo medido que no se pudo repartir — la banda gris de la gráfica. */
  no_hr_s: number;
  total_s: number;
}

export interface WeeklyZonesMeta {
  weeks_requested: number;
  /** Semanas de la ventana con al menos un tramo contado. */
  weeks_with_data: number;
  /** Las que no. Ausentes de `weeks`, contadas aquí. */
  weeks_without_data: number;
  /** Desde cuándo hay cobertura. Null si no hay ninguna. */
  first_week_with_data: string | null;
  /** El ancla VIGENTE del atleta, para la cabecera. Null si no tiene. */
  anchor: {
    source: HrAnchorSource;
    confidence: HrAnchorConfidence;
    lthr_bpm: number;
  } | null;
  /**
   * Con qué se computó lo que se está enseñando. Una gráfica levantada sobre un
   * umbral estimado tiene que poder decirlo, y una que mezcla dos anclas (porque
   * por el camino el atleta se midió) también.
   */
  computed_with: Array<{
    anchor: HrAnchorSource | null;
    lthr_bpm: number | null;
    segments: number;
  }>;
  /** De dónde salieron los segundos, para distinguir «sin pulso» de «sin traza». */
  origins: Array<{ origin: string; segments: number }>;
}

export interface WeeklyZonesPayload {
  athlete_id: string;
  modality: SegmentModality | null;
  weeks: WeeklyZoneWeek[];
  meta: WeeklyZonesMeta;
  /**
   * Los tramos del PLAN dentro de la ventana — la banda que va debajo del eje.
   * Se resuelve del plan real del atleta (`plan-path`), no se guarda: una gráfica
   * que enseñara el plan viejo mentiría justo cuando más se mira, meses después.
   */
  plan_segments: PlanPathSegmentDTO[];
}

/** Modalidades por las que se puede filtrar. Las del ingest, sin inventar ninguna. */
export const ZONE_MODALITIES = SEGMENT_MODALITIES;

type WeekRow = {
  week_start: string;
  z1_s: number;
  z2_s: number;
  z3_s: number;
  z4_s: number;
  z5_s: number;
  no_hr_s: number;
  total_s: number;
};

/**
 * Reparto semanal de tiempo en zonas de un atleta, más el plan de fondo.
 *
 * `modality` filtra por el TRAMO y no por la sesión: una sesión mixta reparte sus
 * minutos entre correr, fuerza y ergo, que es lo que de verdad pasó.
 */
export async function loadWeeklyZones(args: {
  athlete_id: number;
  weeks?: number;
  modality?: SegmentModality | null;
  now?: Date;
  client?: Sql;
}): Promise<WeeklyZonesPayload> {
  const client = args.client ?? defaultSql;
  const now = args.now ?? new Date();
  const weeks = Math.min(
    WEEKLY_ZONES_MAX_WEEKS,
    Math.max(1, Math.trunc(args.weeks ?? WEEKLY_ZONES_DEFAULT_WEEKS)),
  );
  const modality = args.modality ?? null;
  const since = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);

  const [rows, computed, anchorZones, planPath] = await Promise.all([
    weekRows(client, args.athlete_id, since, now, modality),
    computedWith(client, args.athlete_id, since, now, modality),
    loadAthleteHrZones(args.athlete_id, client),
    resolvePlanPath({ athlete_id: args.athlete_id, sql: client }),
  ]);

  const sinceIso = since.toISOString().slice(0, 10);
  const plan_segments = (planPath?.segments ?? []).filter((s) => s.end_date >= sinceIso);

  return {
    athlete_id: String(args.athlete_id),
    modality,
    weeks: rows,
    meta: {
      weeks_requested: weeks,
      weeks_with_data: rows.length,
      weeks_without_data: Math.max(0, weeks - rows.length),
      first_week_with_data: rows[0]?.week_start ?? null,
      anchor: anchorZones
        ? {
            source: anchorZones.source,
            confidence: anchorZones.confidence,
            lthr_bpm: anchorZones.lthr_bpm,
          }
        : null,
      computed_with: computed.anchors,
      origins: computed.origins,
    },
    plan_segments,
  };
}

/**
 * La modalidad CANÓNICA de un tramo, resuelta en SQL. La columna es texto libre
 * y guarda valores fuera del vocabulario (`functional`, y 5 filas a null, medido
 * el 10-ago-2026): todo lo que no está en la lista es «otro», igual que hace
 * `normalizeModality` al escribir.
 */
function canonicalModality(client: Sql) {
  const known = SEGMENT_MODALITIES.filter((m) => m !== 'other');
  return client`case when se.modality = any(${known as unknown as string[]}) then se.modality else 'other' end`;
}

function modalityFilter(client: Sql, modality: SegmentModality | null) {
  if (!modality) return client`true`;
  return client`${canonicalModality(client)} = ${modality}`;
}

async function weekRows(
  client: Sql,
  athlete_id: number,
  since: Date,
  until: Date,
  modality: SegmentModality | null,
): Promise<WeeklyZoneWeek[]> {
  return client<WeekRow[]>`
    select
      to_char(
        date_trunc(
          'week',
          coalesce(we.ended_at, we.started_at) at time zone coalesce(a.timezone, ${BOX_TIMEZONE})
        )::date,
        'YYYY-MM-DD'
      ) as week_start,
      sum(z.z1_s)::int    as z1_s,
      sum(z.z2_s)::int    as z2_s,
      sum(z.z3_s)::int    as z3_s,
      sum(z.z4_s)::int    as z4_s,
      sum(z.z5_s)::int    as z5_s,
      sum(z.no_hr_s)::int as no_hr_s,
      sum(z.total_s)::int as total_s
    from segment_zone_seconds z
    join segment_executions se on se.id = z.segment_execution_id
    join workout_executions we on we.id = se.execution_id
    join athletes a on a.id = we.athlete_id
    where we.athlete_id = ${athlete_id}
      and coalesce(we.ended_at, we.started_at) >= ${since.toISOString()}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${until.toISOString()}::timestamptz
      and ${modalityFilter(client, modality)}
    group by 1
    -- Una semana entera a cero no es una semana medida: es una semana sin nada
    -- que contar, y sale de la lista para que la gráfica deje el hueco.
    having sum(z.total_s) > 0
    order by 1 asc
  `;
}

/** Resumen de con qué ancla y de qué fuente salió lo que se está enseñando. */
async function computedWith(
  client: Sql,
  athlete_id: number,
  since: Date,
  until: Date,
  modality: SegmentModality | null,
): Promise<{
  anchors: WeeklyZonesMeta['computed_with'];
  origins: WeeklyZonesMeta['origins'];
}> {
  const rows = await client<
    Array<{
      anchor: HrAnchorSource | null;
      lthr_bpm: number | null;
      origin: string;
      segments: number;
    }>
  >`
    select
      z.computed_with_anchor        as anchor,
      z.computed_with_lthr_bpm::int as lthr_bpm,
      z.hr_origin                   as origin,
      count(*)::int                 as segments
    from segment_zone_seconds z
    join segment_executions se on se.id = z.segment_execution_id
    join workout_executions we on we.id = se.execution_id
    where we.athlete_id = ${athlete_id}
      and coalesce(we.ended_at, we.started_at) >= ${since.toISOString()}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${until.toISOString()}::timestamptz
      and ${modalityFilter(client, modality)}
    group by 1, 2, 3
    order by segments desc
  `;

  const anchors = new Map<string, WeeklyZonesMeta['computed_with'][number]>();
  const origins = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.anchor ?? '-'}|${r.lthr_bpm ?? '-'}`;
    const entry = anchors.get(key) ?? { anchor: r.anchor, lthr_bpm: r.lthr_bpm, segments: 0 };
    entry.segments += r.segments;
    anchors.set(key, entry);
    origins.set(r.origin, (origins.get(r.origin) ?? 0) + r.segments);
  }
  return {
    anchors: [...anchors.values()].sort((a, b) => b.segments - a.segments),
    origins: [...origins.entries()]
      .map(([origin, segments]) => ({ origin, segments }))
      .sort((a, b) => b.segments - a.segments),
  };
}
