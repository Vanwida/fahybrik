// LA BASAL — UNA, para la variabilidad, el pulso en reposo y el sueño
// (docs/analiticas/modelo.md §3 fila 8, y los fallos P3 y P16).
//
// POR QUÉ UNA SOLA FUNCIÓN
// ------------------------
// Hasta el 29-09-2026 «tu variabilidad frente a tu normal» se calculaba en seis
// sitios con seis ventanas: el readiness en días locales (60 → 14), el roster,
// el barrido de avisos y la ficha del coach en instantes UTC desde «ahora», la
// lectura de agosto corrida un día, y la tendencia de disposición con otra
// cuenta de instantes. El mismo atleta podía estar «por debajo de su basal» en
// la ficha y «en su normal» en su teléfono el mismo día. Aquí se decide UNA vez
// qué es la basal, y todos la piden aquí.
//
// LA DEFINICIÓN (la del readiness, que es el defecto que ya estaba en uso):
//
//   basal     = media de las muestras de los días LOCALES del atleta que van
//               de `hoy − dias` a `hoy − excluir − 1`, ambos incluidos. Con el
//               defecto del método (60 → 14): 46 días, dejando fuera los 14
//               anteriores a hoy y hoy mismo, para que una caída aguda no
//               arrastre la referencia contra la que se mide.
//   reciente  = media de los últimos `DIAS_RECIENTES` días, hoy incluido.
//   delta     = reciente − basal, SIN redondear (quien lo pinta redondea una vez).
//
// La media es de las MUESTRAS, no de medias diarias (lo fija un test desde
// agosto: dos lecturas un día y una al siguiente pesan tres, no dos). Para el
// pulso en reposo y el sueño cada día trae ya UNA muestra (el resolvedor de
// reposo se queda con la última revisión; el sueño es la noche), así que ahí
// muestra y día coinciden.
//
// LA VENTANA ES MÉTODO DEL COACH (`basal_dias`, `basal_excluir_dias` en
// `coach_analytics_method`, 0277), con el defecto del readiness. Cuántas noches
// hacen falta para fiarse de una basal también (`hrv_min_nights_*`), y aquí se
// cuentan (`noches` = días distintos con muestra).
//
// UN DÍA LOCAL, NUNCA UTC. Las muestras llegan ya ATRIBUIDAS a su día local:
// quien las lee sabe el huso del atleta y, para el sueño, a qué noche pertenece
// cada una (`diaDeSueno`). Este módulo no ve instantes: así no puede volver a
// cortar por la medianoche de Greenwich.
//
// Puro y sin base de datos.

import { HRV_RECENT_DAYS } from '../biometrics/hrv-baseline';
import { addDays, isoDateString, parseIsoDate, zonedDayString, zonedWallClockToUtc } from '../dates';
import type { CoachAnalyticsMethod } from './metodo';

/** La ventana basal del coach: desde `dias` atrás hasta `excluir_dias` atrás (sin hoy). */
export interface VentanaBasal {
  dias: number;
  excluir_dias: number;
}

/** La ventana basal de un método (0277). */
export function ventanaBasalDe(m: Pick<CoachAnalyticsMethod, 'basal_dias' | 'basal_excluir_dias'>): VentanaBasal {
  return { dias: m.basal_dias, excluir_dias: m.basal_excluir_dias };
}

/** Los días que cuentan como «ahora»: la semana que acaba hoy. Mecanismo (la media de 7 días de la variabilidad es el estándar del sector). */
export const DIAS_RECIENTES = HRV_RECENT_DAYS;

/** Una muestra ya atribuida a su día local del atleta (`YYYY-MM-DD`). */
export interface MuestraDia {
  dia: string;
  valor: number;
}

/** Un tramo de días locales, ambos extremos incluidos. */
export interface TramoDias {
  desde: string;
  hasta: string;
}

