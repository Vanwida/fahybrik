// LAS PIEZAS QUE SE REPITEN EN LAS CARAS DEL WOD — filas sobre la rejilla del
// círculo, PURAS: la cabeza (contexto + palabra sobre el héroe), la fila de la
// tarea con su carga, «Luego · …», la línea de acción en naranja, el pulso al pie
// y «lo otro» en cifras. Las usan `caras.ts` y `cuentaYFinal.ts`.
//
// La tarea con su carga NUNCA pierde la carga (pasa a dos líneas antes que
// quitarla). Todo cabe a 218: lo secundario baja de cuerpo o se va por prioridad.
//
// Qué NO hacer: escribir un tamaño, un color o un umbral aquí (TG, CG y el plan).

import {
  AIRE,
  REJILLA,
  TG,
  altoLinea,
  altoNota,
  anchoPiezas,
  ajustarPartes,
  caja,
  chica,
  colocar,
  contextoSinPerder,
  cuerpoPx,
  ESPACIO_EM,
  lineaDeDato,
  lineaDeTexto,
  lineasContexto,
  type LineaG,
  type Pieza,
  type Tono,
} from '../../kit-garmin';
import {
  lineaPulso,
  textoTareaCorto,
  type LineaVista,
  type Tarea,
} from '../../kit-reloj';
import type { VistaWod } from './estado';

export const ALTO_NOTA = altoLinea(TG.nota, 'nota');
export const ALTO_TERCERO = altoLinea(TG.tercero, 'texto');

/**
 * Cuánto sube la fila de la tarea sobre el borde de arriba de la banda: la barra
 * que drena el deshacer (kit) corre justo bajo la banda y, sin este aire, subraya
 * las letras con rabo («Wall Ball», «kg»). Nunca la sube al héroe (acaba en 0,60).
 */
const SUBE_TAREA = 0.012;
export const Y_TAREA = REJILLA.banda[0] - SUBE_TAREA;

/** Lo que cae por debajo de lo apilado (líneas en px) en fracción de D, con su aire. */
export const bajo = (lineas: LineaG[], D: number, desde: number) =>
  lineas.length === 0 ? desde : Math.max(...lineas.map((l) => (l.y + l.alto) / D)) + AIRE.lineas;

// ---------------------------------------------------------------------------
// Las filas que se repiten
// ---------------------------------------------------------------------------

/** Contexto (por partes, sin perder la posición) y, si la hay, la palabra sobre el héroe. `y` = donde empieza el héroe. */
export function cabeza(contexto: string[], etiqueta: string | null | undefined, D: number, esencial?: (parte: string) => boolean) {
  const lineas: LineaG[] = [...lineasContexto(contextoSinPerder(contexto, D, esencial), D)];
  let y = Math.max(REJILLA.heroe[0], bajo(lineas, D, REJILLA.heroe[0]));
  if (etiqueta) {
    const l = colocar('etiqueta', [chica(etiqueta, D)], caja(y, ALTO_NOTA), D);
    lineas.push(l);
    y = bajo([l], D, y);
  }
  return { lineas, y };
}

/**
 * LA FILA DE LA TAREA (la banda, o donde se diga): «6 Bench Press · 60 kg»,
 * «20 Wall Ball · 9 kg». Una línea al cuerpo que quepa; si ni al suelo cabe, en
 * DOS líneas al suelo, cortando por « · » (la carga se queda entera en la segunda).
 * Nunca se quita la carga: es lo que hay que poner en la barra.
 */
export function filaTarea(rol: string, texto: string, D: number, tono: Tono = 'tinta', desde?: number): { lineas: LineaG[]; fin: number } {
  const una = caja(desde ?? Y_TAREA, ALTO_TERCERO);
  const a = ajustarPartes([texto], 'texto', TG.tercero, D, Math.floor(una.ancho * D));
  if (a.cabe) return { lineas: [colocar(rol, [{ texto: a.texto, cara: 'texto', cuerpo: a.cuerpo, tono }], una, D)], fin: una.y + una.alto };
  const y0 = desde ?? Y_TAREA;
  const c = caja(y0, ALTO_NOTA);
  const lineas = lineaDeTexto(rol, texto, TG.nota, D, { una: c, arriba: c, abajo: caja(y0 + altoNota, ALTO_NOTA) }, { tono });
  return { lineas, fin: Math.max(...lineas.map((l) => (l.y + l.alto) / D)) };
}

/**
 * «Luego · …»: en UNA línea, la primera versión que quepa (la tarea entera, sin
 * carga, sólo el nombre). Es secundario: si ni el nombre cabe, no se pinta.
 * Va donde acaba lo de encima, sin bajar de la secundaria.
 */
export function filaLuego(candidatos: string[], D: number, desde: number): LineaG[] {
  const c = caja(Math.max(REJILLA.secundaria[0], desde), ALTO_NOTA);
  const cuerpo = cuerpoPx(TG.nota, D);
  for (const t of [...new Set(candidatos.filter(Boolean))]) {
    const piezas: Pieza[] = [
      { texto: 'Luego ·', cara: 'nota', cuerpo, tono: 'tinta2' },
      { texto: t, cara: 'nota', cuerpo, tono: 'tinta', antes: cuerpo * ESPACIO_EM },
    ];
    if (anchoPiezas(piezas) <= Math.floor(c.ancho * D)) return [colocar('luego', piezas, c, D)];
  }
  return [];
}

/** Una tarea en sus tres tallas, de la más completa a la que siempre cabe: con carga, sin carga, sólo el nombre. */
export const candidatosDeTarea = (t: Tarea, ventanaS?: number): string[] => [
  textoTareaCorto(t, ventanaS),
  textoTareaCorto({ ...t, carga: undefined }, ventanaS),
  t.nombre,
];

/** Una línea de acción en naranja («BACK · guardar»): lo que el atleta tiene que hacer AHORA. */
export function lineaDeAccion(rol: string, texto: string, D: number, desde: number): LineaG[] {
  const c = caja(Math.max(REJILLA.secundaria[0], desde), ALTO_NOTA);
  return [colocar(rol, [{ texto, cara: 'texto', cuerpo: cuerpoPx(TG.nota, D), tono: 'accion' }], c, D)];
}

/** El pulso al pie, con su zona (o sin ella: recuperación, descanso y campana son monocromos, P6). */
export function piePulso(v: VistaWod, D: number, monocromo = false): LineaG {
  return lineaDeDato('pie', lineaPulso(v.paso, v.lecturas, v.plan.zonas, v.plan.reglas), TG.tercero, 'pie', D, monocromo);
}

/**
 * «Lo otro» (la secundaria: lo que queda, las reps) en cifras. Va en su franja;
 * si la tarea de encima pasó a dos líneas y ya la ocupa, baja al cuerpo de la
 * tercera métrica justo debajo (nunca pisa, y nunca sube al héroe).
 */
export function filaSegundo(rol: string, dato: LineaVista, D: number, desde: number): LineaG {
  return desde <= REJILLA.secundaria[0] + AIRE.lineas
    ? lineaDeDato(rol, dato, TG.segundo, 'secundaria', D)
    : lineaDeDato(rol, dato, TG.tercero, caja(desde, altoLinea(TG.tercero, 'cifras')), D);
}
