// Todos los escenarios de «Plan»: con coach y sin coach, en el orden en que se ven.

import type { CasoPlan } from './contrato';
import type { CasoLibre } from './contrato-libre';
import { CASOS_PLAN } from './casos';
import { CASOS_LIBRE } from './casos-libre';

export type CasoDelPlan = CasoPlan | CasoLibre;

export const TODOS_LOS_CASOS: CasoDelPlan[] = [...CASOS_PLAN, ...CASOS_LIBRE];

export function casoDelPlan(id: string): CasoDelPlan {
  const c = TODOS_LOS_CASOS.find((x) => x.id === id);
  if (!c) throw new Error(`Caso de Plan desconocido: ${id}`);
  return c;
}
