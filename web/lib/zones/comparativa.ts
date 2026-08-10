// LA ARITMÉTICA DE LA COMPARATIVA — dos periodos, en porcentajes y en diferencias.
//
// Todo lo que esta pieza puede equivocar es cuenta: qué parte del total ocupa
// cada zona, cuántos puntos ha subido, cuánto tiempo son esos puntos y por cuánto
// se divide para decir «por semana». Vive aquí, suelto del dibujo, porque así se
// prueba con un test de verdad en vez de mirando la pantalla.
//
// LAS DOS REGLAS QUE MANDAN
//
// 1) EL REPARTO SE COMPARA EN PORCENTAJE, no en horas. Aunque las dos ventanas
//    midan lo mismo (y aquí siempre lo miden), lo que dice si un atleta ha movido
//    su entreno es qué PROPORCIÓN ocupa cada zona. Las horas siguen a la vista
//    porque sitúan, y su diferencia también, pero el titular es el reparto.
//
// 2) UNA SEMANA SIN DATO NO ES UNA SEMANA A CERO. Por eso «por semana» divide
//    entre las semanas CON DATO y no entre las de la ventana: dividir entre
//    trece cuando sólo se midieron cinco convertiría «no lo sabemos» en «no
//    entrenó». La pantalla dice cuántas son, siempre.
//
// EL DELTA NO OPINA. Ni verde ni rojo: que subir Z1 esté bien lo dice el coach
// con su texto, no el sistema con un color (CLAUDE.md, HARD RULE Nº0). Aquí sólo
// se calcula el signo, que es un hecho.
//
// NO lleva 'server-only': lo importa el navegador.

import {
  COMPARE_TRIMESTRE_WEEKS,
  type ZoneComparePeriodDTO,
  type ZoneComparisonDTO,
} from '@fahybrid/shared/domain/zone-compare';
import { addWeeks, formatDuration, mondayOf, ZONE_PART_KEYS, type ZonePartKey } from '@/lib/zones/chart';

/** El signo de una diferencia, en carácter de menos (U+2212) y no en guion: es un
 *  número negativo, no una separación. El cero no lleva signo. */
const MENOS = '−';

/** Por debajo de esto, dos repartos son el mismo reparto: medio punto de
 *  diferencia sobre tres meses es ruido de redondeo, no un cambio de entreno. */
const PUNTOS_QUE_CUENTAN = 0.5;

/**
 * De cuánto puede ser cada lado cuando el coach elige el periodo a mano. Cuatro
 * escalones y no un campo de número: lo que compara un entrenador son meses, y
 * dejarle escribir «17 semanas» sólo sirve para que las dos ventanas acaben
 * midiendo cosas raras. Los atajos calculan su propio largo y no pasan por aquí.
 */
export const COMPARE_WINDOWS: ReadonlyArray<{ weeks: number; label: string }> = [
  { weeks: 4, label: '1 mes' },
  { weeks: 8, label: '2 meses' },
  { weeks: 13, label: '3 meses' },
  { weeks: 26, label: '6 meses' },
];

/** Los dos periodos que se están mirando, tal cual viajan por el cable y tal
 *  cual se guardan en una sección con forma de comparativa. */
export interface ParDePeriodos {
  a_start: string;
  b_start: string;
  weeks: number;
}

/**
 * Con qué par se arranca cuando nadie ha elegido: el trimestre anterior contra
 * éste, terminando en la última semana CERRADA.
 *
 * La semana en curso se queda fuera a propósito. Va a medias por definición, y
 * meterla hundiría la media de horas del lado reciente por una razón que no tiene
 * nada que ver con el atleta.
 */
export function parPorDefecto(hoyIso = new Date().toISOString().slice(0, 10)): ParDePeriodos {
  const ultimaCerrada = addWeeks(mondayOf(hoyIso), -1);
  const b_start = addWeeks(ultimaCerrada, -(COMPARE_TRIMESTRE_WEEKS - 1));
  return {
    a_start: addWeeks(b_start, -COMPARE_TRIMESTRE_WEEKS),
    b_start,
    weeks: COMPARE_TRIMESTRE_WEEKS,
  };
}

export interface ComparePart {
  key: ZonePartKey;
  seconds: number;
  /** Qué parte del total ocupa, de 0 a 1. Cero cuando no hay total. */
  share: number;
}

/**
 * Las seis partes de un periodo con su peso. Salen TODAS, también las que están a
 * cero: el dibujo decide cuáles no ocupan ancho, y la lista de diferencias
 * necesita las dos puntas aunque una de ellas no exista.
 */
