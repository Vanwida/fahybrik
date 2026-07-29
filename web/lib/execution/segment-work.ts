// ¿Esta fila de `segment_executions` CUENTA como esfuerzo de trabajo?
//
// Por qué esto existe (y por qué es UNA función y no un `and` copiado).
// ---------------------------------------------------------------------
// Hasta la migración 0146, cada fila de `segment_executions` era, por
// construcción, un esfuerzo: el motor en vivo grababa solo los tramos de trabajo
// y tiraba las recuperaciones. Por eso ~20 lectores de analítica preguntan
// «dame los tramos de correr» y suman, promedian o buscan el mínimo sin más.
//
// Desde 0146 eso deja de ser cierto: una sesión de series graba también sus
// recuperaciones (`leg_role = 'recovery'`), porque el contraste es lo que DEFINE
// una sesión de series y sin él no hay analítica posible. Pero un trote de vuelta
// NO es un intento: metido en un `avg(ritmo)` lo arrastra hacia el trote, metido
// en un `sum(distancia)` infla el volumen de series, y metido en la economía en Z2
// —que es literalmente «correr suave con el pulso en Z2»— dice que el atleta
// empeora justo cuando entrena más duro.
//
// Había ya un eje parecido (`is_structural`, migración 0088) y **un solo lector en
// todo el repo lo filtraba**. Ese es exactamente el fallo que esto evita repetir:
// un eje nuevo que la mayoría de los lectores no conoce es una mentira silenciosa.
// Así que los dos ejes viven aquí, juntos, en la pregunta que los lectores de
// verdad quieren hacer.
//
// LO QUE NO HACE. No excluye la recuperación del VOLUMEN TOTAL de carrera: esos
// metros se corrieron de verdad y contarlos es honesto. Lo que excluye es contarla
// como un INTENTO. Un lector de volumen total que quiera incluirla debe pedir las
// filas sin este predicado y decir en su comentario por qué.

// `TransactionClient` va en la firma además de `Sql` porque hay lectores que
// corren DENTRO de la transacción del ingest a propósito — el detector de PRs lee
// los tramos que se acaban de insertar, y fuera de la transacción no existirían
// todavía. Sin esto, ese lector necesitaba un `as Sql` en el callsite.
import type { Sql, TransactionClient } from '@/lib/db';

type SqlLike = Sql | TransactionClient;

/**
 * Predicado SQL: la fila `se` es un esfuerzo de trabajo puntuable.
 *
 * Dos exclusiones, y las dos significan cosas distintas a propósito:
 *
 *  · `is_structural` (0088) — marcador de completado de un calentamiento/vuelta a
 *    la calma: no tiene ni reps ni carga, no hay nada que puntuar.
 *  · `leg_role = 'recovery'` (0146) — el trote/andar ENTRE series. Sí tiene metros
 *    y tiempo reales; lo que no es es un intento.
 *
 * `coalesce(..., 'work')` es lo que hace que esto sea un no-op sobre todo lo ya
 * guardado: las 206 filas de producción tienen `leg_role` nulo y siguen contando
 * como trabajo exactamente igual que antes de 0146.
 *
 * Se compone con `and`, con la tabla aliaseada `se`:
 *   sql`... where ${SEG_IS_WORK_EFFORT(sql)} and ${mod} = 'run'`
 */
export const SEG_IS_WORK_EFFORT = (sql: SqlLike) => sql`
  coalesce(se.is_structural, false) = false
  and coalesce(se.leg_role, 'work') <> 'recovery'
`;

