// LA ESTRUCTURA EN EL BRIEF (G02) — la sesión REAL del coach, en el círculo. PURO.
//
// «6 × 1000 m a 3:45–3:55 · r 90″ trote», no «N bloques» (P13). El texto sale de
// `filasDePasos` + `lineaBrief` de `kit-reloj`: el MISMO que la esfera, el brief
// de la muñeca y la página Estructura del vivo. Aquí solo se decide CÓMO CABE.
//
// En un círculo de 218 no cabe todo lo que cabe en una muñeca de Apple, así que
// la estructura se aprieta de la versión más rica a la más apretada y se queda con
// la primera que cabe SIN PERDER NADA, medida en cada uno de los cuatro relojes:
//
//   completo         cada bloque en dos líneas: qué (grande) y contra qué / cuánto
//                    descansa (pequeño), y el cue del coach donde lo puso (M8).
//   título completo  el bloque que da nombre a la sesión sigue así; los demás, en su
//                    forma mínima.
//   mínimo           cada bloque en la forma más corta que lo dice entero: una línea si
//                    cabe; si no, dos, cortadas por « · » (nunca a mitad de un dato).
//   resumen          si ni así caben todos: el bloque que da nombre a la sesión, GRANDE
//                    (entero, con su carga y su descanso), y una línea «4 bloques · 45′ ↓»
//                    con la pista de la tecla: DOWN abre la Estructura completa, la
//                    misma lista con ventana que la página Estructura del vivo.
//
// Nada se cae en silencio ni se trunca con «+ n más»: o está pintado entero, o cuenta
// en el «N bloques» y se ve entero con DOWN. Solo si ni el título entero cabe (no pasa
// en las sesiones reales) se pierden partes por el final, y el examen lo dice.
//
// UNA SOLA DURACIÓN: sale de `duracionHumana` (por `hoyDe`). Con toda la estructura a la
// vista va arriba, en «Hoy · 65′»; en el resumen va en la línea de los bloques y
// arriba solo queda «Hoy»: jamás dos duraciones en el mismo brief.
//
// Qué NO hacer: escribir aquí un nombre de clase o un ritmo (salen de `lineaBrief`);
// truncar con «…» (un dato a medias no se pinta); meter más filas de las que caben
// por no llegar a «resumen».

import { duracionHumana, filasDePasos, grupoPrincipal, lineaBrief, type PasoBase } from '../../kit-reloj';
import type { LineaG } from '../../kit-garmin/disponer';
import type { Tono } from '../../kit-garmin/medir';
import { AIRE, TG } from '../../kit-garmin/tokens';
import { finDe, textoEn, unaLinea, type Puesto } from './filas';

export type Peso = 'titulo' | 'normal' | 'suave';

/** Un bloque de la sesión tal como lo escribió el coach, con su peso en la cara. */
export interface Bloque {
  linea: string;
  detalle: string | null;
  cue: string | null;
  peso: Peso;
  /** Todo lo que dice, por partes y por orden de importancia (para ponerlo en una sola línea): la línea, las partes del detalle y el cue. */
  partes: string[];
}

/** El cue del coach en una línea con lo demás: «Coach: mirar el pulso» (con su prefijo aparte, en el bloque completo, es «Coach · …»). */
const cueEnUna = (cue: string) => `Coach: ${cue}`;

/** Los bloques de un plan: el que da nombre a la sesión es el título; el calentamiento y la vuelta a la calma, lo suave. */
export function bloquesDelBrief(pasos: PasoBase[]): Bloque[] {
  const grupos = filasDePasos(pasos);
  if (grupos.length === 0) return [];
  const titular = grupoPrincipal(grupos);
  return grupos.map((g) => {
    const b = lineaBrief(g);
    const peso: Peso = g === titular ? 'titulo' : g.paso.fase === 'principal' ? 'normal' : 'suave';
    return {
      linea: b.linea,
      detalle: b.detalle,
      cue: b.cue,
      peso,
      partes: [b.linea, ...(b.detalle ? b.detalle.split(' · ') : []), ...(b.cue ? [cueEnUna(b.cue)] : [])],
    };
  });
}