export function partesDe(p: ZoneComparePeriodDTO): ComparePart[] {
  return ZONE_PART_KEYS.map((key) => {
    const seconds = segundosDe(p, key);
    return { key, seconds, share: p.total_s > 0 ? seconds / p.total_s : 0 };
  });
}

function segundosDe(p: ZoneComparePeriodDTO, key: ZonePartKey): number {
  const raw = key === 'no_hr' ? p.no_hr_s : p[`${key}_s`];
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * Los segundos de una semana MEDIDA. Divide entre las semanas con dato y no entre
 * las de la ventana, y por eso la pantalla tiene que decir cuántas son: sin esa
 * línea, media ventana sin medir parecería media ventana sin entrenar.
 */
export function porSemanaMedida(p: ZoneComparePeriodDTO): number {
  return p.weeks_with_data > 0 ? p.total_s / p.weeks_with_data : 0;
}

export interface CompareDelta {
  key: ZonePartKey;
  /** Puntos porcentuales que gana (o pierde) esa zona, de `a` a `b`. */
  pts: number;
  /** Y esos puntos, en tiempo. */
  seconds: number;
}

/** Cuánto se ha movido cada zona, del ANTES al DESPUÉS. */
export function deltasDe(c: ZoneComparisonDTO): CompareDelta[] {
  const antes = new Map(partesDe(c.a).map((p) => [p.key, p]));
  return partesDe(c.b).map((despues) => {
    const previo = antes.get(despues.key)!;
    return {
      key: despues.key,
      pts: (despues.share - previo.share) * 100,
      seconds: despues.seconds - previo.seconds,
    };
  });
}

/**
 * ¿Se pueden comparar estos dos periodos?
 *
 * Hace falta dato MEDIDO en los dos lados. Con uno vacío, el reparto del otro no
 * se compara con nada: se compararía con un cero que significa «no sabemos», y el
 * resultado sería «lo ha cambiado todo» dicho sobre una ausencia de medición.
 */
export function sePuedeComparar(c: ZoneComparisonDTO): boolean {
  return c.a.total_s > 0 && c.b.total_s > 0;
}

/** Cuál de los dos lados se quedó sin nada que contar. Vacío si los dos tienen. */
export function ladosSinDato(c: ZoneComparisonDTO): Array<'a' | 'b'> {
  const faltan: Array<'a' | 'b'> = [];
  if (c.a.weeks_with_data === 0) faltan.push('a');
  if (c.b.weeks_with_data === 0) faltan.push('b');
  return faltan;
}

// ── PALABRAS ─────────────────────────────────────────────────────────────────

/** «+19 pts», «−2 pts», «igual». */
export function fraseDePuntos(pts: number): string {
  if (Math.abs(pts) < PUNTOS_QUE_CUENTAN) return 'igual';
  const n = Math.round(Math.abs(pts));
  return `${pts > 0 ? '+' : MENOS}${n} pts`;
}

/** «+1h 20m», «−45m», «igual». */
export function fraseDeTiempo(seconds: number): string {
  // Menos de un minuto de diferencia sobre meses de entreno no es una diferencia.
  if (Math.abs(seconds) < 60) return 'igual';
  return `${seconds > 0 ? '+' : MENOS}${formatDuration(Math.abs(seconds))}`;
}

/**
 * La cobertura de un periodo, dicha entera. Es la línea que impide que la
 * comparación se lea como si los dos lados se hubieran medido igual.
 */
export function fraseDeCobertura(p: ZoneComparePeriodDTO, weeks: number): string {
  if (p.weeks_with_data === 0) return `Sin dato de ninguna de las ${weeks} semanas`;
  if (p.weeks_with_data >= weeks) return `Las ${weeks} semanas con dato`;
  return `${p.weeks_with_data} de ${weeks} semanas con dato`;
}

/**
 * Qué es el número grande de un periodo: «por semana» cuando la ventana está
 * medida entera, «por semana medida» cuando no. El matiz no es decoración — con
 * cinco semanas de trece medidas, ese número NO es su media semanal.
 *
 * Sin el número dentro a propósito: la cifra va en grande y aparte, y repetirla
 * aquí la diría dos veces en la misma línea.
 */
export function fraseDeCadencia(p: ZoneComparePeriodDTO, weeks: number): string {
  if (p.weeks_with_data === 0) return 'sin volumen medido';
  return p.weeks_with_data >= weeks ? 'por semana' : 'por semana medida';
}
