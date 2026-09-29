// LAS PÁGINAS DE FUERZA EN EL CÍRCULO — Series (Vueltas) y Ejercicios
// (Estructura), PURAS. Datos, la tercera, es la `disponerDatos` del kit con las
// filas de `filas.ts`.
//
//   disponerSeries      las series hechas del ejercicio en curso, la última
//                       arriba: el número, lo anotado y una marca que dice si es
//                       declarado (punto) o propuesto (anillo).
//   colocarEjercicios   la sesión por ejercicios como una LISTA con ventana: cada
//                       bloque es su nombre (una o dos líneas) y su dosis; el
//                       estado va en un punto (hecho, ahora, por venir).
//   moverEjercicios     UP/DOWN dentro de la lista: mueven la ventana de uno en
//                       uno y, en el borde, devuelven `null` = pasa de página
//                       (§5: UP/DOWN son página anterior/siguiente).
//   arranqueEjercicios  la ventana con la que se entra a la página: la que tiene
//                       «ahora» dentro (y, si cabe, el ejercicio de antes).
//
// «Dónde estoy» no se pierde: el punto de «ahora» es blanco y lleno, y con la
// ventana movida el pie dice «▲ 3/7» o «▼ 3/7» (hacia dónde está y cuál es).
//
// Qué NO hacer: truncar un nombre (se parte en dos líneas o el bloque no se
// enseña en esa ventana); mover la ventana con «ahora» fuera sin decirlo.

import {
  AIRE,
  REJILLA,
  TG,
  ajustarPartes,
  altoLinea,
  anchoPiezas,
  caja,
  chica,
  colocar,
  cuerpoPx,
  cuerpoQueCabe,
  cuerposHaciaElSuelo,
  enSubconjunto,
  lineaDePartes,
  lineasContexto,
  partirEnLineas,
  repartir,
  type Disposicion,
  type LineaG,
  type Pieza,
} from '../../kit-garmin';
import { lineasNombre } from './caras';
import type { FilaEjercicio, FilaSerie } from './filas';

const ALTO_NOTA = altoLinea(TG.nota, 'nota');
const ALTO_CONTEXTO = altoLinea(TG.contexto, 'texto');

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

/**
 * LAS SERIES — la que se hace ahora, encima; luego las hechas, la última
 * primero. El ejercicio da nombre a la página (en una o dos líneas, como en la
 * serie: el nombre primero); si son dos o más (una superserie), «Series» y cada
 * fila lleva su hueco («A1·2»).
 */
export function disponerSeries(nombre: string | null, filas: FilaSerie[], D: number): Disposicion {
  const titulo = nombre ? lineasNombre(nombre, D) : { lineas: lineasContexto(['Series'], D, 'tinta2'), hasta: REJILLA.contexto[1] };
  const lineas: LineaG[] = [...titulo.lineas];
  // Las filas viven bajo el título y por encima del pie.
  const cuerpo = [Math.max(REJILLA.heroe[0], titulo.hasta + AIRE.piezas), REJILLA.secundaria[1]] as const;
  if (filas.length === 0) {
    lineas.push(colocar('vacia', [chica('Aún ninguna', D)], caja(0.5 - ALTO_NOTA / 2, ALTO_NOTA), D));
    return { D, lineas, heroe: null, pista: null };
  }
  const cajas = repartir(filas.length, altoLinea(TG.tercero, 'cifras'), cuerpo);
  filas.forEach((f, k) => {
    const c = cajas[k]!;
    const ancho = Math.floor(c.ancho * D);
    const ahora = f.estado === 'ahora';
    const marca: Pieza = ahora
      ? { texto: 'ahora', cara: 'nota', cuerpo: cuerpoPx(TG.nota, D), tono: 'tinta2', antes: AIRE.piezas * D }
      : { texto: '', cara: 'nota', cuerpo: cuerpoPx(TG.nota, D), tono: 'tinta2', glifo: f.estado === 'propuesta' ? 'pendiente' : 'hecho', antes: AIRE.piezas * D };
    const r = cuerpoQueCabe(
      (cuerpo) => [
        chica(f.n, D, ahora ? 'tinta' : 'tinta2'),
        { texto: f.valor, cara: enSubconjunto(f.valor) ? 'cifras' : 'texto', cuerpo, tono: f.estado === 'declarada' ? 'tinta' : 'tinta2', antes: AIRE.piezas * D },
        marca,
      ],
      TG.tercero,
      D,
      ancho,
    );
    lineas.push(colocar(ahora ? 'serie-ahora' : 'serie', r.piezas, c, D, 'centro', r.cabe));
  });
  return { D, lineas, heroe: null, pista: null };
}

