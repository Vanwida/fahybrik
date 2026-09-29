// DISPONER — de un contenido (texto por partes, una línea de dato, un héroe)
// a una línea COLOCADA en el círculo, en píxeles del reloj. PURO.
//
// Toda cara del reloj se describe como una `Disposicion`: líneas colocadas
// (cada una con su caja, su ancho útil a esa altura y su ancho medido), un
// héroe y, si hay objetivo, la pista de la banda. La vista (`pintar.tsx`)
// solo la pinta; los tests la miden. Así «todo cabe a 218» se prueba sobre lo
// mismo que se ve, sin DOM.
//
// Qué NO hacer: colocar una línea sin pasar por aquí; decidir el héroe (eso es
// `laminaDelPaso` de `kit-reloj`); dar una línea por buena si `cabe` es falso.

import type { BandaVista, LineaVista } from '../kit-reloj/lamina';
import { cajaEnFila, caja as cajaLibre, type Caja, type Fila } from './geometria';
import {
  ESPACIO_EM,
  ajustarPartes,
  anchoPiezas,
  cuerpoQueCabe,
  enSubconjunto,
  partirEnLineas,
  tallaHeroe,
  type Pieza,
  type TallaHeroe,
  type Tono,
} from './medir';
import { AIRE, CAJA, TG, cuerpoPx, type Cara } from './tokens';

/** Una línea colocada. Todo en px del reloj. */
export interface LineaG {
  /** Qué es (lo leen los tests y el lector): «contexto», «nota», «pie»… */
  rol: string;
  piezas: Pieza[];
  y: number;
  alto: number;
  /** El ancho que deja el círculo a esa altura. */
  anchoUtil: number;
  /** Lo que mide la línea. */
  ancho: number;
  cabe: boolean;
  /** Centrada (lo normal) o a los extremos (el rótulo y la palabra de la banda). */
  reparto: 'centro' | 'extremos';
}

export interface HeroeG {
  texto: string;
  cara: Cara;
  unidad?: string;
  talla: TallaHeroe;
  tono: Tono;
  y: number;
  alto: number;
  anchoUtil: number;
}

/** La pista de la banda del objetivo (el calibre): px. */
export interface PistaG {
  banda: BandaVista;
  y: number;
  alto: number;
  ancho: number;
}

export interface Disposicion {
  D: number;
  lineas: LineaG[];
  heroe: HeroeG | null;
  pista: PistaG | null;
  /** El sello ✓ de un final (centro y talla, px). */
  sello?: { y: number; talla: number } | null;
  /** El marco de la opción enfocada de un menú (px): la acción del momento, en naranja. */
  marco?: { y: number; alto: number; ancho: number } | null;
}

export const vacia = (D: number): Disposicion => ({ D, lineas: [], heroe: null, pista: null });

// ---------------------------------------------------------------------------
// Colocar
// ---------------------------------------------------------------------------

/** Una caja en fracción de D, a píxeles (el ancho útil, a la baja: nunca se promete un píxel que no hay). */
function aPxCaja(c: Caja, D: number): { y: number; alto: number; anchoUtil: number } {
  return { y: c.y * D, alto: c.alto * D, anchoUtil: Math.floor(c.ancho * D) };
}

export function colocar(rol: string, piezas: Pieza[], c: Caja, D: number, reparto: LineaG['reparto'] = 'centro', cabe?: boolean): LineaG {
  const px = aPxCaja(c, D);
  const ancho = anchoPiezas(piezas);
  return { rol, piezas, ...px, ancho, cabe: cabe ?? ancho <= px.anchoUtil, reparto };
}

/** El alto (fracción de D) de una línea de `cara` a `frac`. */
export const altoLinea = (frac: number, cara: Cara) => frac * (cara === 'cifras' ? CAJA.cifras : CAJA.texto);

/** Una pieza de texto al suelo (etiquetas, unidades, notas). */
export function chica(texto: string, D: number, tono: Tono = 'tinta2', antes = 0): Pieza {
  return { texto, cara: 'nota', cuerpo: cuerpoPx(TG.nota, D), tono, antes };
}

