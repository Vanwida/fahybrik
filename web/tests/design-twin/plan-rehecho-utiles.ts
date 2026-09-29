// Utilidades comunes a los tests de «Plan · rehecho».

import type { LecturaPlan } from '@/components/design-twin/kit-plan/contrato';
import { casoPlan } from '@/components/design-twin/kit-plan/casos';
import type { Navegacion } from '@/components/design-twin/kit-plan/modelo';

export const HOY = '2026-10-01';

export const nav = (o: Partial<Navegacion> = {}): Navegacion => ({ offset: 0, seleccion: null, cargandoSiguiente: false, ...o });

export const lectura = (id: string): LecturaPlan => casoPlan(id).lectura;

/** La navegación con la que se abre un escenario. */
export const abre = (id: string): Navegacion => {
  const c = casoPlan(id);
  return nav({ offset: c.abre?.offset ?? 0, seleccion: c.abre?.iso ?? null });
};

/** Cada string de un valor anidado. */
export function textos(v: unknown, acc: string[] = []): string[] {
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach((x) => textos(x, acc));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => textos(x, acc));
  return acc;
}
