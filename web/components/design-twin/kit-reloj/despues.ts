// LO QUE SE DECIDE AL TERMINAR — funciones PURAS (P9, P13; el Swift las espeja).
//
//   completitud        completa / parcial (con su motivo) / libre, decidida por
//                      lo HECHO — la auditoría encontró `.partial` cableado en
//                      dos sitios (P0-2). Nunca la decide la pantalla.
//   costeTrasEstacion  el coste de la carrera comprometida, SOLO con pares
//                      suficientes; si no, se dice por qué no (P10: va al
//                      resumen, no al vivo: el cálculo está sin validar).
//
// Lo que es MÉTODO (cuántos pares pide el coach, desde qué fracción una serie
// cortada cuenta como hecha, cuánto tiempo quieto antes de guardar solo un
// enfriamiento libre) va en `MetodoResumen`, dato con defecto (HARD RULE Nº0).

import { NOMBRE_CLASE_DEFECTO, type Objetivo, type PasoBase, type Vuelta } from './paso';
import { fmtDuracion, principal } from './reglas';

// ---------------------------------------------------------------------------
// Método del coach — dato con defecto
// ---------------------------------------------------------------------------

export interface MetodoResumen {
  /** Pares (km tras estación ↔ km fresco a la misma banda) que hacen falta para dar el coste. */
  paresMinimos: number;
  /** Fracción de lo prescrito a partir de la cual una serie cortada a mano cuenta como hecha. */
  umbralHecho: number;
  /**
   * Tras «Seguir» (enfriamiento libre), segundos sin moverse y sin tocar nada
   * antes de guardar la sesión sola (Alex, 25-09): nadie se queda con el
   * reloj grabando un enfriamiento que ya acabó.
   */
  guardarQuietoS: number;
}

export const METODO_RESUMEN_DEFECTO: MetodoResumen = { paresMinimos: 4, umbralHecho: 0.9, guardarQuietoS: 600 };

// ---------------------------------------------------------------------------
// Lo hecho — lo mínimo que decide la completitud
// ---------------------------------------------------------------------------

/** Una serie o tramo de carrera cerrado, con el paso al que pertenece. */
export interface SerieHecha extends Vuelta {
  pasoId: string;
}

/** Lo hecho de una sesión, lo justo para decidir si está completa. */
export interface HechoSesion {
  pasos: PasoBase[];
  /** El último paso al que llegó. */
  i: number;
  /** Final natural (el motor cerró el último paso) o el atleta terminó antes. */
  final: 'natural' | 'atleta';
  series: SerieHecha[];
}

export interface Completitud {
  estado: 'completa' | 'parcial' | 'libre';
  /** «6 de 6 series», «5 de 5 rondas», «22 de 22 series»: la cuenta del bloque que manda. */
  cuenta: string | null;
  /** Por qué es parcial: «Terminaste en la serie 5 de 6», «La serie 3 se cortó en 620 m». */
  motivo: string | null;
}

const ARTICULO: Record<string, string> = { serie: 'la', tramo: 'el', stride: 'el', cuesta: 'la', ronda: 'la', estación: 'la' };

function nombrePosicion(p: PasoBase): { nombre: string; n: number; de: number } | null {
  const pos = p.posicion;
  if (pos?.ronda) return { nombre: 'ronda', n: pos.ronda.n, de: pos.ronda.de };
  const c = pos?.serie ?? pos?.tramo;
  if (!c) return null;
  const nombre = pos?.tramo ? 'tramo' : p.clase === 'fuerza' || p.clase === 'estacion' ? 'serie' : NOMBRE_CLASE_DEFECTO[p.clase].toLowerCase();
  return { nombre, n: c.n, de: c.de };
}

const conArticulo = (nombre: string) => `${ARTICULO[nombre] ?? 'el'} ${nombre}`;
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type EstadoPieza = 'hecho' | 'cortado' | 'sin-llegar';

function estadoPaso(r: HechoSesion, j: number, metodo: MetodoResumen): { estado: EstadoPieza; serie?: SerieHecha } {
  const p = r.pasos[j]!;
  if (j > r.i) return { estado: 'sin-llegar' };
  if (j === r.i && r.final === 'atleta') return { estado: 'sin-llegar' };
  const serie = r.series.find((s) => s.pasoId === p.id);
  const pr = p.medida.prescrito;
  if (serie && pr != null && pr > 0) {
    const hecho = p.medida.tipo === 'distancia' ? serie.metros : p.medida.tipo === 'tiempo' ? serie.segundos : null;
    if (hecho != null && hecho < pr * metodo.umbralHecho) return { estado: 'cortado', serie };
  }
  return { estado: 'hecho', serie };
}

/**
 * ¿Completa? Toda pieza de trabajo de la parte principal hecha (una serie
 * cortada a mano cuenta si llega al umbral del coach). Sin nada prescrito que
 * cumplir (correr libre), no es ni completa ni parcial: es libre.
 */