// ---------------------------------------------------------------------------
// Texto por partes, y en dos líneas
// ---------------------------------------------------------------------------

/**
 * Una línea de texto por partes (la instrucción, dónde estabas): baja de
 * cuerpo hasta el suelo y luego quita partes por el final. Una sola.
 */
export function lineaDePartes(
  rol: string,
  partes: readonly string[],
  frac: number,
  c: Caja,
  D: number,
  opciones: { cara?: Cara; tono?: Tono } = {},
): LineaG[] {
  const cara = opciones.cara ?? 'texto';
  const tono = opciones.tono ?? 'tinta';
  const a = ajustarPartes(partes, cara, frac, D, Math.floor(c.ancho * D));
  return [colocar(rol, [{ texto: a.texto, cara, cuerpo: a.cuerpo, tono }], c, D, 'centro', a.cabe)];
}

/**
 * Un texto en una línea si cabe; si no, en dos cajas (`arriba`, `abajo`),
 * cortando por espacios. `prefijo` («Luego ·», «Viene:») va en tinta2
 * delante, y se queda en la primera línea.
 */
export function lineaDeTexto(
  rol: string,
  texto: string,
  frac: number,
  D: number,
  cajas: { una: Caja; arriba: Caja; abajo: Caja },
  opciones: { cara?: Cara; tono?: Tono; prefijo?: string } = {},
): LineaG[] {
  const cara = opciones.cara ?? 'nota';
  const tono = opciones.tono ?? 'tinta';
  const completo = opciones.prefijo ? `${opciones.prefijo} ${texto}` : texto;
  const cuerpo = cuerpoPx(frac, D);
  const piezas = conPrefijo(completo, opciones.prefijo, cara, cuerpo, tono);
  if (anchoPiezas(piezas) <= Math.floor(cajas.una.ancho * D)) return [colocar(rol, piezas, cajas.una, D)];
  return enDos(rol, completo, cara, cuerpo, tono, cajas.arriba, cajas.abajo, D, opciones.prefijo);
}

function conPrefijo(linea: string, prefijo: string | undefined, cara: Cara, cuerpo: number, tono: Tono): Pieza[] {
  if (!prefijo || !linea.startsWith(prefijo)) return [{ texto: linea, cara, cuerpo, tono }];
  const resto = linea.slice(prefijo.length).trimStart();
  const piezas: Pieza[] = [{ texto: prefijo, cara, cuerpo, tono: 'tinta2' }];
  if (resto) piezas.push({ texto: resto, cara, cuerpo, tono, antes: cuerpo * ESPACIO_EM });
  return piezas;
}

function enDos(rol: string, texto: string, cara: Cara, cuerpo: number, tono: Tono, arriba: Caja, abajo: Caja, D: number, prefijo?: string): LineaG[] {
  const anchos: [number, number] = [Math.floor(arriba.ancho * D), Math.floor(abajo.ancho * D)];
  const partido = partirEnLineas(texto, cara, cuerpo, anchos, prefijo);
  if (!partido) return [colocar(rol, conPrefijo(texto, prefijo, cara, cuerpo, tono), abajo, D, 'centro', false)];
  return [
    colocar(rol, conPrefijo(partido[0], prefijo, cara, cuerpo, tono), arriba, D),
    colocar(rol, [{ texto: partido[1], cara, cuerpo, tono }], abajo, D),
  ];
}

// ---------------------------------------------------------------------------
// Una línea de dato (la de `laminaDelPaso`: lo que falta, el pulso…)
// ---------------------------------------------------------------------------

/** Lo que una línea de dato puede sacrificar para caber, por este orden. El valor y el aviso, nunca. */
export interface Sacrificio {
  zona?: boolean;
  /** Solo si lleva glifo: «♥ 140» ya dice qué es sin «ppm». */
  unidad?: boolean;
  tendencia?: boolean;
}

/**
 * Las piezas de una `LineaVista` de la lámina a un cuerpo de valor. La
 * etiqueta, la unidad, la zona y el aviso van al suelo; el valor, en la cara
 * de cifras si la bitmap lo sabe pintar. `sin` quita lo sacrificado.
 */
