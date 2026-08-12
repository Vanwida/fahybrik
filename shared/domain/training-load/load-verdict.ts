// LA CARGA, CON EL VEREDICTO DELANTE (#71, mockup carrera-en-el-panel §06).
//
// "Se calcula, y bien, y vive escondida detrás de un índice de 0 a 100 que no
// dice de dónde sale. Un entrenador no necesita el índice: necesita saber si
// el atleta está apretando, y luego los tres números por si quiere mirarlos."
//
// Este módulo NO recalcula CTL/ATL/TSB — eso ya lo hace `banister.ts`, y lo
// reutiliza tal cual (una sola aritmética, para que el "fondo" que enseña el
// panel de carrera nunca discrepe del que enseña cualquier otra pantalla que
// lea el mismo `LoadSummary`). Lo que este módulo AÑADE es la puerta del
// VEREDICTO: dos motivos, independientes entre sí, por los que la palabra
// "apretando" puede retirarse SIN retirar los números —
//
//   · COBERTURA (`readLoadCoverage`, ya existente) — demasiadas sesiones sin
//     RPE en la ventana reciente: no se sabe hacia qué lado se equivoca el
//     hueco.
//   · ARRANQUE EN FRÍO (nuevo aquí) — el atleta no lleva calendario de sobra
//     para que el fondo (CTL, una EWMA de `ctl_window_days`) sea un número
//     asentado y no un artefacto de la rampa desde cero. Mockup: "Con un
//     atleta nuevo diría cuántos días le faltan en vez de dar una cifra que
//     no significa nada."
//
// El aviso en sí ("está apretando") es un UMBRAL nuevo, `freshness_alert_
// tsb` — DISTINTO del "cargado"/"fresco" que ya pinta `athlete-deep-dive.ts`
// (`tsbLabel`, corte en −10). No son el mismo dato re-etiquetado: uno es la
// lectura general de forma del atleta, éste es la alerta ESPECÍFICA del
// panel de carrera, con su propio corte de coach (mockup §08: −8 por
// defecto). Deuda declarada en el informe: `ctl_window_days`/`atl_window_
// days` NO se hacen editables este lote — cambiarlos movería el NÚMERO (no
// sólo su etiqueta) en todas las pantallas que ya leen CTL/ATL, y eso es un
// cambio de mucho más alcance que esta tarjeta.
//
// Puro: sin I/O. El wire (`web/lib/coach/running-analytics.ts`) resuelve
// `LoadSummary` (ya existente) + cuántos días de historial real tiene el
// atleta + el umbral del coach, y llama a `buildRunningLoadReading`.

import type { LoadSummary } from './banister';
import { readLoadCoverage, type LoadCoverage } from './coverage';

/**
 * ¿Lleva el atleta calendario de sobra para que el fondo (CTL) sea un número
 * asentado? Una EWMA de τ días nunca está "completa", pero por debajo de su
 * propia ventana está dominada por la rampa desde el arranque en cero, no
 * por el entrenamiento real — mostrar "fondo: 12" a la semana 2 sería mentir
 * con un número que técnicamente salió de la fórmula.
 */
export interface ColdStartCheck {
  /** Si `days_of_history >= ctl_window_days`. */
  is_warmed_up: boolean;
  /** Días desde la primera sesión ejecutada hasta hoy. Null cuando el
   *  atleta no tiene ninguna sesión — no hay desde cuándo contar. */
  days_of_history: number | null;
  /** Cuántos días le faltan para asentar el fondo. 0 cuando ya está
   *  warmed_up. Null cuando `days_of_history` es null (nada ejecutado: la
   *  pantalla dice "sin entrenos", no "le faltan N días"). */
  days_missing: number | null;
  /** El umbral contra el que se comparó — para que la tarjeta pueda escribir
   *  "se calcula sobre N días" sin volver a preguntarlo. */
  ctl_window_days: number;
}

export function checkColdStart(days_of_history: number | null, ctl_window_days: number): ColdStartCheck {
  if (days_of_history == null) {
    return { is_warmed_up: false, days_of_history: null, days_missing: null, ctl_window_days };
  }
  const days_missing = Math.max(0, ctl_window_days - days_of_history);
  return { is_warmed_up: days_missing === 0, days_of_history, days_missing, ctl_window_days };
}

export interface RunningLoadReading {
  /** "Fondo" — lo que aguanta de normal. */
  ctl: number;
  /** "Reciente" — lo que ha metido en la ventana corta. */
  atl: number;
  /** "Frescura" — fondo menos reciente. Siempre `ctl - atl`, nunca otra
   *  fórmula: es el mismo TSB que banister.ts calcula en todas partes. */
  tsb: number;
  /** Acute:chronic. Null cuando la ventana crónica no tiene carga — 0/0 no
   *  es un ratio (ver banister.ts, computeAcr). */
  acr: number | null;
  coverage: LoadCoverage;
  cold_start: ColdStartCheck;
  /**
   * Si la tarjeta puede pronunciar CUALQUIER palabra sobre el estado del
   * atleta — "apretando" o su ausencia. Falso cuando el hueco de cobertura O
   * el arranque en frío lo impiden. Los números (`ctl`/`atl`/`tsb`/`acr`)
   * NUNCA se ocultan por esto — sólo el veredicto (misma ley que
   * `readLoadCoverage`: número sí, sentencia no).
   */
  allows_verdict: boolean;
  /**
   * "Está apretando" — `tsb` cayó igual o por debajo del umbral del coach
   * (`freshness_alert_tsb`, método, defecto −8). SIEMPRE `false` cuando
   * `allows_verdict` es `false`: no hay aviso posible sin margen para
   * pronunciarlo, sea cual sea el número crudo.
   */
  is_alert: boolean;
  /** El umbral que decidió `is_alert` — para que la tarjeta pueda escribir
   *  el corte sin volver a preguntarle al resolutor del coach. */
  freshness_alert_tsb: number;
}

export function buildRunningLoadReading(args: {
  summary: LoadSummary;
  days_of_history: number | null;
  ctl_window_days: number;
  freshness_alert_tsb: number;
}): RunningLoadReading {
  const coverage = readLoadCoverage(args.summary);
  const cold_start = checkColdStart(args.days_of_history, args.ctl_window_days);
  const allows_verdict = coverage.allows_verdict && cold_start.is_warmed_up;

  return {
    ctl: args.summary.ctl,
    atl: args.summary.atl,
    tsb: args.summary.tsb,
    acr: args.summary.acr,
    coverage,
    cold_start,
    allows_verdict,
    is_alert: allows_verdict && args.summary.tsb <= args.freshness_alert_tsb,
    freshness_alert_tsb: args.freshness_alert_tsb,
  };
}
