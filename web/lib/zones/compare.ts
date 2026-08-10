import 'server-only';

// DOS PERIODOS ENFRENTADOS — el «antes contra ahora» del feedback del coach.
//
// No hay agregación nueva aquí. Los dos lados se piden con la MISMA función que
// dibuja la gráfica firmada (`loadZoneWindow`), y esto sólo los suma y los
// rotula. Es a propósito: con una segunda consulta que contara los mismos
// segundos «pero en total», la comparativa y la gráfica de la misma nota podrían
// acabar diciendo dos cosas distintas del mismo periodo, y nadie sabría cuál
// mirar. Lo que se paga por ello son dos lecturas en paralelo, que es exactamente
// lo que cuesta preguntar por dos trozos de calendario.
//
// LOS TOTALES SE SUMAN DE LAS PARTES, no se leen de la base. Así el reparto en
// porcentaje cierra siempre en 100 y lo que se dibuja es lo que se rotula — la
// misma regla que sostiene el alto de una barra (`weekTotal`, lib/zones/chart).
//
// LAS FECHAS QUE DAN NOMBRE A UN PERIODO son hechos del atleta: cuándo entró y
// cuándo arrancó su plan. Se leen aquí y la etiqueta se DERIVA de ellas al
// servir, en vez de guardarse junto a la sección: una etiqueta guardada seguiría
// diciendo «Con el plan» el día que se corrija la fecha de arranque.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadZoneWindow, type WeeklyZoneWeek } from '@/lib/zones/weekly';
import { BOX_TIMEZONE, zonedDayString } from '@fahybrid/shared/domain/dates';
import {
  comparePresets,
  etiquetaDePeriodo,
  type CompareAnchorDates,
  type ComparePresetDTO,
  type ZoneComparePeriodDTO,
  type ZoneComparisonDTO,
} from '@fahybrid/shared/domain/zone-compare';

/** Las seis partes que suman el total de un periodo. El hueco entra: el atleta
 *  entrenó ese tiempo aunque no se pudiera repartir. */
const PARTES = ['z1_s', 'z2_s', 'z3_s', 'z4_s', 'z5_s', 'no_hr_s'] as const;

/**
 * Las fechas del atleta que dan nombre a un periodo, más su HOY.
 *
 * El «hoy» sale de la zona horaria del atleta y no del reloj del servidor: los
 * atajos se cortan por la última semana CERRADA, y con el servidor en otra zona
 * un lunes por la mañana ofrecería una semana de más o de menos.
 */
export interface CompareContext extends CompareAnchorDates {
  /** Hoy en la zona del atleta, «YYYY-MM-DD». */
  hoy: string;
}

/**
 * Cuándo entró y cuándo arrancó su plan, los dos en LUNES.
 *
 * · El alta es `onboarded_at`, y si no consta, el día en que se le creó la ficha:
 *   los dos dicen lo mismo para lo que aquí importa —desde cuándo está— y quedarse
 *   sin atajo porque falta el primero sería no ofrecerlo a quien lleva un año.
 * · El plan es el arranque de su PRIMERA asignación con semanas de verdad. Se
 *   descartan los recibos recortados a cero semanas por la misma razón que en la
 *   espina (`plan/camino`): no tienen fechas reales detrás.
 */
export async function loadCompareContext(
  athlete_id: number | bigint,
  client: Sql = defaultSql,
): Promise<CompareContext> {
  const rows = await client<
    Array<{ alta: string | null; plan: string | null; timezone: string | null }>
  >`
    select
      to_char(
        date_trunc(
          'week',
          (coalesce(a.onboarded_at, a.created_at)
            at time zone coalesce(a.timezone, ${BOX_TIMEZONE}))::date
        )::date,
        'YYYY-MM-DD'
      ) as alta,
      to_char(date_trunc('week', p.desde)::date, 'YYYY-MM-DD') as plan,
      a.timezone
    from athletes a
    left join lateral (
      select min(ama.start_date) as desde
      from athlete_month_assignments ama
      where ama.athlete_id = a.id
        and coalesce(array_length(ama.microcycle_ids, 1), 0) > 0
    ) p on true
    where a.id = ${athlete_id as number}
    limit 1
  `;
  const row = rows[0];
  return {
    alta: row?.alta ?? null,
    plan: row?.plan ?? null,
    hoy: zonedDayString(new Date(), row?.timezone ?? BOX_TIMEZONE),
  };
}