export type NivelEstructura = 'completo' | 'titulo-completo' | 'minimo' | 'resumen' | 'apretado';

/** La duración de la sesión, como la dice todo el brief (una sola fuente). */
export const duracionDelBrief = (pasos: PasoBase[]): string => duracionHumana(pasos);

export interface EstructuraPuesta {
  lineas: LineaG[];
  /** Bloques que no se pintan (los cuenta la línea del resumen y los enseña la Estructura completa). */
  ocultos: number;
  nivel: NivelEstructura;
  /** Los bloques que están pintados, en orden. */
  visibles: number[];
  /** ¿Cabe todo dentro de su alto y de su cuerda, sin perder nada de lo pintado? */
  cabe: boolean;
}

/** El cuerpo de cada peso en su forma completa: el título manda, lo suave se aparta. */
const FRAC_COMPLETO: Record<Peso, number> = { titulo: TG.tercero, normal: TG.contexto, suave: TG.nota };
/** El cuerpo de cada peso en su forma mínima: el título baja un escalón para no comerse el círculo. */
const FRAC_MINIMO: Record<Peso, number> = { titulo: TG.contexto, normal: TG.nota, suave: TG.nota };
const TONO: Record<Peso, Tono> = { titulo: 'tinta', normal: 'tinta', suave: 'tinta2' };
/** El aire entre un bloque y el siguiente: un cuarto más que entre líneas, para que se lean como bloques. */
const ENTRE_BLOQUES = AIRE.lineas * 1.25;

/** La línea del resumen: cuántos bloques, cuánto dura y la tecla que los enseña. Son partes: si no cabe, se pierde primero la pista, nunca la duración. */
export const partesDelResumen = (n: number, duracion: string): string[] => [`${n} bloques`, `${duracion} ↓`];

/** Un bloque en su forma completa: qué (grande), contra qué (pequeño, una o dos líneas) y el cue del coach. */
function bloqueCompleto(b: Bloque, y: number, D: number): Puesto {
  const frac = FRAC_COMPLETO[b.peso];
  const primera = unaLinea('bloque', [b.linea], frac, TONO[b.peso], y, D);
  let lineas = [primera.linea];
  let entero = primera.entera;
  if (!primera.entera) {
    // Un nombre largo del coach: en dos líneas, cortado por palabras.
    const dos = textoEn('bloque', b.linea, y, D, { frac, tono: TONO[b.peso] });
    lineas = dos.lineas;
    entero = dos.entero;
  }
  let fin = finDe(lineas, D, y);
  if (b.detalle) {
    const d = textoEn('detalle', b.detalle, fin, D, { frac: TG.nota, tono: 'tinta2' });
    lineas = [...lineas, ...d.lineas];
    fin = d.fin;
    entero &&= d.entero;
  }
  if (b.cue) {
    const c = textoEn('cue', b.cue, fin, D, { frac: TG.nota, tono: 'tinta', prefijo: 'Coach ·' });
    lineas = [...lineas, ...c.lineas];
    fin = c.fin;
    entero &&= c.entero;
  }
  return { lineas, fin, entero };
}

/**
 * Un bloque en su forma mínima: TODO lo que dice, en una línea si cabe; si no, la
 * línea (qué) y debajo lo demás (contra qué, cortado por « · » si hace falta), en su
 * tono de segundo plano.
 */
function bloqueMinimo(b: Bloque, y: number, D: number): Puesto {
  const frac = FRAC_MINIMO[b.peso];
  const una = unaLinea('bloque', b.partes, frac, TONO[b.peso], y, D);
  if (una.entera) return { lineas: [una.linea], fin: finDe([una.linea], D, y), entero: true };
  const cabeza = unaLinea('bloque', [b.linea], frac, TONO[b.peso], y, D);
  const resto = b.partes.slice(1);
  if (!cabeza.entera || resto.length === 0) return textoEn('bloque', b.partes.join(' · '), y, D, { frac, tono: TONO[b.peso] });
  const detalle = textoEn('detalle', resto.join(' · '), finDe([cabeza.linea], D, y), D, { frac: TG.nota, tono: 'tinta2' });
  return { lineas: [cabeza.linea, ...detalle.lineas], fin: detalle.fin, entero: detalle.entero };
}

