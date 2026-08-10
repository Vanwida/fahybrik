import 'server-only';

// EL CAMINO DEL ATLETA — su plan real, resuelto en el momento de servirlo.
//
// Lo consume la sección «camino» de una nota del coach (migración 0163), pero no
// es del comunicado: es del PLAN. Las mismas piezas son las que van a dibujar la
// espina en periodización y en la vista de un ciclo, y por eso el contrato vive
// en `@fahybrid/shared/domain/plan-path` y no aquí dentro.
//
// POR QUÉ SE RESUELVE Y NO SE GUARDA
// ----------------------------------
// Si el coach tecleara la estructura dentro de la nota, el día que le rehaga el
// plan al atleta la nota seguiría contando el plan viejo — y una nota se lee
// justamente meses después, que es cuando más miente. Resuelto al servir, el
// camino no puede desfasarse: o es su plan de hoy o no hay camino.
//
// DE DÓNDE SALE CADA COSA (y qué NO se inventa)
// ---------------------------------------------
// · Un TRAMO = un microciclo asignado (`athlete_month_assignments` + el nombre de
//   `program_month_templates`). No hay catálogo de fases desde la migración 0064:
//   el ORDEN de los microciclos ES la periodización, y su nombre es dato del
//   coach. Es la misma fuente que ya usa `shared/domain/coach/macro-progress.ts`
//   para decirle al atleta «X · semana N de M», así que las dos pantallas no
//   pueden contradecirse.
// · El HITO es lo único que se marca, y se marca porque se PUEDE probar: la
//   semana lleva una simulación (`templates.format = 'hyrox_sim'`) o un test de
//   calibración (`workout_assignments.calibration_test_id`). Es lo que rompe la
//   rutina y lo que el atleta busca cuando vuelve aquí.
// · La DESCARGA no se marca. El único `is_deload` que existió murió con la 0064.
//   Deducirla del nombre del microciclo sería cablear el vocabulario de UN
//   entrenador (HARD RULE Nº0) y deducirla del recuento de sesiones sería la
//   pantalla inventándose un dato. Cuando el modelo sepa decirlo, se marca.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  addDays,
  diffDays,
  isoDateString,
  longDateEs,
  mondayOfWeek,
  parseIsoDate,
  startOfDayInBox,
} from '@fahybrid/shared/domain/dates';
import {
  planPathTone,
  weeksLabel,
  type PlanPathDTO,
  type PlanPathSegmentDTO,
} from '@fahybrid/shared/domain/plan-path';

/** Cuántos hitos se nombran en la línea de un tramo antes de resumir. Dos caben
 *  en un vistazo; a partir de ahí el nodo deja de ser un nodo y es una lista. */
const HITOS_EN_LA_LINEA = 2;

/**
 * Hasta dónde cabe el nombre que el coach le puso a la sesión antes de que la
 * línea del nodo deje de leerse de un vistazo. Pasado eso NO se recorta con
 * puntos suspensivos —cortarle una palabra por la mitad al coach es peor que no
 * decirla— sino que se cae a la categoría: «Simulacro el 25 de octubre».
 */
const NOMBRE_QUE_CABE = 34;

type AsignacionRow = {
  assignment_id: string;
  month_template_id: string;
  name: string;
  start_date: string;
  end_date: string;
  week_count: number;
};

type HitoRow = {
  day: string;
  sim: boolean;
  sim_name: string | null;
  test_name: string | null;
};

/**
 * La espina del plan de ESTE atleta, o null si no tiene nada asignado.
 *
 * Null y no una lista vacía a propósito: «no tiene plan» y «tiene un plan sin
 * semanas» no son lo mismo, y el cliente que recibe null no pinta nada en vez de
 * dibujar un camino de cero pasos.
 */
