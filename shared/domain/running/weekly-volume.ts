// VOLUMEN SEMANAL EN KILÓMETROS (#71, mockup carrera-en-el-panel §06) — «el
// número con el que habla cualquier corredor del mundo», y hoy el panel del
// coach sólo enseña minutos por zona.
//
// Puro: la parte que merece test sin DB es la TENDENCIA, no la suma (eso lo
// hace SQL — ver `web/lib/coach/running-volume.ts`). El wire genera la serie
// de semanas YA rellena (una fila por semana del rango, 0 cuando no corrió:
// una semana sin kilómetros de carrera es un hecho, no un agujero — a
// diferencia del tiempo en zonas, aquí no hay un "no sé" distinto de "no
// corrió", así que no se omite ninguna semana del rango pedido).
//
// LA SEMANA EN CURSO NUNCA ENTRA EN LA TENDENCIA (mockup §06/§07): lleva
// menos de 7 días medidos y compararla infla o hunde el % sin que signifique
// nada. Tampoco lleva listón de "semana buena": el mockup es explícito —
// "dónde está el techo... es tuyo, no nuestro". Esta lectura no juzga,
// sólo cuenta.

/** Una semana de la serie — SIEMPRE una fila por semana del rango pedido,
 *  nunca omitida (ver cabecera). */
export interface WeeklyVolumeWeek {
  /** Lunes de la semana, en la zona horaria del atleta. */
  week_start: string;
  km: number;
  /** La última semana del rango, la que contiene "hoy". Lleva menos de 7
   *  días medidos: se enseña, pero no se compara. */
  en_curso: boolean;
}

export interface WeeklyVolumeTrend {
  /** % de cambio de la última semana CERRADA contra la media de las
   *  `TREND_COMPARE_WEEKS` anteriores. Null cuando no hay semanas cerradas
   *  de sobra para comparar, o cuando el fondo contra el que se compara es
   *  cero (división por cero: sin base, no hay "cuánto más o menos"). */
  pct_vs_previous_weeks: number | null;
  /** Cuántas semanas anteriores entraron en la media — para que el
   *  consumidor pueda escribir "contra las 4 anteriores" sin repetir la
   *  constante. */
  compare_weeks: number;
}

/** Semanas CERRADAS que hacen falta antes de la última para poder decir algo
 *  de la tendencia. 4 — ni una comparación de 2 (ruido semana a semana) ni
 *  un histórico de medio año para un número que se lee cada lunes. No es
 *  método del coach: es la forma del gráfico, no un umbral de juicio (el
 *  mockup no lo lista en la tabla de método, a propósito — es una decisión
 *  de cuántas barras hacen falta para ver "las 4 anteriores", no un listón
 *  que cambie lo que se considera bueno). */
const TREND_COMPARE_WEEKS = 4;

/** La tendencia de la última semana cerrada contra el fondo reciente.
 *  `weeksAscending` es la serie completa (en_curso incluida al final, si la
 *  hay) — esta función descarta la en_curso por sí misma. */
export function weeklyVolumeTrend(weeksAscending: readonly WeeklyVolumeWeek[]): WeeklyVolumeTrend {
  const closed = weeksAscending.filter((w) => !w.en_curso);
  if (closed.length < TREND_COMPARE_WEEKS + 1) {
    return { pct_vs_previous_weeks: null, compare_weeks: TREND_COMPARE_WEEKS };
  }
  const latest = closed[closed.length - 1]!;
  const previous = closed.slice(closed.length - 1 - TREND_COMPARE_WEEKS, closed.length - 1);
  const meanPrevious = previous.reduce((s, w) => s + w.km, 0) / previous.length;
  if (meanPrevious <= 0) {
    return { pct_vs_previous_weeks: null, compare_weeks: TREND_COMPARE_WEEKS };
  }
  return {
    pct_vs_previous_weeks: Math.round(((latest.km - meanPrevious) / meanPrevious) * 100),
    compare_weeks: TREND_COMPARE_WEEKS,
  };
}
