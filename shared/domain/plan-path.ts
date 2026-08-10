// @fahybrid/shared/domain/plan-path — EL CAMINO DEL PLAN.
//
// Por dónde va a pasar el atleta en las próximas semanas, como ESTRUCTURA y no
// como un párrafo. Nace para la sección «camino» de una nota del coach, pero no
// es del comunicado: es del PLAN, y las mismas piezas son las que dibujan la
// espina en periodización y en la vista de un ciclo.
//
// QUÉ ES UN TRAMO, Y POR QUÉ NO ES UNA SEMANA
// -------------------------------------------
// Un tramo son las semanas SEGUIDAS que ocupa un microciclo del coach. No se
// parte en semanas sueltas porque el microciclo es la unidad que el coach creó y
// la que da nombre a lo que se está haciendo: doce nodos repitiendo el mismo
// nombre no son la estructura del plan, son doce filas de ruido. Dónde está hoy
// se dice DENTRO del tramo (`current_week`), que es más preciso que un nodo
// aparte.
//
// NO HAY CATÁLOGO DE FASES — Y ESO ES UNA DECISIÓN, NO UN HUECO
// -------------------------------------------------------------
// La migración 0064 eliminó la entidad «fase» entera (`methodology_phases`, su
// `phase_id`, su eje role/color): la identidad de un microciclo es NOMBRE +
// nivel + nº de semanas, y el ORDEN de los microciclos ES la periodización. Así
// que aquí no se pregunta por una fase: el título de un tramo es el nombre que
// el coach le puso a su microciclo, que es dato suyo (HARD RULE Nº0).
//
// EL COLOR, ENTONCES, ¿DE DÓNDE SALE? De la POSICIÓN, y se dice en voz alta.
// Ninguna columna del esquema guarda un color desde la 0064, así que el tono se
// deriva del sitio que ocupa el tramo en el plan: es estable (añadir un tramo al
// final no recolorea los anteriores), es agnóstico (no lee el vocabulario de
// ningún entrenador) y dice algo verdadero — dónde acaba un bloque y empieza el
// siguiente, que en una lista de nombres parecidos es justo lo que no se ve.
// El día que un coach pueda nombrar y colorear sus ciclos, `planPathTone` lee esa
// columna en vez de la posición y nadie más se entera.

/**
 * Cuántos tonos distintos antes de repetir. Cinco: un plan de más de cinco
 * microciclos seguidos vuelve a empezar la escala, y a esa distancia dos tramos
 * del mismo tono ya no se comparan entre sí.
 *
 * Cada superficie mapea el tono a SUS tokens (nunca al revés): el dominio no
 * conoce ni un color.
 */
export const PLAN_PATH_TONES = 5;

/** El tono de un tramo por su posición. Estable y sin vocabulario de coach. */
export function planPathTone(position: number): number {
  const n = Math.trunc(position) % PLAN_PATH_TONES;
  return n < 0 ? n + PLAN_PATH_TONES : n;
}

/** Un tramo del camino: las semanas seguidas de UN microciclo del coach. */
export interface PlanPathSegmentDTO {
  /** athlete_month_assignments.id — el recibo que materializó este tramo. Lo
   *  necesita cualquier superficie que EDITE la cadena (el coach); la lectura
   *  pura (nota, móvil del atleta) lo ignora. */
  assignment_id: string;
  /** program_month_templates.id detrás de este tramo — de biblioteca o personal. */
  month_template_id: string;
  /** Su sitio en el plan (0-based). Es lo que decide el tono. */
  position: number;
  /** Índice de su primera semana dentro del plan entero (1-based). */
  first_week: number;
  week_count: number;
  /** Ya rotulado como se lee: «S1» o «S2-S5». */
  weeks_label: string;
  /** El nombre que el coach le puso a su microciclo. */
  title: string;
  /** Lo que pasa dentro y el nombre no dice: un simulacro, unos tests. */
  detail: string | null;
  /** Lunes de su primera semana y domingo de la última (ISO). */
  start_date: string;
  end_date: string;
  /** Qué semana de ESTE tramo es la de hoy (1-based). Null si hoy no cae aquí. */
  current_week: number | null;
  /** ¿Rompe la rutina? Hoy: lleva un simulacro o un test. Se pinta relleno. */
  milestone: boolean;
  /** El tono, ya derivado (`planPathTone`), para que nadie lo re-derive distinto. */
  tone: number;
}

export interface PlanPathDTO {
  total_weeks: number;
  /** La posición del tramo en el que está hoy. Null si hoy no cae en el plan. */
  current_position: number | null;
  segments: PlanPathSegmentDTO[];
}

/**
 * Cómo se rotulan las semanas de un tramo: «S1» cuando es una, «S2-S5» cuando
 * son varias. Una sola semana escrita como «S2-S2» le haría leer dos veces para
 * entender que es una.
 */
export function weeksLabel(first_week: number, week_count: number): string {
  const last = first_week + Math.max(1, week_count) - 1;
  return last === first_week ? `S${first_week}` : `S${first_week}-S${last}`;
}
