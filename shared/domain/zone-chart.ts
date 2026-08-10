// @fahybrid/shared/domain/zone-chart — LA GRÁFICA DE TIEMPO EN ZONAS, FIRMADA.
//
// El contrato de la gráfica que el coach embebe en una nota: qué periodo
// enseña, con qué filtro, qué le salió al atleta dentro y qué marcó él encima.
//
// Vive aparte del comunicado —igual que `plan-path` con el camino— porque no es
// del comunicado: es de las ZONAS. La misma pieza dibuja la ficha del coach, la
// nota que le llega al atleta y sus analíticas de iOS, y el día que se embeba en
// otro sitio (un informe, la comparativa por periodos) el contrato ya está.
//
// LO QUE NO SE GUARDA
// -------------------
// Las barras. Lo que se guarda es la CONFIG —ventana, filtro y rangos— y el
// servidor las resuelve con los segundos por zona de ESE atleta al servirla. Si
// se guardaran, una nota escrita hoy seguiría contando los datos de hoy aunque
// mañana llegara el entreno que faltaba o se recomputara el histórico con un
// umbral medido. Es la misma lección que el camino: lo que puede desfasarse no
// se guarda, se resuelve.
//
// LA VENTANA ES ABSOLUTA
// ----------------------
// Un lunes y un número de semanas, no «los últimos seis meses». Los rangos que
// el coach marca son FECHAS, así que una ventana que se moviera con el reloj —o
// con la fecha de publicación de un borrador escrito la semana anterior— dejaría
// su marca más vieja fuera de su propia gráfica.

import type { HrAnchorSource } from './methodology';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from './dates';

// ---------------------------------------------------------------------------
// Cómo marca el coach
// ---------------------------------------------------------------------------

/**
 * Los tres tonos de una marca. Tres, y son tres porque es la FORMA DE MARCAR y
 * no una escala de calidad: qué reparto de zonas está bien lo dice el coach con
 * su etiqueta, no el sistema con un color (CLAUDE.md, HARD RULE Nº0). Cerrado a
 * propósito — con un color libre, dos marcas del mismo coach dejarían de querer
 * decir lo mismo.
 */
export const RANGE_TONES = ['atencion', 'bien', 'neutro'] as const;
export type RangeTone = (typeof RANGE_TONES)[number];

/**
 * El tono, dicho para el ATLETA: lo que oye quien no ve el color. `neutro` no se
 * pinta — una marca que sólo señala no gana nada por decir «neutro», igual que
 * un comunicado que no cuelga de nada no gana nada por decir «general».
 */
export const RANGE_TONE_LABEL: Record<RangeTone, string | null> = {
  atencion: 'Ojo aquí',
  bien: 'Así sí',
  neutro: null,
};

// ---------------------------------------------------------------------------
// Los límites de la pieza
// ---------------------------------------------------------------------------

/**
 * La ventana, en semanas. Menos de un mes no dibuja una tendencia: son cuatro
 * barras y de ahí no se firma nada. Más de un año no se lee ni en una pantalla
 * ancha ni, mucho menos, en su móvil.
 */
export const GRAFICA_MIN_WEEKS = 4;
export const GRAFICA_MAX_WEEKS = 56;

/** Cuántas marcas caben encima antes de que la gráfica deje de leerse. Seis es
 *  el mismo techo que un reparto y por la misma razón: a partir de ahí ya no se
 *  ve de un vistazo, que es lo único que sabe hacer mejor que una frase. */
export const GRAFICA_MAX_RANGES = 6;

/** «Sierra: todo a tope, nada de base» son 34. La etiqueta va ENCIMA de la
 *  gráfica, así que lo que no cabe en una línea no cabe en ningún sitio. */
export const MAX_RANGE_LABEL_CHARS = 48;

// ---------------------------------------------------------------------------
// Aritmética de la ventana
//
// Las tres fechas del modelo —el arranque de la ventana y las dos puntas de un
// rango— son LUNES. Una semana empieza en lunes en todo el producto y la
// agregación de zonas trunca por semana: una fecha a media semana dibujaría una
// primera barra a medias y una marca que empieza donde no empieza ninguna barra.
// ---------------------------------------------------------------------------

/** ¿Esa fecha es el lunes de su semana? */
export function esLunesIso(iso: string): boolean {
  try {
    return isoDateString(mondayOfWeek(parseIsoDate(iso))) === iso;
  } catch {
    return false;
  }
}

/** El LUNES de la última semana de una ventana, ambas puntas inclusive: una
 *  ventana de una semana empieza y acaba en el mismo lunes. */
export function finDeVentana(week_start: string, weeks: number): string {
  return isoDateString(addDays(parseIsoDate(week_start), (Math.max(1, weeks) - 1) * 7));
}

/**
 * ¿La marca cae ENTERA dentro de la ventana?
 *
 * Se exporta porque la necesitan los dos: el esquema, para rechazarla, y el
 * compositor, para señalar la etiqueta que se quedó fuera cuando el coach acorta
 * la ventana. Ahí la marca no se borra ni se recorta —las dos cosas cambiarían
 * en silencio lo que el coach señaló— sino que se avisa y él decide.
 */
export function rangoDentroDeVentana(
  ventana: { week_start: string; weeks: number },
  rango: { week_start: string; week_end: string },
): boolean {
  return (
    rango.week_end >= rango.week_start &&
    rango.week_start >= ventana.week_start &&
    rango.week_end <= finDeVentana(ventana.week_start, ventana.weeks)
  );
}

// ---------------------------------------------------------------------------
// El contrato de lectura (snake_case — convención Swift Codable)
// ---------------------------------------------------------------------------

/** Los segundos de una semana, repartidos. `no_hr_s` es el tiempo MEDIDO que no
 *  se pudo repartir: el entreno llegó sin pulso, o el atleta no tiene umbral. */
export interface ZoneWeekSecondsDTO {
  /** Lunes de la semana, en la zona horaria del atleta. */
  week_start: string;
  z1_s: number;
  z2_s: number;
  z3_s: number;
  z4_s: number;
  z5_s: number;
  no_hr_s: number;
  total_s: number;
}

/** Una marca del coach: de qué semana a qué semana, cómo se llama y cómo la
 *  marcó. Ambas puntas inclusive — una semana suelta es `week_start === week_end`. */
export interface ZoneRangeDTO {
  week_start: string;
  week_end: string;
  label: string;
  tone: RangeTone;
}

/**
 * La gráfica resuelta, lista para dibujar sin una consulta más.
 *
 * `weeks_data` trae SÓLO las semanas con dato. Una semana ausente no es un cero:
 * un cero dice «no entrenó» y la ausencia dice «de esa semana no sabemos», y el
 * cliente dibuja un hueco en vez de una barra a ras de suelo. Reconstruir el eje
 * entero es del cliente, que sabe de cuánto dispone para pintarlo.
 */
export interface ZoneChartDTO {
  week_start: string;
  weeks: number;
  /** Por qué tipo de entreno se filtró, o null si es todo el volumen. */
  modality: string | null;
  weeks_data: ZoneWeekSecondsDTO[];
  /** Con qué umbral se repartió. Null = el atleta no tiene ancla, y entonces
   *  todo lo medido cae en «sin zona»: la pantalla tiene que poder decirlo. */
  anchor: { source: HrAnchorSource; lthr_bpm: number } | null;
  ranges: ZoneRangeDTO[];
}
