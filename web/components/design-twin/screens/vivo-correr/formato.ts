// Cómo se ESCRIBE y cómo se JUZGA lo que el guion mide.
//
// Vive aparte del dominio por la misma razón que el §2 del contrato pide un
// formateador por concepto: la pantalla de correr tiene cuatro estados y tres
// escenas, y en cuanto cada una escribe su propia distancia salen «2,97 km» y
// «2.97 km» el mismo día. Aquí hay UNA de cada cosa y todas las escenas la
// usan.

import { esDecimal } from '../../datos-reales';
import { fmtClock, fmtPaceKm } from '../../sim';
import { CINTA, METROS_CINTA, METROS_SERIE, RITMO, TOLERANCIA_SKM, type Tramo } from './guion';

// ---------------------------------------------------------------------------
// Juicio del ritmo contra su objetivo
// ---------------------------------------------------------------------------

export type Juicio = 'dentro' | 'rapido' | 'lento' | 'sin-juicio';

export function juzgar(skm: number | null, objetivoSkm?: number): Juicio {
  if (skm === null || !objetivoSkm) return 'sin-juicio';
  if (skm < objetivoSkm - TOLERANCIA_SKM) return 'rapido';
  if (skm > objetivoSkm + TOLERANCIA_SKM) return 'lento';
  return 'dentro';
}

/** Dentro = ok; fuera por cualquier lado = danger (pasarse también se paga). */
export function colorJuicio(j: Juicio): string {
  if (j === 'dentro') return 'var(--twin-ok)';
  if (j === 'sin-juicio') return 'var(--twin-fg)';
  return 'var(--twin-danger)';
}

export function palabraJuicio(j: Juicio): string | null {
  if (j === 'dentro') return 'En objetivo';
  if (j === 'rapido') return 'Te pasas';
  if (j === 'lento') return 'Aprieta';
  return null;
}

/** «-3» / «+6» / «0» segundos por km. Guion normal, que es lo que pinta un reloj. */
export function delta(skm: number, objetivoSkm: number): string {
  const d = Math.round(skm - objetivoSkm);
  return d > 0 ? `+${d}` : `${d}`;
}

// ---------------------------------------------------------------------------
// Formato — lo que falta de canónico, marcado para subirlo al sitio compartido
// ---------------------------------------------------------------------------
//
// El reloj y el ritmo YA tienen canónico (`fmtClock` / `fmtPaceKm`, sim.ts) y
// se usan tal cual. La DISTANCIA no lo tiene en el kit del doble, y la única
// que hay (`fmtDistancia`, dentro de screens/run-live/data.ts) escribe «1.4 km»
// con punto porque espeja el bug de la app. Estas dos escriben con coma, como
// manda el §2 del contrato, y deberían subir a `datos-reales.ts` en cuanto esta
// propuesta se apruebe: aquí están porque esta tanda no puede tocar el kit.

/** Distancia MEDIDA: «2,97 km» / «844 m». En una medida los ceros son el dato. */
export function distanciaMedida(metros: number): string {
  return metros >= 1000 ? `${esDecimal(metros / 1000, 2)} km` : `${Math.round(metros)} m`;
}

/** Los metros que faltan, enteros, que es como se cuentan de cabeza. */
export function metrosQueQuedan(tramo: Tramo, mTramo: number): number {
  return Math.max(0, Math.ceil((tramo.metros ?? 0) - mTramo));
}

/** Velocidad de cinta: «12,5». La unidad la pinta el layout. */
export function kmh(ms: number): string {
  return esDecimal(ms * 3.6, 1);
}

/** Fracción 0…1 de lo que llevas del tramo. */
export function fraccion(tramo: Tramo, tTramo: number, mTramo: number): number {
  const objetivo = tramo.tipo === 'distancia' ? tramo.metros ?? 0 : tramo.segundos ?? 0;
  const hecho = tramo.tipo === 'distancia' ? mTramo : tTramo;
  return objetivo > 0 ? Math.min(1, Math.max(0, hecho / objetivo)) : 0;
}

/** Segundos que quedan de un tramo de tiempo. */
export function quedanSegundos(tramo: Tramo, tTramo: number): number {
  return Math.max(0, (tramo.segundos ?? 0) - tTramo);
}

/** El 400 proyectado desde el ritmo vivo: «1:31», que es como se piensa. */
export function proyeccion(skm: number, metros: number): number {
  return Math.round((skm * metros) / 1000);
}

/**
 * El objetivo escrito en las DOS grafías que usa el atleta: el reloj de la
 * serie («1:32 el 400») y el ritmo («3:50 /km»). Se calculan del mismo número,
 * así que no pueden contradecirse; escribirlas a mano en cada pantalla es
 * exactamente como nacieron las tres grafías del ritmo que motivaron el §2.
 */
export const OBJETIVO_SERIE = {
  reloj: fmtClock(proyeccion(RITMO.serie400, METROS_SERIE)),
  ritmo: fmtPaceKm(RITMO.serie400),
} as const;

export const OBJETIVO_CINTA = {
  reloj: fmtClock(proyeccion(RITMO.cinta1000, METROS_CINTA)),
  ritmo: fmtPaceKm(RITMO.cinta1000),
  velocidad: esDecimal(CINTA.objetivoKmh, 1),
} as const;

