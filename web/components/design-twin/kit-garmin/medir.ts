// MEDIR Y AJUSTAR TEXTO SIN DOM — funciones PURAS, en píxeles del reloj.
//
// Una línea es una fila de PIEZAS (un número en la cara de cifras, su unidad
// en la sans, una etiqueta, un glifo), cada una con su cuerpo. Se mide con
// métricas fijas, igual en servidor y en cliente (el mismo motivo que
// `anchoTexto` de `kit-reloj`), y así los tests prueban lo que se pinta.
//
//   anchoCifras     la display de marca (Archivo Narrow 700), medida en el
//                   navegador el 29-09: todas las cifras a 0,46 em. La fuente
//                   no trae `tnum` (el «1» mide 0,42), así que el pintor fija
//                   cada cifra a 0,46 em: tabulares por construcción.
//   anchoEn         el ancho de un texto en su cara (cifras o sans del sistema).
//   ajustarPartes   el contexto: baja de cuerpo hasta el suelo ANTES de perder
//                   una parte; solo entonces quita por el final.
//   partirEnLineas  un texto que no cabe en una línea, en dos (cada una con su
//                   propio ancho: en un círculo, dos líneas no miden igual).
//   tallaHeroe      el héroe, el mayor de 0,20–0,26 D que cabe en su fila.
//
// Qué NO hacer: medir con el DOM (el servidor y los tests no lo tienen);
// encoger por debajo del suelo; truncar con «…» (un dato a medias no se pinta).

import { anchoTexto } from '../kit-reloj/tokens';
import { AIRE, CAJA, FUENTE, TG, cuerpoPx, type Cara } from './tokens';

/**
 * Lo que la bitmap de cifras del reloj sabe pintar: `0-9 : . ' " / + - ▲ ▼`
 * del modelo, más la coma decimal (las distancias en castellano: «2,18 km»)
 * y la raya del dato que no llega (G1: «—», jamás un cero).
 */
export const SUBCONJUNTO_CIFRAS = '0123456789:.\'"/+-▲▼,—';

/** Avance de una cifra (fijo: tabulares) y del resto del subconjunto, en em. */
export const CIFRA_EM = 0.46;
const AVANCE_CIFRAS: Record<string, number> = {
  ':': 0.27,
  ',': 0.23,
  '.': 0.23,
  "'": 0.2,
  '"': 0.39,
  '/': 0.23,
  '+': 0.48,
  '-': 0.27,
  '—': 0.82,
  '▲': 0.82,
  '▼': 0.82,
  ' ': 0.23,
};
/** El espacio entre dos palabras de la sans, en em (el de `anchoTexto`). */
export const ESPACIO_EM = 0.26;
/** Lo que la cursiva asoma por la derecha de la última cifra. */
const SOBRA_CURSIVA_EM = 0.08;
/**
 * Los glifos de una línea: el corazón del pulso y el punto de estado de una
 * fila de la Estructura (hecho, ahora, por venir). Su ancho, en em de su cuerpo.
 */
export type Glifo = 'pulso' | 'hecho' | 'ahora' | 'pendiente';
export const GLIFO_EM: Record<Glifo, number> = { pulso: 0.9, hecho: 0.6, ahora: 0.6, pendiente: 0.6 };

export const esCifra = (ch: string) => ch >= '0' && ch <= '9';

/** ¿Lo pinta la bitmap de cifras? (si no, es texto y va en la sans). */
export function enSubconjunto(texto: string): boolean {
  return [...texto].every((ch) => SUBCONJUNTO_CIFRAS.includes(ch));
}

/** El avance de un carácter de la cara de cifras, en em (las cifras, fijas: tabulares). */
export const avanceCifra = (ch: string): number => (esCifra(ch) ? CIFRA_EM : (AVANCE_CIFRAS[ch] ?? CIFRA_EM));

export function anchoCifras(texto: string, cuerpo: number): number {
  let em = 0;
  for (const ch of texto) em += avanceCifra(ch);
  return (em + (texto.length > 0 ? SOBRA_CURSIVA_EM : 0)) * cuerpo;
}

