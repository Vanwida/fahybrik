// G28 · RPE — cómo de dura ha sido, de 0 a 10, con su palabra. PURA.
//
// Tras guardar. UP sube, DOWN baja, START confirma y BACK lo salta: un RPE
// omitido viaja como NULO, nunca inventado (`perceived_exertion: null`). Empieza
// en «—»: el número es del atleta, no una sugerencia que lo ancle; hasta que
// elige uno no hay nada que confirmar (START no rotula) y solo se puede omitir.
//
//   contexto «¿Cómo de dura?» · EL NÚMERO (héroe, «—» hasta elegir) ·
//   la escala 0–10 (una pista de 11 tramos: los llenos son lo elegido) ·
//   la palabra («fuerte») o, sin elegir, qué botones lo mueven.
//
// Las palabras de cada valor son del coach (dato con defecto,
// `RPE_PALABRA_DEFECTO`): entran por parámetro. Aquí no hay «Salud»: es del
// Apple Watch. El RPE va a NUESTRO servidor con la sesión; a Garmin Connect no
// se promete nada (H11).
//
// Qué NO hacer: proponer un valor de partida; escribir una palabra del RPE en
// la cara (salen de `palabras`); rellenar un RPE omitido.

import type { BandaVista } from '../../kit-reloj/lamina';
import { RPE_PALABRA_DEFECTO } from '../../kit-reloj/tokens';
import { CG, PISTA, REJILLA, TG, altoLinea, caja, cajaEnFila, heroeEn, lineaDePartes, lineasContexto, type LineaG, type PistaG } from '../../kit-garmin';
import { apilarTexto, type DisposicionFin } from './comun';

/** De 0 a 10: once valores, once tramos. */
export const RPE_MIN = 0;
export const RPE_MAX = 10;

/** «Sube con UP…» mientras no hay valor: qué botones lo mueven (los rótulos de la carcasa dicen el resto). */
export const INSTRUCCION_RPE = 'UP y DOWN';

/** Un valor movido un paso (+1 con UP, −1 con DOWN), sin salirse de la escala. Desde «—», UP entra en 1 y DOWN en 0. */
export function moverRpe(valor: number | null, dir: 1 | -1): number {
  if (valor == null) return dir === 1 ? RPE_MIN + 1 : RPE_MIN;
  return Math.min(RPE_MAX, Math.max(RPE_MIN, valor + dir));
}

/** La escala: 11 tramos, los de 0 al valor llenos. */
function escala(valor: number | null, D: number): PistaG {
  const banda: BandaVista = {
    eje: 'rpe',
    desde: 0,
    hasta: 1,
    marca: null,
    veredicto: null,
    rotulo: '',
    palabra: null,
    zonas: { colores: Array.from({ length: RPE_MAX - RPE_MIN + 1 }, () => CG.tinta), objetivo: valor == null ? [0, 0] : [1, valor - RPE_MIN + 1] },
  };
  const c = cajaEnFila('banda', PISTA.alto + PISTA.hueco);
  return { banda, y: c.y * D, alto: PISTA.alto * D, ancho: Math.floor(c.ancho * D) };
}

export function disponerRpe(valor: number | null, D: number, palabras: Record<number, string> = RPE_PALABRA_DEFECTO): DisposicionFin {
  const lineas: LineaG[] = [...lineasContexto(['¿Cómo de dura?'], D, 'tinta2')];
  const heroe = heroeEn(valor == null ? '—' : String(valor), undefined, REJILLA.heroe[0], REJILLA.heroe[1], D, valor == null ? 'tinta2' : 'tinta');
  const [dS] = REJILLA.secundaria;
  const palabra = valor == null ? INSTRUCCION_RPE : (palabras[valor] ?? '');
  const tono = valor == null ? 'tinta2' : 'tinta';
  // La palabra, grande y en una línea; si es del coach y es larga, al suelo y en las que haga falta.
  const una = lineaDePartes('palabra', [palabra], TG.tercero, caja(dS, altoLinea(TG.tercero, 'texto')), D, { tono });
  lineas.push(...(una.every((l) => l.cabe) ? una : apilarTexto('palabra', palabra, dS, TG.nota, D, { tono }).lineas));
  return { D, lineas, heroe, pista: escala(valor, D) };
}