export async function resolvePlanPath(args: {
  athlete_id: number | bigint;
  on_date?: Date;
  sql?: Sql;
}): Promise<PlanPathDTO | null> {
  const client = args.sql ?? defaultSql;
  const today = startOfDayInBox(args.on_date ?? new Date());

  const asignaciones = await client<AsignacionRow[]>`
    select
      ama.id::text                                          as assignment_id,
      ama.month_template_id::text                           as month_template_id,
      m.name                                                as name,
      to_char(ama.start_date, 'YYYY-MM-DD')                 as start_date,
      to_char(ama.end_date,   'YYYY-MM-DD')                 as end_date,
      coalesce(array_length(ama.microcycle_ids, 1), 0)::int as week_count
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    where ama.athlete_id = ${args.athlete_id as number}
      -- A receipt trimmed to zero weeks (personalize-plan.ts closes an old
      -- receipt this way when a fork replaces it in full, 0164) has nothing to
      -- draw: it would otherwise floor to a phantom 1-week node with no real
      -- dates behind it.
      and coalesce(array_length(ama.microcycle_ids, 1), 0) > 0
    order by ama.start_date asc
  `;
  if (asignaciones.length === 0) return null;

  // Cada tramo se mide en SEMANAS, así que su ventana son las semanas que ocupa
  // (lunes de la primera a domingo de la última) y no las fechas sueltas del
  // recibo: un microciclo asignado un martes sigue ocupando esa semana entera.
  const ventanas = asignaciones.map((row) => {
    const inicio = mondayOfWeek(parseIsoDate(row.start_date));
    const porFechas = Math.floor(diffDays(mondayOfWeek(parseIsoDate(row.end_date)), inicio) / 7) + 1;
    const semanas = row.week_count > 0 ? row.week_count : Math.max(1, porFechas);
    return {
      assignment_id: row.assignment_id,
      month_template_id: row.month_template_id,
      name: row.name,
      inicio,
      semanas,
      fin: addDays(inicio, semanas * 7 - 1),
    };
  });

  const primerLunes = ventanas[0]!.inicio;
  const ultimoDomingo = ventanas[ventanas.length - 1]!.fin;
  const hitos = await cargarHitos(client, args.athlete_id, primerLunes, ultimoDomingo);

  let semanaAcumulada = 1;
  let current_position: number | null = null;

  const segments: PlanPathSegmentDTO[] = ventanas.map((v, position) => {
    const first_week = semanaAcumulada;
    semanaAcumulada += v.semanas;

    const dentro = today >= v.inicio && today <= v.fin;
    if (dentro) current_position = position;

    const mios = hitos.filter((h) => h.dia >= v.inicio && h.dia <= v.fin);

    return {
      assignment_id: v.assignment_id,
      month_template_id: v.month_template_id,
      position,
      first_week,
      week_count: v.semanas,
      weeks_label: weeksLabel(first_week, v.semanas),
      title: v.name,
      detail: lineaDeHitos(mios),
      start_date: isoDateString(v.inicio),
      end_date: isoDateString(v.fin),
      current_week: dentro ? Math.floor(diffDays(mondayOfWeek(today), v.inicio) / 7) + 1 : null,
      milestone: mios.length > 0,
      tone: planPathTone(position),
    };
  });

  return { total_weeks: semanaAcumulada - 1, current_position, segments };
}

type Hito = { dia: Date; que: string };

/**
 * Los días del plan que rompen la rutina, con el nombre que el coach le puso a
 * esa sesión: el nodo dice QUÉ pasa y CUÁNDO, no sólo que pasa algo.
 *
 * Un día que es las dos cosas se cuenta como simulacro: es lo que manda ese día,
 * y decir «tests y simulacro» del mismo día se leería como dos citas.
 */
async function cargarHitos(
  client: Sql,
  athlete_id: number | bigint,
  desde: Date,
  hasta: Date,
): Promise<Hito[]> {
  const rows = await client<HitoRow[]>`
    select
      to_char(wa.scheduled_for, 'YYYY-MM-DD')                       as day,
      bool_or(t.format = 'hyrox_sim')                               as sim,
      min(t.name) filter (where t.format = 'hyrox_sim')             as sim_name,
      min(t.name) filter (where wa.calibration_test_id is not null) as test_name
    from workout_assignments wa
    join templates t on t.id = wa.template_id
    where wa.athlete_id = ${athlete_id as number}
      and wa.scheduled_for between ${isoDateString(desde)}::date and ${isoDateString(hasta)}::date
      and (t.format = 'hyrox_sim' or wa.calibration_test_id is not null)
    group by 1
    order by 1 asc
  `;
  return rows.map((r) => ({ dia: parseIsoDate(r.day), que: comoSeLlama(r) }));
}

/**
 * Cómo se llama ese hito: el nombre que le puso el coach si cabe en la línea, y
 * si no la categoría. Nunca una etiqueta nuestra por encima de la suya — la
 * categoría sólo aparece cuando su nombre no se puede enseñar entero.
 */
function comoSeLlama(row: HitoRow): string {
  const categoria = row.sim ? 'Simulacro' : 'Tests';
  const suyo = (row.sim ? row.sim_name : row.test_name)?.trim();
  return suyo && suyo.length > 0 && suyo.length <= NOMBRE_QUE_CABE ? suyo : categoria;
}

/** La línea del tramo: qué pasa dentro y cuándo, dicho como se dice en voz alta. */
function lineaDeHitos(hitos: Hito[]): string | null {
  if (hitos.length === 0) return null;
  const nombrados = hitos
    .slice(0, HITOS_EN_LA_LINEA)
    .map((h) => `${h.que} el ${longDateEs(isoDateString(h.dia))}`)
    .join(' · ');
  const restantes = hitos.length - HITOS_EN_LA_LINEA;
  // Los que no caben se CUENTAN en vez de callarse: un tramo con cuatro citas del
  // que sólo se nombran dos parecería tener dos.
  return restantes > 0 ? `${nombrados} y ${restantes} más` : nombrados;
}