export function piezasDeLinea(l: LineaVista, cuerpo: number, D: number, sin: Sacrificio = {}): Pieza[] {
  const aire = AIRE.piezas * D;
  const ps: Pieza[] = [];
  if (l.etiqueta) ps.push(chica(l.etiqueta, D));
  if (l.glifo === 'pulso') ps.push({ texto: '', cara: 'nota', cuerpo: cuerpoPx(TG.nota, D), tono: 'tinta2', glifo: 'pulso', antes: ps.length ? aire : 0 });
  const conAire = ps.length > 0;
  ps.push({ texto: l.valor, cara: enSubconjunto(l.valor) ? 'cifras' : 'texto', cuerpo, tono: 'tinta', antes: conAire ? aire / 2 : 0 });
  if (l.unidad && !(sin.unidad && l.glifo)) ps.push(chica(l.unidad, D, 'tinta2', AIRE.unidad * D));
  if (l.tendencia && !sin.tendencia) ps.push({ ...chica(l.tendencia === 'baja' ? '↓' : '↑', D, 'tinta', AIRE.unidad * D) });
  if (l.zona && !sin.zona) ps.push({ texto: `Z${l.zona.n}`, cara: 'texto', cuerpo: cuerpoPx(TG.nota, D), tono: { dato: l.zona.color }, antes: aire });
  if (l.aviso) ps.push({ texto: `${l.aviso.marca} ${l.aviso.texto}`, cara: 'texto', cuerpo: cuerpoPx(TG.nota, D), tono: 'tinta', antes: aire });
  return ps;
}

/**
 * Una línea de dato en su fila: el valor baja hasta el suelo antes de
 * sacrificar nada; luego se van, por este orden, la unidad (si el glifo ya
 * dice qué es: «♥ 140 Z4» antes que «♥ 140 ppm»), la marca de zona y la
 * tendencia. Nunca el valor ni el aviso. En el pie, la cuerda más corta, es
 * lo normal.
 */
export function lineaDeDato(rol: string, l: LineaVista, frac: number, donde: Fila | Caja, D: number, monocromo = false): LineaG {
  const c = typeof donde === 'string' ? cajaEnFila(donde, altoLinea(frac, 'cifras')) : donde;
  const ancho = Math.floor(c.ancho * D);
  const intentos: Sacrificio[] = [
    { zona: monocromo },
    { zona: monocromo, unidad: true },
    { zona: true, unidad: true },
    { zona: true, unidad: true, tendencia: true },
  ];
  for (const sin of intentos) {
    const r = cuerpoQueCabe((cu) => piezasDeLinea(l, cu, D, sin), frac, D, ancho);
    if (r.cabe) return colocar(rol, r.piezas, c, D);
  }
  return colocar(rol, piezasDeLinea(l, cuerpoPx(TG.suelo, D), D, intentos[intentos.length - 1]), c, D);
}

// ---------------------------------------------------------------------------
// El héroe
// ---------------------------------------------------------------------------

/**
 * El héroe en lo que queda de su franja (`desde`–`hasta`, fracción de D),
 * centrado. La cara la dice el texto: cifras si la bitmap lo pinta («3:52»,
 * «—»), sans si es una palabra («GO»).
 */
export function heroeEn(texto: string, unidad: string | undefined, desde: number, hasta: number, D: number, tono: Tono = 'tinta'): HeroeG {
  const cara: Cara = enSubconjunto(texto) ? 'cifras' : 'texto';
  const libre = cajaLibre(desde, hasta - desde);
  const talla = tallaHeroe(texto, cara, unidad, D, Math.floor(libre.ancho * D), libre.alto * D);
  const alto = talla.cuerpo * CAJA.cifras;
  const y = desde * D + (libre.alto * D - alto) / 2;
  return { texto, cara, unidad, talla, tono, y, alto, anchoUtil: Math.floor(libre.ancho * D) };
}

/** El alto (fracción de D) que se lleva una línea al suelo con su aire: para apilar sobre el héroe. */
export const altoNota = altoLinea(TG.nota, 'texto') + AIRE.lineas;