type Forma = (b: Bloque) => 'completo' | 'minimo';

/** Las formas, de más rica a más apretada. */
const FORMAS: ReadonlyArray<{ nivel: NivelEstructura; forma: Forma }> = [
  { nivel: 'completo', forma: () => 'completo' },
  { nivel: 'titulo-completo', forma: (b) => (b.peso === 'titulo' ? 'completo' : 'minimo') },
  { nivel: 'minimo', forma: () => 'minimo' },
];

interface Intento {
  lineas: LineaG[];
  fin: number;
  cabe: boolean;
  /** ¿Cada bloque dice todo lo que trae? */
  enteros: boolean[];
}

/** Apila los bloques con la forma de cada uno; `fin` es dónde acaba (con el aire de detrás). */
function apilar(bloques: Bloque[], y0: number, D: number, forma: Forma): Intento {
  let y = y0;
  const lineas: LineaG[] = [];
  const enteros: boolean[] = [];
  bloques.forEach((b, k) => {
    const yb = k === 0 ? y : y + ENTRE_BLOQUES - AIRE.lineas;
    const p = forma(b) === 'completo' ? bloqueCompleto(b, yb, D) : bloqueMinimo(b, yb, D);
    lineas.push(...p.lineas);
    y = p.fin;
    enteros.push(p.entero);
  });
  return { lineas, fin: y, cabe: lineas.every((l) => l.cabe), enteros };
}

/**
 * La estructura ENTERA del brief, entre `y0` e `y1` (fracción de D): la forma más
 * rica que cabe en este reloj sin perder nada de lo que se pinta. `null` si ni en
 * su forma mínima caben todos los bloques (entonces, el resumen).
 */
export function disponerEstructuraEntera(bloques: Bloque[], y0: number, y1: number, D: number): EstructuraPuesta | null {
  const todos = bloques.map((_, k) => k);
  for (const { nivel, forma } of FORMAS) {
    const i = apilar(bloques, y0, D, forma);
    if (i.cabe && i.enteros.every(Boolean) && i.fin - AIRE.lineas <= y1) return { lineas: i.lineas, ocultos: 0, nivel, visibles: todos, cabe: true };
  }
  return null;
}

/**
 * El RESUMEN: el bloque titular, entero y grande, y debajo «4 bloques · 45′ ↓».
 * Es lo que se pinta cuando la sesión no cabe entera. Si ni el titular en su
 * forma mínima cabe con su línea (no pasa en las sesiones reales), cada bloque en
 * una línea y perdiendo partes por el final (`apretado`), y el examen lo dice.
 */
export function disponerEstructuraResumen(bloques: Bloque[], duracion: string, y0: number, y1: number, D: number): EstructuraPuesta {
  const titular = Math.max(0, bloques.findIndex((b) => b.peso === 'titulo'));
  const ocultos = bloques.length - 1;
  for (const { forma } of FORMAS) {
    const parte = apilar([bloques[titular]!], y0, D, forma);
    const resumen = unaLinea('resumen', partesDelResumen(bloques.length, duracion), TG.nota, 'tinta2', parte.fin + ENTRE_BLOQUES - AIRE.lineas, D);
    const fin = finDe([resumen.linea], D, parte.fin);
    if (parte.cabe && parte.enteros.every(Boolean) && resumen.entera && fin - AIRE.lineas <= y1) {
      return { lineas: [...parte.lineas, resumen.linea], ocultos, nivel: 'resumen', visibles: [titular], cabe: true };
    }
  }
  const apretado = apilar(bloques, y0, D, () => 'minimo');
  return { lineas: apretado.lineas, ocultos: 0, nivel: 'apretado', visibles: bloques.map((_, k) => k), cabe: apretado.cabe && apretado.fin - AIRE.lineas <= y1 };
}