/** Lo que la cursiva asoma, para que el pintor le deje sitio. */
export const SOBRA_CURSIVA = SOBRA_CURSIVA_EM;

/** El ancho de un texto en su cara, en las unidades de `cuerpo`. */
export function anchoEn(cara: Cara, texto: string, cuerpo: number): number {
  return cara === 'cifras' ? anchoCifras(texto, cuerpo) : anchoTexto(texto, cuerpo, FUENTE[cara].peso);
}

// ---------------------------------------------------------------------------
// Piezas y líneas
// ---------------------------------------------------------------------------

/** El tono de una pieza: la tinta, la tinta2, la acción (naranja) o un color de dato (una zona). */
export type Tono = 'tinta' | 'tinta2' | 'accion' | { dato: string };

export interface Pieza {
  texto: string;
  cara: Cara;
  /** Cuerpo en px. */
  cuerpo: number;
  tono: Tono;
  /** Un glifo en vez de texto: el corazón del pulso, el punto de estado. */
  glifo?: Glifo;
  /** Aire a la izquierda, en px. */
  antes?: number;
}

export function anchoPieza(p: Pieza): number {
  const propio = p.glifo ? GLIFO_EM[p.glifo] * p.cuerpo : anchoEn(p.cara, p.texto, p.cuerpo);
  return propio + (p.antes ?? 0);
}

export function anchoPiezas(ps: readonly Pieza[]): number {
  return ps.reduce((a, p) => a + anchoPieza(p), 0);
}

// ---------------------------------------------------------------------------
// Ajustar
// ---------------------------------------------------------------------------

/**
 * Cuerpos a probar, de `frac` hacia el suelo, en px enteros (una bitmap no
 * tiene medios píxeles). El primero es el nominal; el último, el suelo.
 */
export function cuerposHaciaElSuelo(frac: number, D: number): number[] {
  const alto = cuerpoPx(frac, D);
  const suelo = cuerpoPx(TG.suelo, D);
  return Array.from({ length: Math.max(1, alto - suelo + 1) }, (_, k) => alto - k);
}

/**
 * EL CONTEXTO (y todo lo que va por partes): baja de cuerpo hasta el suelo
 * antes de perder una parte; solo si ni al suelo cabe, quita por el final.
 * Devuelve el texto, su cuerpo y si ha cabido (una sola parte que no cabe
 * se devuelve al suelo con `cabe: false`: la vista la parte en dos líneas).
 */
export function ajustarPartes(
  partes: readonly string[],
  cara: Cara,
  frac: number,
  D: number,
  ancho: number,
): { texto: string; cuerpo: number; partes: string[]; cabe: boolean } {
  let usadas = partes.filter(Boolean);
  const cuerpos = cuerposHaciaElSuelo(frac, D);
  while (usadas.length > 0) {
    const texto = usadas.join(' · ');
    for (const c of cuerpos) if (anchoEn(cara, texto, c) <= ancho) return { texto, cuerpo: c, partes: usadas, cabe: true };
    if (usadas.length === 1) break;
    usadas = usadas.slice(0, -1);
  }
  const texto = usadas.join(' · ');
  return { texto, cuerpo: cuerpos[cuerpos.length - 1]!, partes: usadas, cabe: false };
}

/** El separador de partes de un texto del kit («Serie 2/5 · Wall Ball · 12 reps»). */
const SEPARADOR = '·';

/**
 * Parte un texto en dos líneas (cada una con su ancho), por espacios. Antes
 * que nada corta por un separador « · » (y lo quita: «Wall Ball» no se parte
 * en dos); solo si ningún corte así cabe, por cualquier espacio. Entre los
 * que caben, el que menos aprieta la línea más apretada. `null` si ninguno.
 * `prefijo` («Luego ·», «Viene:») va siempre entero al principio de la primera.
 */
