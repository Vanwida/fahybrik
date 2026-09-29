// LAS FILAS DE «ANTES» — cómo se apila una cara sin héroe en el círculo. PURO.
//
// Las caras de antes de la sesión (glance, brief, avisos, vincular…) no tienen
// el héroe del vivo: son texto por filas, y en un círculo cada fila tiene el
// ancho que le deja SU altura (`caja` de `kit-garmin/geometria`). Aquí viven
// las tres cosas que todas repiten:
//
//   · `textoEn`        un texto en una línea o, si no cabe, en dos (cortado por
//                      « · » antes que por un espacio), apilado desde `y`.
//   · `unaLinea`       una línea que baja de cuerpo hasta el suelo y, solo
//                      entonces, pierde partes por el final; dice si las perdió.
//   · `lineaAccion`    «START · Empezar»: la acción del momento, en naranja y
//                      con su tecla, como el «↶ UP · deshacer» del kit.
//   · `lineaPulso`     el pulso en el pie: «♥ 72», o «♥ —» (jamás un cero: G1, G7).
//
// Lo que NO se hace: colocar una fila sin preguntar a `caja` su ancho a esa
// altura; dar por buena una línea con `cabe` falso; escribir un `fontSize` o un
// número suelto (todo es `TG`, `AIRE`, `REJILLA` o una constante con nombre).
//
// PIEZAS GENÉRICAS: las usarán las demás familias de Garmin (y `garmin-correr`
// ya tiene su propia `bajo`). Tres usos = subirlas a `kit-garmin/`; el
// arquitecto consolida.

import { altoLinea, colocar, lineaDeDato, lineaDeTexto, type LineaG } from '../../kit-garmin/disponer';
import { REJILLA, caja, type Caja } from '../../kit-garmin/geometria';
import { ajustarPartes, type Tono } from '../../kit-garmin/medir';
import { AIRE, TG, cuerpoPx, type Cara } from '../../kit-garmin/tokens';

/** El alto de una línea de nota (fracción de D). */
export const ALTO_NOTA = altoLinea(TG.nota, 'nota');

/** Lo que devuelve apilar algo: las líneas y dónde acaba (fracción de D, con su aire). */
export interface Puesto {
  lineas: LineaG[];
  /** Dónde puede empezar lo siguiente. */
  fin: number;
  /** ¿Cabe todo, sin perder nada? */
  entero: boolean;
}

/** Dónde acaban unas líneas, en fracción de D, más el aire entre líneas. */
export const finDe = (lineas: LineaG[], D: number, desde: number): number =>
  lineas.length === 0 ? desde : Math.max(...lineas.map((l) => (l.y + l.alto) / D)) + AIRE.lineas;

/** Una caja con `margen` (fracción de D) menos de ancho: el aire que se deja dentro de un marco. */
const estrecha = (c: Caja, margen = 0): Caja => ({ ...c, ancho: Math.max(0, c.ancho - margen) });

/**
 * Un texto apilado desde `y`: una línea si cabe; si no, dos, cortado por « · »
 * antes que por un espacio. `prefijo` («Coach ·») va delante, en tinta2.
 */
export function textoEn(
  rol: string,
  texto: string,
  y: number,
  D: number,
  opciones: { frac?: number; tono?: Tono; cara?: Cara; prefijo?: string; margen?: number } = {},
): Puesto {
  const frac = opciones.frac ?? TG.nota;
  const alto = altoLinea(frac, 'texto');
  const una = estrecha(caja(y, alto), opciones.margen);
  const abajo = estrecha(caja(y + alto + AIRE.lineas, alto), opciones.margen);
  const lineas = lineaDeTexto(rol, texto, frac, D, { una, arriba: una, abajo }, { cara: opciones.cara ?? 'texto', tono: opciones.tono ?? 'tinta', prefijo: opciones.prefijo });
  return { lineas, fin: finDe(lineas, D, y), entero: lineas.every((l) => l.cabe) };
}

/**
 * Lo mismo pero PEGADO ABAJO: la última línea acaba en `hasta` (fracción de D).
 * Es como se apila el pie de una cara: lo de abajo manda y lo de arriba se aparta.
 */
export function textoHasta(
  rol: string,
  texto: string,
  hasta: number,
  D: number,
  opciones: { frac?: number; tono?: Tono; cara?: Cara; prefijo?: string; margen?: number } = {},
): Puesto & { inicio: number } {
  const alto = altoLinea(opciones.frac ?? TG.nota, 'texto');
  // Una línea si cabe; si no, dos: la de abajo acaba en `hasta`.
  const una = textoEn(rol, texto, hasta - alto, D, opciones);
  if (una.lineas.length === 1) return { ...una, fin: hasta, inicio: hasta - alto };
  const inicio = hasta - 2 * alto - AIRE.lineas;
  const dos = textoEn(rol, texto, inicio, D, opciones);
  return { ...dos, fin: hasta, inicio };
}

/**
 * Una línea (texto por partes) que baja de cuerpo hasta el suelo y, solo si ni
 * así cabe, pierde partes por el final. `entera` dice si conserva todas.
 */
export function unaLinea(rol: string, partes: readonly string[], frac: number, tono: Tono, y: number, D: number, cara: Cara = 'texto', margen = 0): { linea: LineaG; entera: boolean } {
  const c = estrecha(caja(y, altoLinea(frac, 'texto')), margen);
  const usadas = partes.filter(Boolean);
  const a = ajustarPartes(usadas, cara, frac, D, Math.floor(c.ancho * D));
  return {
    linea: colocar(rol, [{ texto: a.texto, cara, cuerpo: a.cuerpo, tono }], c, D, 'centro', a.cabe),
    entera: a.cabe && a.partes.length === usadas.length,
  };
}

/** «START · Empezar»: la acción del momento, con su tecla, en naranja (la de «↶ UP · deshacer»). */
export function lineaAccion(texto: string, y: number, D: number): LineaG {
  return colocar('accion', [{ texto, cara: 'texto', cuerpo: cuerpoPx(TG.nota, D), tono: 'accion' }], caja(y, ALTO_NOTA), D);
}

/** El pulso en el pie: el valor, o «—» si no hay lectura. Nunca un cero. */
export function lineaPulso(ppm: number | null, D: number): LineaG {
  return lineaDeDato('pie', { glifo: 'pulso', valor: ppm == null ? '—' : String(Math.round(ppm)), unidad: 'ppm' }, TG.tercero, 'pie', D, true);
}

/** Dónde empieza el pie (el pulso): abajo del todo. */
export const Y_PIE = REJILLA.pie[0];
/** Donde acaba lo de encima del pie: un respiro antes. */
export const HASTA_PIE = Y_PIE - AIRE.lineas * 3;