/** Una media sobre un tramo de días, con cuánto hay detrás. */
export interface Media extends TramoDias {
  /** Null cuando no hay ni una muestra: sin muestras no hay media, y nunca es cero. */
  valor: number | null;
  muestras: number;
  /** Días distintos con al menos una muestra (las «noches» de las puertas). */
  noches: number;
}

function dia(hoy: string, desplazamiento: number): string {
  return isoDateString(addDays(parseIsoDate(hoy), desplazamiento));
}

/** Los días de la basal para `hoy`: de `hoy − dias` a `hoy − excluir − 1`. */
export function diasBasal(hoy: string, v: VentanaBasal): TramoDias {
  return { desde: dia(hoy, -v.dias), hasta: dia(hoy, -(v.excluir_dias + 1)) };
}

/** Los días de lo reciente: los `dias` que acaban hoy (incluido). */
export function diasRecientes(hoy: string, dias: number = DIAS_RECIENTES): TramoDias {
  return { desde: dia(hoy, -(Math.max(1, dias) - 1)), hasta: hoy };
}

/** La media de las muestras cuyo día cae en el tramo. */
export function mediaEn(muestras: readonly MuestraDia[], tramo: TramoDias): Media {
  let suma = 0;
  let n = 0;
  const dias = new Set<string>();
  for (const m of muestras) {
    if (m.dia < tramo.desde || m.dia > tramo.hasta) continue;
    if (!Number.isFinite(m.valor)) continue;
    suma += m.valor;
    n += 1;
    dias.add(m.dia);
  }
  return { ...tramo, valor: n > 0 ? suma / n : null, muestras: n, noches: dias.size };
}

/** LA basal: la media de la ventana basal del coach para `hoy`. */
export function basalDe(muestras: readonly MuestraDia[], hoy: string, v: VentanaBasal): Media {
  return mediaEn(muestras, diasBasal(hoy, v));
}

/** Lo reciente: la media de los últimos días, hoy incluido. */
export function recienteDe(muestras: readonly MuestraDia[], hoy: string, dias: number = DIAS_RECIENTES): Media {
  return mediaEn(muestras, diasRecientes(hoy, dias));
}

export interface FrenteABasal {
  reciente: Media;
  basal: Media;
  /** reciente − basal, sin redondear. Null si falta cualquiera de las dos: «sin basal» no es «delta 0». */
  delta: number | null;
}

/** Lo reciente frente a la basal, de una vez, para el día `hoy`. */
export function frenteABasal(
  muestras: readonly MuestraDia[],
  hoy: string,
  v: VentanaBasal,
  dias_recientes: number = DIAS_RECIENTES,
): FrenteABasal {
  const reciente = recienteDe(muestras, hoy, dias_recientes);
  const basal = basalDe(muestras, hoy, v);
  const delta = reciente.valor != null && basal.valor != null ? reciente.valor - basal.valor : null;
  return { reciente, basal, delta };
}

/** Las noches mínimas del coach para fiarse de una comparación con la basal (0190). */
export type PuertasBasal = Pick<CoachAnalyticsMethod, 'basal_dias' | 'basal_excluir_dias' | 'hrv_min_nights_recent' | 'hrv_min_nights_baseline'>;

export interface ComparacionConBasal extends FrenteABasal {
  /**
   * La puerta que NO se pasa, o null. Lo reciente va primero: sin noches
   * recientes nadie está midiendo, y esperar no lo arregla; con ellas, una basal
   * corta es cuestión de tiempo.
   */
  falla: 'reciente' | 'basal' | null;
  /** El delta, SOLO si pasa las dos puertas. Es el que puede sostener una palabra o un índice. */
  delta_fiable: number | null;
}

/**
 * Lo reciente frente a la basal CON las puertas del coach — la versión que
 * leen todas las superficies (el panel, la disposición, el roster, el barrido de
 * avisos, la ficha): la misma basal y la misma exigencia de noches en todas.
 */
