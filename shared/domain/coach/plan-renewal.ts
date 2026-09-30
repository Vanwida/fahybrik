// @fahybrid/shared/domain/coach/plan-renewal — cuándo se prepara la vuelta
// siguiente del plan de un grupo.
//
// Un grupo con fin de cadena «repetir» o «subir de nivel» no acaba: cuando al plan
// de un atleta le quedan N días o menos, un cron diario materializa la vuelta
// siguiente (la cadena entera, cada programa pegado al anterior). Con «parar» no se
// hace nada.
//
// POR QUÉ N ES DATO (HARD RULE Nº0): otro entrenador competente lo quiere con un
// mes de margen o justo a tiempo. El MECANISMO es nuestro; N es del coach
// (`coaches.plan_renewal_days_before`, NULL = este defecto).

/** Defecto de N: dos semanas de margen. */
export const DEFAULT_PLAN_RENEWAL_DAYS_BEFORE = 14;
/** Barrera de cordura del sistema (mecanismo), no método. */
export const PLAN_RENEWAL_DAYS_MIN = 0;
export const PLAN_RENEWAL_DAYS_MAX = 56;

export function effectivePlanRenewalDays(stored: number | null | undefined): number {
  if (stored == null || !Number.isFinite(stored)) return DEFAULT_PLAN_RENEWAL_DAYS_BEFORE;
  return Math.min(PLAN_RENEWAL_DAYS_MAX, Math.max(PLAN_RENEWAL_DAYS_MIN, Math.trunc(stored)));
}

/**
 * El margen con el que el cron renueva de verdad: nunca menos que los días con
 * que se abre cada semana (`auto_publish_days_before`). Si no, la primera semana
 * de la vuelta nueva llegaría a existir después del día en que tocaba abrirla.
 */
export function renewalHorizonDays(renewal_days: number, auto_publish_days: number): number {
  return Math.max(renewal_days, auto_publish_days);
}
