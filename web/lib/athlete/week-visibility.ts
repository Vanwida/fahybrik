// LA PUERTA DE VISIBILIDAD DEL ATLETA, EN SQL, EN UN SITIO.
//
// Una sesión se ve si su semana NO es un borrador del coach: solo `weekly_plans
// .status = 'draft'` esconde; sin fila, se ve (DECISIONS 2026-08-10, «Grupos,
// asignar a varios y publicar por semana»). El Plan (`week-plan.ts`), el
// historial y los endpoints del reloj ya la aplicaban, cada uno con su copia; la
// vista de ciclo (los hitos: «Simulacro el sábado 10») y la tarjeta de tests
// («3/4 · falta remo 2K») no la aplicaban y enseñaban lo que el coach tenía oculto
// (auditoría de la app del atleta, D-19). Esta es la copia única para lo nuevo.
//
// `wa` es el alias de `workout_assignments` en la consulta que la usa.

import type { Sql, TransactionClient } from '@/lib/db';

/**
 * `true` en SQL cuando el atleta ve la sesión `wa`. Con `keepDone`, lo que el
 * atleta YA hizo se ve aunque el coach retenga esa semana: su trabajo es suyo (un
 * test hecho no desaparece de su tarjeta porque el coach esté reescribiendo el
 * resto de la semana).
 */
export function athleteSeesAssignment(sql: Sql | TransactionClient, opts: { keepDone?: boolean } = {}) {
  const hidden = sql`exists (
    select 1 from weekly_plans wp_vis
    where wp_vis.athlete_id = wa.athlete_id
      and wp_vis.week_start = date_trunc('week', wa.scheduled_for)::date
      and wp_vis.status = 'draft'
  )`;
  return opts.keepDone
    ? sql`(wa.status in ('completed', 'partial') or not ${hidden})`
    : sql`(not ${hidden})`;
}