// ---------------------------------------------------------------------------
// Ejercicios: la lista con ventana
// ---------------------------------------------------------------------------

/** Donde empieza la primera fila de la lista (fracción de D) y hasta dónde llega la última. */
const LISTA_DESDE = 0.25;
const LISTA_HASTA = REJILLA.secundaria[1];
/** El aire entre dos bloques. */
const AIRE_BLOQUES = AIRE.piezas;

export interface BloqueColocado {
  /** El índice de la fila en la lista. */
  k: number;
  lineas: LineaG[];
  alto: number;
}

function punto(f: FilaEjercicio, D: number): Pieza {
  return { texto: '', cara: 'nota', cuerpo: cuerpoPx(TG.nota, D), tono: 'tinta', glifo: f.estado };
}

/**
 * Un bloque en `y`: el punto y el nombre (en una línea si cabe, en dos si no) y
 * debajo su dosis. `null` si en ese sitio del círculo no cabe ni así: la
 * ventana acaba antes.
 */
export function colocarBloque(f: FilaEjercicio, y: number, D: number, forzar = false): BloqueColocado | null {
  const ahora = f.estado === 'ahora';
  const tonoNombre = ahora ? 'tinta' : 'tinta2';
  const aire = AIRE.piezas * D;
  const glifo = punto(f, D);
  const anchoGlifo = anchoPiezas([glifo]) + aire;
  const lineas: LineaG[] = [];
  let bloque = ALTO_CONTEXTO;

  const una = caja(y, ALTO_CONTEXTO);
  const a = ajustarPartes([f.nombre], 'texto', TG.contexto, D, Math.floor(una.ancho * D) - anchoGlifo);
  const pieza = (texto: string, cuerpo: number, primera: boolean): Pieza[] => [
    ...(primera ? [glifo] : []),
    { texto, cara: 'texto', cuerpo, tono: tonoNombre, antes: primera ? aire : 0 },
  ];
  if (a.cabe) {
    lineas.push(colocar('bloque', pieza(a.texto, a.cuerpo, true), una, D));
  } else {
    const dos = caja(y + ALTO_CONTEXTO, ALTO_CONTEXTO);
    let partido: [string, string] | null = null;
    let cuerpo = cuerpoPx(TG.suelo, D);
    for (const c of cuerposHaciaElSuelo(TG.contexto, D)) {
      partido = partirEnLineas(f.nombre, 'texto', c, [Math.floor(una.ancho * D) - anchoGlifo, Math.floor(dos.ancho * D)]);
      if (partido) {
        cuerpo = c;
        break;
      }
    }
    if (!partido && !forzar) return null;
    if (partido) {
      lineas.push(colocar('bloque', pieza(partido[0], cuerpo, true), una, D), colocar('bloque', pieza(partido[1], cuerpo, false), dos, D));
      bloque = 2 * ALTO_CONTEXTO;
    } else {
      // Ni en dos líneas: se dice (`cabe: false`) y los exámenes lo cazan; nunca se corta con «…».
      lineas.push(colocar('bloque', pieza(a.texto, a.cuerpo, true), una, D, 'centro', false));
    }
  }
  if (f.linea2) {
    const c = caja(y + bloque, ALTO_NOTA);
    const l = lineaDePartes('detalle', f.linea2.split(' · '), TG.nota, c, D, { cara: 'nota', tono: ahora ? 'tinta' : 'tinta2' });
    if (!forzar && !l.every((x) => x.cabe)) return null;
    lineas.push(...l);
    bloque += ALTO_NOTA;
  }
  return { k: -1, lineas, alto: bloque };
}

