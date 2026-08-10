// DAR FEEDBACK — de una gráfica marcada a una nota lista para publicar.
//
// El gesto que une las dos mitades de la tanda: el coach mira el tiempo en zonas
// de un atleta, marca los tramos que quiere señalar y pulsa un botón. Lo que sale
// no es un pantallazo: es una NOTA con una sección de gráfica que se dibuja sola
// con los datos de ese atleta y las marcas encima, más un capítulo en blanco para
// que escriba lo que ve.
//
// Vive aquí, sin React, porque es la pieza que decide QUÉ nota se monta —y eso
// es lo único de todo esto que se puede equivocar de verdad—: qué periodo se
// congela, qué marcas viajan y cómo se llaman las cosas. La pantalla sólo la
// llama.
//
// Client-safe: cero `server-only`, cero base de datos.

import type { RangeTone } from '@fahybrid/shared/domain/zone-chart';
import type { SegmentModality } from '@fahybrid/shared/domain/segment-modality';
import {
  borradorVacio,
  filaVacia,
  nuevaClave,
  type Borrador,
  type FilaBorrador,
  type RangoBorrador,
} from './del-coach-borrador';

/**
 * Los tres tonos, dichos para el COACH: no son etiquetas de calidad, son lo que
 * él quiere que el atleta entienda al ver esa banda de color. `neutro` existe
 * porque muchas veces sólo se está señalando dónde mirar, sin juicio.
 *
 * Aparte del rótulo que ve el atleta (`RANGE_TONE_LABEL`, en el dominio) por la
 * misma razón que `KIND_COACH_LABEL` vive aparte de `KIND_LABEL`: el que escribe
 * y el que lee no necesitan las mismas palabras.
 */
export const RANGE_TONE_COACH_LABEL: Record<RangeTone, string> = {
  atencion: 'Ojo aquí',
  bien: 'Así sí',
  neutro: 'Solo señalar',
};

/** En qué orden se ofrecen. El aviso primero porque es el que más se usa: se
 *  marca para corregir más que para felicitar. */
export const RANGE_TONE_ORDER: readonly RangeTone[] = ['atencion', 'bien', 'neutro'];

/** Con el que nace una marca recién dibujada. Neutro y no aviso: el coach acaba
 *  de señalar un tramo, todavía no ha dicho qué opina de él. */
export const RANGE_TONE_DEFAULT: RangeTone = 'neutro';

/** Cuántas semanas hay en un mes, de media. Para decir «seis meses» en vez de
 *  «veintiséis semanas», que es como lo dice un entrenador. */
const SEMANAS_POR_MES = 4.345;

/**
 * Cómo se titula la sección de la gráfica, dicho por su periodo. Se rellena para
 * que el compositor no se abra con una cabecera en blanco, y el coach la cambia
 * si quiere: es su nota.
 */
export function cabeceraDeGrafica(weeks: number): string {
  if (weeks >= 48) return 'Tu último año en zonas';
  const meses = Math.round(weeks / SEMANAS_POR_MES);
  if (meses <= 1) return 'Tus últimas semanas en zonas';
  return `Tus últimos ${meses} meses en zonas`;
}

/** Una marca nueva a partir de dos semanas tocadas, en el orden que sea: el
 *  coach puede marcar de derecha a izquierda y eso no es un error. */
export function nuevoRango(a: string, b: string): RangoBorrador {
  const [week_start, week_end] = a <= b ? [a, b] : [b, a];
  return { key: nuevaClave(), week_start, week_end, label: '', tone: RANGE_TONE_DEFAULT };
}

/**
 * La nota premontada que abre el compositor.
 *
 * Dos secciones y no una: la gráfica dice QUÉ pasó y el capítulo de texto dice
 * qué significa. Sin el segundo, el atleta recibiría un gráfico con unas bandas
 * de colores y ninguna frase — que es exactamente el pantallazo del que venimos.
 * Va vacío a propósito: eso es lo único que tiene que escribir el coach.
 *
 * El ancla nace en `plan` porque es donde el atleta espera encontrar algo que
 * habla de meses de entreno.
 */
export function notaDeFeedback(args: {
  week_start: string;
  weeks: number;
  modality: SegmentModality | null;
  rangos: readonly RangoBorrador[];
}): Borrador {
  const base = borradorVacio('note');
  const grafica: FilaBorrador = {
    ...filaVacia(),
    display: 'grafica',
    label: cabeceraDeGrafica(args.weeks),
    grafica: {
      week_start: args.week_start,
      weeks: args.weeks,
      modality: args.modality,
      // Copia: a partir de aquí las marcas son de la NOTA, y seguir editándolas
      // en la ficha no puede cambiar lo que está a punto de publicarse.
      ranges: args.rangos.map((r) => ({ ...r })),
    },
  };
  const explicacion: FilaBorrador = {
    ...filaVacia(),
    display: 'texto',
    label: 'Lo que veo',
    content: '',
  };

  return {
    ...base,
    title: cabeceraDeGrafica(args.weeks),
    anchor_kind: 'plan',
    sections: [grafica, explicacion],
  };
}
