// ¿Hay historia suficiente para pintar la carga con confianza?
//
// MECANISMO, no método: el fitness (CTL) es una media exponencial con constante
// de tiempo τ = 42 días (`CTL_DECAY_DAYS`, Banister). Con menos historia que esa
// ventana el CTL sale bajo por construcción — no porque el atleta esté en baja
// forma — y lo que se deriva de él (TSB = CTL − ATL, ACWR = ATL ÷ CTL) sale
// exagerado: tres semanas de datos dan un ACWR de 2 y un TSB de −55 que no
// significan nada. La ventana va atada al modelo; no es algo que otro coach
// cambiaría sin cambiar la fórmula. La fatiga (ATL, τ = 7 d) sí se puede leer
// en cuanto hay una semana.

import { CTL_DECAY_DAYS } from '@fahybrid/shared/domain/training-load/banister';

export const LOAD_HISTORY_MIN_DAYS = CTL_DECAY_DAYS;
/** La fatiga (ATL) tiene constante de 7 días: con una semana ya dice algo. */
export const ATL_HISTORY_MIN_DAYS = 7;

export interface LoadHistory {
  /** Días desde el primer día con carga registrada hasta hoy (incluido). 0 = ninguno. */
  history_days: number;
  /** CTL, TSB, ACWR y la curva se pueden pintar. */
  enough: boolean;
  /** La fatiga (ATL) sí se puede enseñar aunque falte para el resto. */
  atl_ready: boolean;
  weeks_needed: number;
  /** Semanas completas de historia (redondeo hacia abajo). */
  weeks_have: number;
}

/** `daily` en orden cronológico, el último elemento = hoy. */
export function loadHistory(daily: ReadonlyArray<{ tss: number }>): LoadHistory {
  const first = daily.findIndex((d) => d.tss > 0);
  const history_days = first < 0 ? 0 : daily.length - first;
  return {
    history_days,
    enough: history_days >= LOAD_HISTORY_MIN_DAYS,
    atl_ready: history_days >= ATL_HISTORY_MIN_DAYS,
    weeks_needed: Math.ceil(LOAD_HISTORY_MIN_DAYS / 7),
    weeks_have: Math.floor(history_days / 7),
  };
}

/** «necesita 6 semanas de datos, lleva 3 semanas» — la frase de cuando falta
 *  (va bajo el título «Carga»). */
export function loadHistoryLine(h: LoadHistory): string {
  const have =
    h.weeks_have === 0
      ? `lleva ${h.history_days} ${h.history_days === 1 ? 'día' : 'días'}`
      : `lleva ${h.weeks_have} ${h.weeks_have === 1 ? 'semana' : 'semanas'}`;
  return `necesita ${h.weeks_needed} semanas de datos, ${have}`;
}