/**
 * Predicado SQL: la fila `se` CUENTA COMO VOLUMEN.
 *
 * Es deliberadamente MÁS ANCHO que `SEG_IS_WORK_EFFORT`: la recuperación SÍ entra.
 * Un 5×1000 con trotes de 400 m son 6,6 km en las piernas, no 5 — esos metros se
 * corrieron, y no contarlos hace que el volumen semanal BAJE el día que la app
 * empieza a medir mejor. El atleta lee eso como «he entrenado menos», que es una
 * mentira con la forma exacta de un dato.
 *
 * La regla, y es la que separa este predicado del otro: **los kilómetros no mienten
 * cuando se suman; los ritmos mienten cuando se promedian.** Volumen → este.
 * Ritmos, PRs, cuentas de series, distribución de zonas → `SEG_IS_WORK_EFFORT`.
 *
 * Lo estructural sí se va en los dos: un marcador de completado (0088) no tiene ni
 * metros ni carga, así que no aporta volumen — solo duración, y contarla inflaría
 * el tiempo sin aportar distancia.
 *
 * Existe para que la misma semana no dé dos cifras de kilómetros según quién
 * pregunte. Esa es la clase de divergencia que ya costó dos modelos de zonas.
 */
export const SEG_COUNTS_AS_VOLUME = (sql: SqlLike) => sql`
  coalesce(se.is_structural, false) = false
`;

/**
 * El inverso: la fila es una RECUPERACIÓN de una carrera estructurada. Para las
 * lecturas que quieren justamente eso — cuánto duró el trote entre series, cuánto
 * bajó el pulso, si el atleta se la recortó.
 */
export const SEG_IS_RECOVERY = (sql: SqlLike) => sql`se.leg_role = 'recovery'`;

/** Los dos valores que puede tomar `segment_executions.leg_role` (mig 0146). */
export const SEGMENT_LEG_ROLES = ['work', 'recovery'] as const;
export type SegmentLegRole = (typeof SEGMENT_LEG_ROLES)[number];

/** Las tres fases de un bloque de carrera (mig 0146) — espeja `Phase.role`. */
export const SEGMENT_LEG_PHASES = ['warmup', 'main', 'cooldown'] as const;
export type SegmentLegPhase = (typeof SEGMENT_LEG_PHASES)[number];

/**
 * ¿Cuenta esta fila como esfuerzo de trabajo? Espejo EN TypeScript de
 * `SEG_IS_WORK_EFFORT`, para los filtros que ocurren después de la consulta (en
 * JS) en vez de dentro del `where`. Misma regla, un solo sitio donde cambiarla.
 */
export function isWorkEffort(row: {
  is_structural?: boolean | null;
  leg_role?: string | null;
}): boolean {
  if (row.is_structural === true) return false;
  return (row.leg_role ?? 'work') !== 'recovery';
}

// ── Resolución de modalidad ──────────────────────────────────────────────────
//
// Vive aquí, junto al predicado de trabajo, porque los dos responden a la misma
// pregunta desde dos lados («¿qué es esta fila?») y los dos los compone el MISMO
// `where` en todos los lectores. Antes había TRES copias a mano de este fragmento
// —`athlete/analytics/core.ts`, `coach/modality-analytics.ts` y
// `athlete/running-analysis.ts`— cada una con el comentario «kept identical so the
// filters never disagree», y ya habían divergido en los paréntesis del caso `ski`.
// Tres copias que se prometen no divergir son tres copias que divergen.

/**
 * Modalidad canónica de la fila `se`, con el ejercicio aliaseado `ex`. La columna
 * explícita manda; si falta se deriva de la categoría/slug del ejercicio.
 *
 * Se usa como expresión, no como predicado:
 *   const mod = SEG_MODALITY_SQL(sql)
 *   sql`... where ${mod} = 'run' and ${SEG_IS_WORK_EFFORT(sql)}`
 */
export const SEG_MODALITY_SQL = (sql: SqlLike) => sql`
  coalesce(
    se.modality,
    case
      when ex.category = 'cardio' and ex.slug ilike '%run%'  then 'run'
      when ex.category = 'cardio' and ex.slug ilike '%row%'  then 'row'
      when ex.category = 'cardio' and ex.slug ilike '%ski%'  then 'ski'
      when ex.category = 'cardio' and (ex.slug ilike '%bike%' or ex.slug ilike '%cycl%') then 'bike'
      when ex.category = 'strength' then 'strength'
      when ex.category is not null then 'other'
      else 'other'
    end
  )
`;
