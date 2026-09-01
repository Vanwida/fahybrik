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
import type { ZoneWeekSecondsDTO } from '@fahybrid/shared/domain/zone-chart';
import type { HrAnchorConfidence, HrAnchorSource } from '@fahybrid/shared/domain/methodology';
import { HR_ANCHOR_LABEL } from '@fahybrid/shared/domain/methodology';

/**
 * Ventana por defecto: la que la gráfica enseña de entrada. Sale de su catálogo
 * (`lib/zones/chart.ts`, cliente) y no de un 26 escrito aquí: con el número en
 * dos sitios, cambiar el defecto de la pantalla dejaba a la API sirviendo otra
 * ventana y nadie se enteraba hasta ver la gráfica corta.
 */
export const WEEKLY_ZONES_DEFAULT_WEEKS = zoneWindowWeeks(DEFAULT_ZONE_WINDOW);
/** Un año y pico. Más allá la gráfica deja de leerse en una pantalla. */
export const WEEKLY_ZONES_MAX_WEEKS = 78;

/**
 * Una semana repartida. Es EL MISMO tipo que viaja dentro de una nota firmada
 * (`ZoneWeekSecondsDTO`, el contrato compartido con iOS): con dos definiciones,
 * el día que el motor gane una banda la pantalla del coach y la del atleta
 * dejarían de contar lo mismo sin que nada dejara de compilar.
 */