/** Las filas que caben desde `desde`, colocadas de arriba abajo. La primera se enseña aunque no quepa (nunca una página vacía). */
export function colocarEjercicios(filas: FilaEjercicio[], desde: number, D: number, y0 = LISTA_DESDE): BloqueColocado[] {
  const out: BloqueColocado[] = [];
  let y = y0;
  for (let k = desde; k < filas.length; k++) {
    const b = colocarBloque(filas[k]!, y, D, out.length === 0);
    if (!b || y + b.alto > LISTA_HASTA) {
      if (out.length === 0 && b) out.push({ ...b, k });
      break;
    }
    out.push({ ...b, k });
    y += b.alto + AIRE_BLOQUES;
  }
  return out;
}

/**
 * Los bloques de la ventana, con el aire que sobra repartido arriba y abajo (una
 * ventana de dos bloques no se queda pegada al título con un hueco al fondo).
 * Más abajo la cuerda es más corta: se baja lo que cabe SIN cambiar qué bloques
 * se ven ni cómo se parten.
 */
function centrarBloques(filas: FilaEjercicio[], desde: number, D: number): BloqueColocado[] {
  const base = colocarEjercicios(filas, desde, D);
  const ultimo = base[base.length - 1];
  if (!ultimo) return base;
  const yFin = ultimo.lineas.reduce((m, l) => Math.max(m, l.y + l.alto), 0) / D;
  const libre = LISTA_HASTA - yFin;
  for (const fraccion of [0.5, 0.25]) {
    const probado = colocarEjercicios(filas, desde, D, LISTA_DESDE + libre * fraccion);
    const igual = probado.length === base.length && probado.every((b, i) => b.k === base[i]!.k && b.lineas.length === base[i]!.lineas.length);
    if (igual && probado.every((b) => b.lineas.every((l) => l.cabe))) return probado;
  }
  return base;
}

/** La última fila que se ve con la ventana en `desde`. */
export const ultimoVisible = (filas: FilaEjercicio[], desde: number, D: number): number => {
  const b = colocarEjercicios(filas, desde, D);
  return b.length === 0 ? desde : b[b.length - 1]!.k;
};

/** La ventana con la que se entra: la que tiene a «ahora» dentro, empezando un ejercicio antes si cabe. */
export function arranqueEjercicios(filas: FilaEjercicio[], ahora: number, D: number): number {
  let desde = Math.max(0, ahora - 1);
  while (desde < ahora && ultimoVisible(filas, desde, D) < ahora) desde += 1;
  return desde;
}

/**
 * UP (`-1`) o DOWN (`1`) dentro de la lista: la ventana nueva, o `null` si ya
 * está en el borde (y entonces cambia de página, como manda §5).
 */
export function moverEjercicios(filas: FilaEjercicio[], desde: number, dir: 1 | -1, D: number): number | null {
  if (dir === 1) return ultimoVisible(filas, desde, D) >= filas.length - 1 ? null : desde + 1;
  return desde <= 0 ? null : desde - 1;
}

/** EL PIE: hacia dónde está «ahora» y cuál es: «▲ 3/7», «3/7» si se ve. */
export function pieEjercicios(ahora: number, primero: number, ultimo: number, total: number, D: number): LineaG {
  const flecha = ahora < primero ? '▲' : ahora > ultimo ? '▼' : null;
  const cuerpo = cuerpoPx(TG.nota, D);
  const piezas: Pieza[] = [];
  if (flecha) piezas.push({ texto: flecha, cara: 'cifras', cuerpo, tono: 'tinta' });
  piezas.push({ texto: `${ahora + 1}/${total}`, cara: 'cifras', cuerpo, tono: flecha ? 'tinta' : 'tinta2', antes: flecha ? AIRE.unidad * D : 0 });
  return colocar('posicion', piezas, caja(REJILLA.pie[0], altoLinea(TG.nota, 'cifras')), D);
}

/** LOS EJERCICIOS — la lista con su ventana en `desde`, «ahora» marcado y el pie que dice dónde estás. */
export function disponerEjercicios(filas: FilaEjercicio[], desde: number, ahora: number, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto(['Ejercicios'], D, 'tinta2')];
  const bloques = centrarBloques(filas, desde, D);
  for (const b of bloques) lineas.push(...b.lineas);
  if (bloques.length > 0) lineas.push(pieEjercicios(ahora, bloques[0]!.k, bloques[bloques.length - 1]!.k, filas.length, D));
  return { D, lineas, heroe: null, pista: null };
}
