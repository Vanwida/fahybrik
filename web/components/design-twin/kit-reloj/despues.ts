// LO QUE SE DECIDE AL TERMINAR — funciones PURAS (P9, P13; el Swift las espeja).
//
//   completitud        completa / parcial (con su motivo) / libre, decidida por
//                      lo HECHO — la auditoría encontró `.partial` cableado en
//                      dos sitios (P0-2). Nunca la decide la pantalla.
//   costeTrasEstacion  el coste de la carrera comprometida, SOLO con pares
//                      suficientes; si no, se dice por qué no (P10: va al
//                      resumen, no al vivo: el cálculo está sin validar).
//
// Lo que es MÉTODO (cuántos pares pide el coach, desde qué fracción una pieza
// cortada cuenta como hecha, cuánto tiempo quieto antes de guardar solo un
// enfriamiento libre) va en `MetodoResumen`, dato con defecto (HARD RULE Nº0).
//
// Una PIEZA es lo que se juzga: una serie (su vuelta) o un paso continuo (su
// parcial: una tirada, un tempo, una pista). Las dos se cortan igual: cerradas
// a mano por debajo del umbral del coach.

import { FEMENINO_DEFECTO, NOMBRE_CLASE_DEFECTO, type Objetivo, type Parcial, type PasoBase, type Vuelta } from './paso';
import { fmtDuracion, fmtPrescrito, principal } from './reglas';

// ---------------------------------------------------------------------------
// Método del coach — dato con defecto
// ---------------------------------------------------------------------------

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
  /**
   * Un parcial por paso cerrado (el que deja el motor al cerrarlo). Decide si
   * un paso CONTINUO —sin serie ni tramo— cerrado a mano llegó a lo
   * prescrito. Sin él (un resultado armado a mano), solo se juzgan las series.
   */
  parciales?: Parcial[];
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

/** Lo hecho de una pieza en la unidad de su medida: metros o segundos (reps y calorías no se cortan aquí). */
interface Pieza {
  segundos: number;
  metros: number | null;
}

const hechoDePieza = (p: PasoBase, x: Pieza) => (p.medida.tipo === 'distancia' ? x.metros : p.medida.tipo === 'tiempo' ? x.segundos : null);

/** ¿Es un paso continuo? Sin serie ni tramo que lo cuente: una tirada, un tempo, un rodaje. */
const esContinuo = (p: PasoBase) => !p.posicion?.serie && !p.posicion?.tramo && !p.posicion?.ronda;

function estadoPaso(r: HechoSesion, j: number, metodo: MetodoResumen): { estado: EstadoPieza; serie?: SerieHecha; pieza?: Pieza } {
  const p = r.pasos[j]!;
  if (j > r.i) return { estado: 'sin-llegar' };
  if (j === r.i && r.final === 'atleta') return { estado: 'sin-llegar' };
  const serie = r.series.find((s) => s.pasoId === p.id);
  // Un paso continuo no deja serie: lo que hizo es su parcial.
  const parcial = !serie && esContinuo(p) ? r.parciales?.find((x) => x.i === j) : undefined;
  const pieza: Pieza | undefined = serie ?? parcial;
  const pr = p.medida.prescrito;
  if (pieza && pr != null && pr > 0) {
    const hecho = hechoDePieza(p, pieza);
    if (hecho != null && hecho < pr * metodo.umbralHecho) return { estado: 'cortado', serie, pieza };
  }
  return { estado: 'hecho', serie, pieza };
}

/** «24′», «23″»: lo hecho de un paso por tiempo, al minuto por encima de dos (así se habla de una tirada). */
function fmtTiempoHecho(s: number): string {
  return s >= 120 ? fmtDuracion(Math.round(s / 60) * 60) : fmtDuracion(Math.round(s));
}

/**
 * Lo hecho de una pieza, dicho en la unidad de lo prescrito: «24′», «1200 m»
 * (de 3950 m), «8,23 km» (de 12 km). Con el mismo espacio duro que `fmtPrescrito`.
 */
function fmtHecho(p: PasoBase, x: Pieza): string {
  if (p.medida.tipo === 'distancia' && x.metros != null) {
    const enKm = fmtPrescrito(p.medida).endsWith('km');
    return enKm ? `${(x.metros / 1000).toFixed(2).replace('.', ',')} km` : `${Math.round(x.metros)} m`;
  }
  return fmtTiempoHecho(x.segundos);
}

/** «La tirada», «El tempo»: el paso continuo con su artículo (el género va con el nombre de la clase). */
function pasoConArticulo(p: PasoBase): string {
  const nombre = NOMBRE_CLASE_DEFECTO[p.clase].toLowerCase();
  return `${FEMENINO_DEFECTO.has(p.clase) ? 'La' : 'El'} ${nombre}`;
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
  if (primero.estado === 'cortado' && primero.pieza && !primero.serie) {
    // Un paso continuo cortado: la cuenta es lo hecho de lo prescrito («24′ de 80′»).
    const x = primero.pieza;
    const hasta = primero.p.medida.tipo === 'distancia' ? `en ${fmtHecho(primero.p, x)}` : `a los ${fmtTiempoHecho(x.segundos)}`;
    cuenta = `${fmtHecho(primero.p, x)} de ${fmtPrescrito(primero.p.medida)}`;
    motivo = `${pasoConArticulo(primero.p)} se cortó ${hasta}`;
  } else if (primero.estado === 'cortado' && primero.serie) {
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