export type WeeklyZoneWeek = ZoneWeekSecondsDTO;

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

  const ventana: Ventana = { kind: 'rodante', since, until: now };
  const [rows, computed, anchorZones, planPath] = await Promise.all([
    weekRows(client, args.athlete_id, ventana, modality),
    computedWith(client, args.athlete_id, ventana, modality),
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
 * DE QUÉ TROZO DEL CALENDARIO SE HABLA, y son dos cosas distintas:
 *
 *   · `rodante` — «los últimos N meses», que es lo que mira el coach en la ficha
 *     y se mueve con el reloj.
 *   · `fija` — un periodo del calendario, del lunes X y N semanas. Es lo que
 *     lleva dentro una nota firmada: se congela al escribirla para que el atleta
 *     que la abre en octubre lea exactamente la misma historia.
 *
 * Las dos alimentan LA MISMA agregación: lo único que cambia es el filtro, y por
 * eso viven como un fragmento y no como dos consultas que a los dos meses ya no
 * cuentan lo mismo.
 */
type Ventana =
  | { kind: 'rodante'; since: Date; until: Date }
  | { kind: 'fija'; week_start: string; weeks: number };

/**
 * El filtro temporal de cada clase de ventana.
 *
 * La fija compara por el DÍA LOCAL del atleta y no por instantes, porque es lo
 * mismo por lo que se agrupa (`date_trunc('week', … at time zone …)`): con
 * bordes en UTC, un entreno del domingo por la noche caería en la semana de al
 * lado y la primera y la última barra saldrían recortadas.
 */
function ventanaFilter(client: Sql, v: Ventana) {
  if (v.kind === 'rodante') {
    return client`
      coalesce(we.ended_at, we.started_at) >= ${v.since.toISOString()}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${v.until.toISOString()}::timestamptz
    `;
  }
  return client`
    (coalesce(we.ended_at, we.started_at) at time zone coalesce(a.timezone, ${BOX_TIMEZONE}))::date
      >= ${v.week_start}::date
    and (coalesce(we.ended_at, we.started_at) at time zone coalesce(a.timezone, ${BOX_TIMEZONE}))::date
      < ${v.week_start}::date + ${v.weeks * 7}::int
  `;
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
  ventana: Ventana,
  modality: SegmentModality | null,
): Promise<WeeklyZoneWeek[]> {
  return client<WeeklyZoneWeek[]>`
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
      and ${ventanaFilter(client, ventana)}
      and ${modalityFilter(client, modality)}
    group by 1
    -- Una semana entera a cero no es una semana medida: es una semana sin nada
    -- que contar, y sale de la lista para que la gráfica deje el hueco.
    having sum(z.total_s) > 0
    order by 1 asc
  `;
}

/**
 * EL TIEMPO EN ZONAS DE UN PERIODO CONGELADO — lo que lleva dentro una nota
 * firmada por el coach (`display = 'grafica'`, migración 0169).
 *
 * Misma agregación que la ficha, con dos diferencias que son el punto entero:
 *
 *   · La ventana es FIJA. No se pide «26 semanas hacia atrás» sino «desde este
 *     lunes, 26 semanas»: si se moviera con el reloj, las marcas que el coach
 *     dibujó encima —que son fechas— se quedarían fuera de su propia gráfica.
 *   · El ancla que se devuelve es con la que se computaron ESTOS segundos, no la
 *     vigente hoy. Los segundos están congelados desde la 0168, así que decir el
 *     ancla de hoy sería rotular una gráfica con un umbral que no la hizo. Si en
 *     la ventana convivieran dos (porque el atleta se midió por el camino), se
 *     dice la que pesa en más tramos.
 *
 * Sin `plan_segments` ni `meta` a propósito: dentro de una nota la banda del plan
 * y el recuento de semanas sin dato no caben, y traerlos costaría dos consultas
 * más por cada nota de la bandeja.
 */
export async function loadZoneWindow(args: {
  athlete_id: number;
  /** Lunes de la primera semana. */
  week_start: string;
  weeks: number;
  modality?: SegmentModality | null;
  client?: Sql;
}): Promise<{
  weeks_data: WeeklyZoneWeek[];
  anchor: { source: HrAnchorSource; lthr_bpm: number; source_label: string } | null;
  /**
   * TODOS los umbrales que repartieron estos segundos, de más a menos tramos.
   * Casi siempre es uno; son dos cuando el atleta se midió por el camino, y
   * entonces parte de lo que la ventana enseña es de la medición y no del
   * entreno. `anchor` es el primero de esta lista — quien sólo necesite rotular
   * la gráfica mira ahí y no se entera de que existe.
   */
  anchors: Array<{ source: HrAnchorSource; lthr_bpm: number; segments: number }>;
}> {
  const client = args.client ?? defaultSql;
  const weeks = Math.min(WEEKLY_ZONES_MAX_WEEKS, Math.max(1, Math.trunc(args.weeks)));
  const modality = args.modality ?? null;
  const ventana: Ventana = { kind: 'fija', week_start: args.week_start, weeks };

  const [weeks_data, computed] = await Promise.all([
    weekRows(client, args.athlete_id, ventana, modality),
    computedWith(client, args.athlete_id, ventana, modality),
  ]);

  // Ya vienen ordenados por peso (`computedWith`), así que el primero es el
  // dominante y la lista entera dice si en la ventana convivió más de uno.
  const anchors = computed.anchors
    .filter((a) => a.anchor != null && a.lthr_bpm != null)
    .map((a) => ({
      source: a.anchor as HrAnchorSource,
      lthr_bpm: a.lthr_bpm as number,
      segments: a.segments,
    }));
  const dominante = anchors[0];
  // `source_label` viaja escrito por el servidor: una sola redacción del ancla
  // en todas las superficies, ninguna app inventa la suya.
  return {
    weeks_data,
    anchor: dominante
      ? {
          source: dominante.source,
          lthr_bpm: dominante.lthr_bpm,
          source_label: HR_ANCHOR_LABEL[dominante.source],
        }
      : null,
    anchors,
  };
}

/** Resumen de con qué ancla y de qué fuente salió lo que se está enseñando. */
async function computedWith(
  client: Sql,
  athlete_id: number,
  ventana: Ventana,
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
    -- El atleta entra por su ZONA HORARIA, que es lo que usa el filtro de una
    -- ventana fija para no recortar la primera y la última barra.
    join athletes a on a.id = we.athlete_id
    where we.athlete_id = ${athlete_id}
      and ${ventanaFilter(client, ventana)}
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
