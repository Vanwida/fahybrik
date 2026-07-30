// LAS PÁGINAS QUE SE REPITEN — escritas una vez, no nueve.
//
// Siete de las nueve vistas tienen una página de pulso, y todas tienen que
// resolver la misma pregunta incómoda: **hoy no hay ancla de FC de nadie**
// (`datos-reloj.ts`, hecho 1), así que hay que saber pintar el pulso sin zona.
// Si eso lo decide cada vista, siete vistas se inventan siete maneras de decir
// «no lo sabemos» — que es exactamente cómo aparecieron las tres grafías del
// ritmo que motivaron el CONTRATO-UI §2.
//
// Puro a propósito (sin JSX): los guiones de las nueve lo usan y `vitest` puede
// comprobar sus páginas sin montar un DOM.

import { hrZone } from '../sim';
import { clock } from './formato';
import { W, zoneColor } from '../screens/watch-live/theme';
import { NOTA, ZONA_NOMBRE, zonaConAncla, type Ancla, type Modo, type PaginaReloj, type Zona } from './modelo';

/** La zona de un pulso contra el ancla del atleta. `null` = no hay ancla. */
export function zonaDe(bpm: number | null, ancla: Ancla): Zona | null {
  return zonaConAncla(bpm, ancla, hrZone);
}

/**
 * EL TINTE DEL LIENZO. La regla del §10.1 en un solo sitio, para que ninguna
 * vista pueda saltársela: **sin ancla de FC no hay zona, y sin zona no hay
 * color.** Fondo neutro. El color es un dato.
 */
export function tinteDe(bpm: number | null, ancla: Ancla): string | null {
  const z = zonaDe(bpm, ancla);
  return z == null ? null : zoneColor(z);
}

/**
 * LA PÁGINA DEL PULSO. El reloj mide el pulso SIEMPRE que lo lleves puesto —
 * el sensor es suyo, no depende de máquinas ni de GPS— así que esta página
 * existe en las nueve vistas y casi nunca falta.
 *
 * Lo que sí falta es contra qué compararlo:
 *  · con ancla  → «Z4 fuerte» y el color de la zona;
 *  · sin ancla  → ppm crudos y una nota que dice por qué no hay zona. NO se
 *    inventa una banda sobre la FC máxima teórica: eso es pintar una suposición
 *    con cara de medida (§7).
 *  · sin pulso  → esta página NO SE PINTA. Devuelve `null` y la vista se queda
 *    con una página menos, que es lo honesto (§6.2 bis: un valor medido no
 *    existe hasta que se mide).
 */
export function paginaPulso({
  bpm,
  ancla,
  modo = 'ojeada',
  contexto = 'Pulso',
}: {
  bpm: number | null;
  ancla: Ancla;
  modo?: Modo;
  contexto?: string;
}): PaginaReloj | null {
  if (bpm == null) return null;
  const z = zonaDe(bpm, ancla);
  return {
    id: 'pulso',
    contexto,
    modo,
    sujeto: { texto: String(bpm) },
    // «ppm» es la unidad (§3, jamás «bpm»), y va de segundo nivel y no pegada
    // a la cifra: pegada le robaría al numeral el ancho de tres glifos, que en
    // un lienzo de 188 pt son 20 pt de altura de cifra.
    segundo: z == null ? { valor: 'ppm' } : { valor: `Z${z} ${ZONA_NOMBRE[z]}`, tono: zoneColor(z) },
    nota: ancla == null ? NOTA.sinAncla : ancla.estimado ? NOTA.umbralEstimado : undefined,
  };
}

/**
 * LA PÁGINA DEL TIEMPO. Es la página que queda cuando no queda nada más — sin
 * máquina emparejada y sin GPS, el reloj sabe qué hora es y poco más. Por eso
 * es la degradación final de la cinta, del ergo y del For Time.
 */
export function paginaTiempo({
  segundos,
  modo = 'ojeada',
  contexto = 'Llevas',
  nota,
}: {
  segundos: number;
  modo?: Modo;
  contexto?: string;
  nota?: string;
}): PaginaReloj {
  return {
    id: 'tiempo',
    contexto,
    modo,
    sujeto: { texto: clock(segundos) },
    nota,
  };
}

/**
 * El tono de una cuenta atrás que se acaba. El naranja de marca aquí NO es
 * decoración ni color de dato: es el aviso de que se te acaba, y sólo aparece
 * en los últimos segundos.
 */
export function tonoUrgente(quedaS: number, umbralS = 3): string | undefined {
  return quedaS <= umbralS ? W.orange : undefined;
}
