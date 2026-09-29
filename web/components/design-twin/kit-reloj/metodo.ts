// EL MÉTODO DEL COACH EN EL PLAN — vocabulario y reglas que viajan con la sesión.
//
// Nombres de clase, de formato, palabras del RPE, el método del resumen y el
// rango de la corona son MÉTODO del coach (HARD RULE Nº0): otro entrenador
// competente los diría distinto. Nacen como dato con defecto y viajan EN EL
// PLAN (`PlanSesion.vocabulario`, `PlanSesion.metodo`). Un plan que no los
// trae se comporta como siempre: los `*_DEFECTO` son el fallback de UN sitio
// (`vocabularioDe`, `metodoDe`), no una lectura directa repartida por el kit.
//
// Los campos son opcionales para no romper a los consumidores actuales (el
// Swift del Apple Watch los adoptará en su lote); el servidor los rellena
// siempre con los valores EFECTIVOS del coach (`kit-garmin/plan-compacto`).

import { RANGO_ANOTAR_DEFECTO } from './anotar';
import { METODO_RESUMEN_DEFECTO, type MetodoResumen } from './despues';
import { NOMBRE_FORMATO_DEFECTO } from './familia';
import { FEMENINO_DEFECTO, NOMBRE_CLASE_DEFECTO, type Clase } from './paso';
import type { PlanSesion } from './secuencia';
import { RPE_PALABRA_DEFECTO } from './tokens';

/** El nombre de una clase de paso y su género («Serie 2 cerrada» / «Tramo 3 cerrado»): dato del coach. */
export interface NombreClase {
  nombre: string;
  femenino: boolean;
}

/** Los formatos con nombre propio del vocabulario del coach. */
export type FormatoNombrado = keyof typeof NOMBRE_FORMATO_DEFECTO;
export type NombresFormato = Record<FormatoNombrado, string>;

export interface Vocabulario {
  /** Solo las clases que usa la sesión (el servidor recorta): el resto cae al defecto. */
  clases: Partial<Record<Clase, NombreClase>>;
  /** Los formatos con nombre, siempre completos. */
  formatos: NombresFormato;
  /** Las 11 palabras del RPE de fin de sesión, de 0 a 10. */
  rpe: string[];
}

/** Hasta dónde llega la corona al anotar una serie (método del coach). */
export interface RangoAnotar {
  repsDeMas: number;
  rpe: { min: number; max: number; paso: number };
  rir: { min: number; max: number; paso: number };
  kgMax: number;
}

/** Lo que el reloj decide al terminar y al anotar: método del coach, con defecto. */
export interface MetodoReloj {
  resumen: MetodoResumen;
  anotar: RangoAnotar;
}

/** Cuántas palabras de RPE lleva el vocabulario: el RPE de fin de sesión va de 0 a 10 (CR-10). */
export const NUM_PALABRAS_RPE = 11;

/** El vocabulario efectivo de un plan: lo que trae y, donde no dice nada, los defectos. */
export function vocabularioDe(plan: Pick<PlanSesion, 'vocabulario'>): Vocabulario {
  const v = plan.vocabulario;
  return {
    clases: v?.clases ?? {},
    formatos: v?.formatos ?? { ...NOMBRE_FORMATO_DEFECTO },
    rpe: v?.rpe ?? Array.from({ length: NUM_PALABRAS_RPE }, (_, n) => RPE_PALABRA_DEFECTO[n] ?? ''),
  };
}

/** Cómo se llama una clase de paso en este plan, y su género. */
export function nombreDeClase(plan: Pick<PlanSesion, 'vocabulario'>, clase: Clase): NombreClase {
  return plan.vocabulario?.clases[clase] ?? { nombre: NOMBRE_CLASE_DEFECTO[clase], femenino: FEMENINO_DEFECTO.has(clase) };
}

/** El método efectivo de un plan: lo que trae o los defectos. */
export function metodoDe(plan: Pick<PlanSesion, 'metodo'>): MetodoReloj {
  return plan.metodo ?? { resumen: { ...METODO_RESUMEN_DEFECTO }, anotar: structuredClone(RANGO_ANOTAR_DEFECTO) };
}