export function comparaConBasal(muestras: readonly MuestraDia[], hoy: string, m: PuertasBasal): ComparacionConBasal {
  const fb = frenteABasal(muestras, hoy, ventanaBasalDe(m));
  const falla: ComparacionConBasal['falla'] =
    fb.reciente.valor == null || fb.reciente.noches < m.hrv_min_nights_recent
      ? 'reciente'
      : fb.basal.valor == null || fb.basal.noches < m.hrv_min_nights_baseline
        ? 'basal'
        : null;
  return { ...fb, falla, delta_fiable: falla == null ? fb.delta : null };
}

/**
 * UNA NOCHE, UN NÚMERO. El iPhone sube el sueño de una noche en varios lotes
 * (cada vez que Salud le da muestras nuevas: el reloj al despertar, otra app de
 * sueño, un trozo de madrugada) y cada lote trae la duración de SUS muestras,
 * no la de la noche. Medido en la rama el 29-09-2026: noches con 3 a 9 subidas
 * (1,25 h a las 00:45, 8,53 h a las 07:15, 8,77 h a las 08:22…). Ni la media
 * (4,8 h de una semana de noches de 7) ni la suma (36 h) son la noche: lo es
 * el lote más completo, la mayor. Sin los intervalos no se puede unir mejor.
 */
export function nochesDeSueno(muestras: readonly MuestraDia[]): MuestraDia[] {
  const mayor = new Map<string, number>();
  for (const m of muestras) {
    if (!Number.isFinite(m.valor) || m.valor <= 0) continue;
    const antes = mayor.get(m.dia);
    if (antes == null || m.valor > antes) mayor.set(m.dia, m.valor);
  }
  return [...mayor.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([dia, valor]) => ({ dia, valor }));
}

/**
 * Cuántos días hacia atrás hay que LEER para poder calcular la basal de todos
 * los días de un periodo que empieza en `desde`: la basal del primer día mira
 * `dias` atrás. Quien carga las muestras pide desde aquí.
 */
export function primerDiaNecesario(desde: string, v: VentanaBasal, dias_recientes: number = DIAS_RECIENTES): string {
  return dia(desde, -Math.max(v.dias, dias_recientes - 1));
}

// ---------------------------------------------------------------------------
// A QUÉ DÍA PERTENECE CADA MUESTRA
// ---------------------------------------------------------------------------

/**
 * El día local de una lectura de un instante (variabilidad, estrés, peso): el
 * día del calendario del atleta en que se tomó.
 */
export function diaLocal(at: Date, tz: string): string {
  return zonedDayString(at, tz);
}

/**
 * Desde esta hora local, una marca de sueño es de ANOCHE empezando, y la noche
 * se le atribuye al día siguiente (el día en que se despierta). Garmin estampa
 * el sueño en su INICIO; Polar y Salud, en el día de despertar. Es el corte del
 * readiness (`OVERNIGHT_WINDOW_START_HOUR`).
 */
export const HORA_INICIO_NOCHE = 18;

/**
 * Hasta esta hora local, una marca de sueño es de la noche que acaba ese día.
 * Entre esta y `HORA_INICIO_NOCHE` es una siesta, no una noche: no entra en la
 * basal del sueño (ni en el readiness, que usa la misma ventana).
 */
export const HORA_FIN_NOCHE = 14;

/**
 * El día al que pertenece una marca de sueño: el día en que el atleta se
 * DESPIERTA. Null para una siesta (entre las 14:00 y las 18:00 locales). Con
 * esto la noche del readiness del día D (de las 18:00 del D−1 a las 14:00 del
 * D) es EXACTAMENTE el conjunto de marcas cuyo `diaDeSueno` es D.
 */
export function diaDeSueno(at: Date, tz: string): string | null {
  const natural = zonedDayString(at, tz);
  const inicioNoche = zonedWallClockToUtc(parseIsoDate(natural), tz, { hours: HORA_INICIO_NOCHE });
  if (at.getTime() >= inicioNoche.getTime()) return dia(natural, 1);
  const finNoche = zonedWallClockToUtc(parseIsoDate(natural), tz, { hours: HORA_FIN_NOCHE });
  if (at.getTime() < finNoche.getTime()) return natural;
  return null;
}
