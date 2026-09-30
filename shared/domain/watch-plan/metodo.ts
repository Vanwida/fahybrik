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

import { FEMENINO_DEFECTO, NOMBRE_CLASE_DEFECTO, type Clase } from './paso';
import type { PlanSesion } from './plan';

// ---------------------------------------------------------------------------
// Los defectos, en UN sitio. El kit los re-exporta desde donde vivían
// (`anotar`, `despues`, `familia`, `tokens`).
// ---------------------------------------------------------------------------

/**
 * Hasta dónde llega la corona al anotar. MÉTODO, dato con defecto (HARD RULE
 * Nº0): otro coach anota el RPE desde 1, o el RIR hasta 10.
 */
export const RANGO_ANOTAR_DEFECTO = {
  /** Reps por encima de lo prescrito que la corona deja subir. */
  repsDeMas: 10,
  rpe: { min: 5, max: 10, paso: 0.5 },
  rir: { min: 0, max: 6, paso: 1 },
  kgMax: 500,
} as const;

export interface MetodoResumen {
  /** Pares (km tras estación ↔ km fresco a la misma banda) que hacen falta para dar el coste. */
  paresMinimos: number;
  /**
   * Fracción de lo prescrito a partir de la cual una pieza cortada a mano
   * cuenta como hecha: una serie (900 de 1000 m) o un paso continuo (72′ de
   * una tirada de 80′). Es el mismo juicio —¿se hizo lo que pedía el coach?—
   * sobre la medida del paso, sea cual sea su forma.
   */
  umbralHecho: number;
  /**
   * Tras «Seguir» (enfriamiento libre), segundos sin moverse y sin tocar nada
   * antes de guardar la sesión sola (Alex, 25-09): nadie se queda con el
   * reloj grabando un enfriamiento que ya acabó.
   */
  guardarQuietoS: number;
}

export const METODO_RESUMEN_DEFECTO: MetodoResumen = { paresMinimos: 4, umbralHecho: 0.9, guardarQuietoS: 600 };

/**
 * CÓMO SE LLAMA EL FORMATO EN LA PANTALLA — castellano de box, desde UN sitio.
 * Método del coach con defecto (HARD RULE Nº0): otro coach dice «Por tiempo»
 * en vez de «For Time» o «Tabata» en vez de «A reloj»; lo cambia aquí, no en
 * cada pantalla. La auditoría del 28-09 encontró «Intervals», «Steady»,
 * «Strength», «Warm-up» en el vivo: cada vista traducía por su cuenta.
 */
export const NOMBRE_FORMATO_DEFECTO = {
  emom: 'EMOM',
  amrap: 'AMRAP',
  fortime: 'For Time',
  pared: 'Tabata',
  deathby: 'Death by',
  circuito: 'Circuito',
  test: 'Test',
  series: 'Series',
  fuerza: 'Fuerza',
  continuo: 'Continuo',
} as const;

/** Las palabras del RPE por defecto: dato del coach (un paso trae la suya en `Objetivo.palabra`). */
export const RPE_PALABRA_DEFECTO: Record<number, string> = {
  // El RPE va de 0 a 10 (CR-10): el 0 también tiene palabra.
  0: 'nada',
  1: 'muy suave',
  2: 'muy suave',
  3: 'suave',
  4: 'suave',
  5: 'moderado',
  6: 'moderado',
  7: 'fuerte',
  8: 'fuerte',
  9: 'muy fuerte',
  10: 'máximo',
};


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
  return plan.metodo ?? { resumen: { ...METODO_RESUMEN_DEFECTO }, anotar: { ...RANGO_ANOTAR_DEFECTO, rpe: { ...RANGO_ANOTAR_DEFECTO.rpe }, rir: { ...RANGO_ANOTAR_DEFECTO.rir } } };
}