/** Los tres atajos del mando «Comparar», con las fechas reales del atleta. */
export async function loadComparePresets(
  athlete_id: number | bigint,
  client: Sql = defaultSql,
): Promise<{ presets: ComparePresetDTO[]; contexto: CompareContext }> {
  const contexto = await loadCompareContext(athlete_id, client);
  return { presets: comparePresets({ anclas: contexto, hoy: contexto.hoy }), contexto };
}

/**
 * Los dos periodos, sumados y rotulados.
 *
 * `anclas` se puede pasar ya resuelto para no releerlo: quien acaba de pedir los
 * atajos ya lo tiene, y una nota con dos comparativas no necesita preguntarlo dos
 * veces. Sin él se lee aquí.
 *
 * NO valida el orden ni el solape: eso es del esquema (al escribir) y del
 * endpoint (al pedir), que son los dos sitios donde se le puede decir al coach
 * qué corregir. Aquí, con dos periodos que se pisaran, saldrían dos sumas
 * correctas de dos ventanas mal elegidas.
 */
export async function loadZoneComparison(args: {
  athlete_id: number | bigint;
  a_start: string;
  b_start: string;
  weeks: number;
  anclas?: CompareAnchorDates;
  client?: Sql;
}): Promise<ZoneComparisonDTO> {
  const client = args.client ?? defaultSql;
  const athlete_id = Number(args.athlete_id);

  const [ladoA, ladoB, anclas] = await Promise.all([
    loadZoneWindow({ athlete_id, week_start: args.a_start, weeks: args.weeks, client }),
    loadZoneWindow({ athlete_id, week_start: args.b_start, weeks: args.weeks, client }),
    args.anclas
      ? Promise.resolve(args.anclas)
      : loadCompareContext(athlete_id, client).then((c) => ({ alta: c.alta, plan: c.plan })),
  ]);

  return {
    weeks: args.weeks,
    a: periodo({ week_start: args.a_start, weeks: args.weeks, lado: 'a', anclas }, ladoA.weeks_data),
    b: periodo({ week_start: args.b_start, weeks: args.weeks, lado: 'b', anclas }, ladoB.weeks_data),
    anchor: anclaDeLosDos(ladoA, ladoB),
  };
}

/** Un periodo sumado, con su nombre puesto por el servidor. */
function periodo(
  meta: { week_start: string; weeks: number; lado: 'a' | 'b'; anclas: CompareAnchorDates },
  weeks_data: readonly WeeklyZoneWeek[],
): ZoneComparePeriodDTO {
  const sumas = { z1_s: 0, z2_s: 0, z3_s: 0, z4_s: 0, z5_s: 0, no_hr_s: 0 };
  let total_s = 0;
  for (const semana of weeks_data) {
    for (const parte of PARTES) {
      const valor = semana[parte];
      if (!Number.isFinite(valor) || valor <= 0) continue;
      sumas[parte] += valor;
      total_s += valor;
    }
  }
  return {
    week_start: meta.week_start,
    label: etiquetaDePeriodo(meta),
    ...sumas,
    total_s,
    // `weeks_data` sólo trae semanas con algo contado (el motor deja fuera las
    // vacías), así que contarlas ES la cobertura del periodo.
    weeks_with_data: weeks_data.length,
  };
}

/**
 * Con qué umbral se repartió esto, dicho una vez para los dos periodos.
 *
 * Se nombra el del DESPUÉS —es el vigente y el que el coach reconoce— y se marca
 * `mixed` cuando entre los dos periodos hubo MÁS DE UNO. Callarlo convertiría una
 * recalibración en un mérito: si el atleta se midió el umbral por el camino,
 * parte del cambio de reparto es de la medición y no del entreno.
 *
 * Se miran TODOS los umbrales de cada lado y no sólo el dominante de cada uno.
 * Comparando dominantes se escaparía el caso más probable de todos: que el
 * atleta se midiera A MITAD del periodo reciente, donde el umbral viejo sigue
 * siendo mayoría y los dos lados «coincidirían» en él.
 */
function anclaDeLosDos(
  a: Awaited<ReturnType<typeof loadZoneWindow>>,
  b: Awaited<ReturnType<typeof loadZoneWindow>>,
): ZoneComparisonDTO['anchor'] {
  const vigente = b.anchor ?? a.anchor;
  if (vigente == null) return null;
  const distintos = new Set(
    [...a.anchors, ...b.anchors].map((x) => `${x.source}|${x.lthr_bpm}`),
  );
  return { ...vigente, mixed: distintos.size > 1 };
}