export function completitud(r: HechoSesion, metodo: MetodoResumen = METODO_RESUMEN_DEFECTO): Completitud {
  const principales = r.pasos
    .map((p, j) => ({ p, j }))
    .filter((x) => x.p.rol === 'trabajo' && x.p.fase === 'principal' && x.p.medida.tipo !== 'abierta');
  if (principales.length === 0) return { estado: 'libre', cuenta: null, motivo: null };

  const estados = principales.map((x) => ({ ...x, ...estadoPaso(r, x.j, metodo) }));
  const primero = estados.find((e) => e.estado !== 'hecho');

  // La cuenta: por rondas si el circuito las tiene; si no, las series del
  // bloque donde se rompió (o del primero con series, si todo va bien).
  let cuenta: string | null = null;
  const conRonda = estados.filter((e) => e.p.posicion?.ronda);
  if (conRonda.length > 0) {
    const rondas = new Map<number, boolean>();
    conRonda.forEach((e) => rondas.set(e.p.posicion!.ronda!.n, (rondas.get(e.p.posicion!.ronda!.n) ?? true) && e.estado === 'hecho'));
    const hechas = [...rondas.values()].filter(Boolean).length;
    cuenta = `${hechas} de ${rondas.size} rondas`;
  } else {
    // Una sesión de fuerza cuenta todas sus series; una de correr, las del
    // bloque donde se rompió (o el primero con series): «4 de 6 series».
    const fuerza = estados.every((e) => e.p.clase === 'fuerza' || e.p.clase === 'estacion');
    const bloque = (primero ?? estados.find((e) => nombrePosicion(e.p)))?.p.bloque;
    const del = estados.filter((e) => nombrePosicion(e.p) && (fuerza || e.p.bloque === bloque));
    if (del.length > 0) cuenta = `${del.filter((e) => e.estado === 'hecho').length} de ${del.length} series`;
  }

  if (!primero) return { estado: 'completa', cuenta, motivo: null };

  const pos = nombrePosicion(primero.p);
  const quien = pos ? `${conArticulo(pos.nombre)} ${pos.n} de ${pos.de}` : null;
  let motivo: string;
  if (primero.estado === 'cortado' && primero.serie) {
    const s = primero.serie;
    const hasta = primero.p.medida.tipo === 'distancia' && s.metros != null ? `en ${s.metros} m` : `a los ${fmtDuracion(s.segundos)}`;
    motivo = `${quien ? mayus(quien) : 'Un paso'} se cortó ${hasta}`;
  } else {
    motivo = quien ? `Terminaste en ${quien}` : `Terminaste en ${NOMBRE_CLASE_DEFECTO[primero.p.clase].toLowerCase()}`;
  }
  return { estado: 'parcial', cuenta, motivo };
}

// ---------------------------------------------------------------------------
// La carrera comprometida — el coste, solo con pares suficientes
// ---------------------------------------------------------------------------

/** Un tramo del circuito: cada carrera y cada estación es su propia vuelta (P10). */
export interface TramoHecho {
  paso: PasoBase;
  ronda: number;
  segundos: number;
  metros: number | null;
  /** La estación que acaba de hacer antes de esta carrera; `null` = llega fresco. */
  tras: string | null;
}

export type Coste =
  | { estado: 'hay'; seg: number; fresco: number; tras: number; pares: number }
  | { estado: 'faltan'; pares: number; minimo: number }
  | { estado: 'sin-fresco'; pares: number };

const ritmoDe = (t: TramoHecho) => (t.metros ? t.segundos / (t.metros / 1000) : null);
const mismaBanda = (a: Objetivo | null, b: Objetivo | null) => !!a && !!b && a.eje === b.eje && a.min === b.min && a.max === b.max;

/**
 * «Tus km tras estación: +14 s/km sobre tu fresco.» Un par = un tramo de
 * carrera justo tras una estación y un tramo fresco a la MISMA banda del coach.
 * El cálculo sigue sin validar (Alex, 25-09): por eso va al resumen y no al
 * vivo, y por eso no se da con menos pares de los que pide el coach.
 */
export function costeTrasEstacion(tramos: TramoHecho[], metodo: MetodoResumen = METODO_RESUMEN_DEFECTO): Coste {
  const carreras = tramos.filter((t) => t.paso.clase === 'carrera' && ritmoDe(t) != null);
  const frescos = carreras.filter((t) => t.tras == null);
  const tras = carreras.filter((t) => t.tras != null && frescos.some((f) => mismaBanda(principal(f.paso), principal(t.paso))));
  const pares = tras.length;
  if (frescos.length === 0) return { estado: 'sin-fresco', pares: carreras.filter((t) => t.tras != null).length };
  if (pares < metodo.paresMinimos) return { estado: 'faltan', pares, minimo: metodo.paresMinimos };
  const media = (xs: TramoHecho[]) => xs.reduce((a, t) => a + ritmoDe(t)!, 0) / xs.length;
  const fresco = media(frescos);
  const comprometido = media(tras);
  return { estado: 'hay', seg: Math.round(comprometido - fresco), fresco, tras: comprometido, pares };
}