export function partirEnLineas(
  texto: string,
  cara: Cara,
  cuerpo: number,
  anchos: readonly [number, number],
  prefijo?: string,
): [string, string] | null {
  const cabeza = prefijo && texto.startsWith(prefijo) ? prefijo : '';
  const palabras = texto.slice(cabeza.length).trim().split(' ');
  if (cabeza) palabras[0] = `${cabeza} ${palabras[0]}`;
  const mejorDe = (cortes: Array<[string, string]>) =>
    cortes
      .map((l) => ({ l, aprieto: Math.max(anchoEn(cara, l[0], cuerpo) / anchos[0], anchoEn(cara, l[1], cuerpo) / anchos[1]) }))
      .filter((x) => x.aprieto <= 1)
      .sort((a, b) => a.aprieto - b.aprieto)[0]?.l ?? null;
  const porSeparador: Array<[string, string]> = [];
  const porEspacio: Array<[string, string]> = [];
  for (let k = 1; k < palabras.length; k++) {
    if (palabras[k] === SEPARADOR && k < palabras.length - 1) porSeparador.push([palabras.slice(0, k).join(' '), palabras.slice(k + 1).join(' ')]);
    if (palabras[k] !== SEPARADOR && palabras[k - 1] !== SEPARADOR) porEspacio.push([palabras.slice(0, k).join(' '), palabras.slice(k).join(' ')]);
  }
  return mejorDe(porSeparador) ?? mejorDe(porEspacio);
}

/** El mayor cuerpo (del nominal al suelo) al que una línea de piezas cabe en `ancho`; las piezas escalan juntas. */
export function cuerpoQueCabe(construir: (cuerpo: number) => Pieza[], frac: number, D: number, ancho: number): { piezas: Pieza[]; cabe: boolean } {
  const cuerpos = cuerposHaciaElSuelo(frac, D);
  for (const c of cuerpos) {
    const piezas = construir(c);
    if (anchoPiezas(piezas) <= ancho) return { piezas, cabe: true };
  }
  return { piezas: construir(cuerpos[cuerpos.length - 1]!), cabe: false };
}

// ---------------------------------------------------------------------------
// El héroe
// ---------------------------------------------------------------------------

export interface TallaHeroe {
  cuerpo: number;
  cuerpoUnidad: number;
  /** Ancho total (número + aire + unidad), px. */
  ancho: number;
  /** ¿Ha cabido dentro de 0,20–0,26 D? Si no, se escala lo justo para no desbordar, y los tests lo cazan. */
  cabe: boolean;
}

/**
 * EL HÉROE ajustado a su fila: el mayor cuerpo de 0,20–0,26 D que cabe en
 * `ancho` con su unidad y en `alto` de caja. Si ni a 0,20 cabe, se escala lo
 * justo antes que desbordar (un número que se sale del reloj es peor que uno
 * pequeño) y lo dice: la cara que llega ahí tiene que cambiar de formato.
 */
export function tallaHeroe(texto: string, cara: Cara, unidad: string | undefined, D: number, ancho: number, alto: number): TallaHeroe {
  const max = Math.round(TG.heroe.max * D);
  const min = Math.round(TG.heroe.min * D);
  const medir = (c: number): TallaHeroe => {
    const cu = unidad ? Math.max(cuerpoPx(TG.suelo, D), Math.round(c * TG.unidad)) : 0;
    const w = anchoEn(cara, texto, c) + (unidad ? AIRE.unidad * D + anchoEn('texto', unidad, cu) : 0);
    return { cuerpo: c, cuerpoUnidad: cu, ancho: w, cabe: true };
  };
  for (let c = max; c >= min; c -= 1) {
    const m = medir(c);
    if (m.ancho <= ancho && c * CAJA.cifras <= alto) return m;
  }
  const m = medir(min);
  const k = Math.min(1, ancho / m.ancho, alto / (min * CAJA.cifras));
  return { ...m, cuerpo: m.cuerpo * k, ancho: m.ancho * k, cabe: false };
}
