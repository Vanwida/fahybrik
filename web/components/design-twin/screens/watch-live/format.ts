// Formateadores del reloj — espejo de WatchFormat (LiveHUDShared.swift), que a
// su vez delega en WorkoutSession.formatElapsed y CountdownFormat.standalone.
//
// OJO: el reloj NO formatea como el iPhone y por eso no se reusa `fmtClock` de
// sim.ts. Dos diferencias que se ven en pantalla:
//   · el tiempo lleva los minutos a dos cifras — «04:36», no «4:36».
//   · la cuenta atrás por debajo del minuto es «:45» (con dos puntos delante),
//     y CEIL, no round: el reloj es la única pantalla y debe ir en paso con los
//     pitidos del motor.

/** WorkoutSession.formatElapsed — «04:36» · «1:02:40». */
export function clock(seconds: number): string {
  const total = Math.round(Math.max(0, seconds));
  const s = String(total % 60).padStart(2, '0');
  if (total >= 3600) {
    return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${s}`;
  }
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${s}`;
}

/** CountdownFormat.standalone — CEIL; «:45» por debajo del minuto, «01:30» a partir de él. */
export function countdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return whole < 60 ? `:${String(whole).padStart(2, '0')}` : clock(whole);
}

/** WatchFormat.pace — segundos por unidad → «4:35». */
export function pace(secondsPerUnit: number): string {
  const s = Math.max(0, Math.round(secondsPerUnit));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** WatchFormat.kg — sin «.0» de más: «80», «82.5». */
export function kg(value: number): string {
  return value % 1 === 0 ? String(Math.round(value)) : value.toFixed(1);
}

/** ContinuousLiveView.distanceValue — «1.24» en km a partir de 1000 m, si no metros enteros. */
export function distanceValue(meters: number): string {
  return meters >= 1000 ? (meters / 1000).toFixed(2) : String(Math.floor(meters));
}

// ---------------------------------------------------------------------------
// minimumScaleFactor: SwiftUI encoge el texto hasta caber; CSS no tiene nada
// equivalente, así que se estima el ancho por avances tipográficos de SF Pro
// (heavy, cifras tabulares) y se escala igual que el reloj. Sin medición del
// DOM: mismo resultado en servidor y en cliente, y determinista.
// ---------------------------------------------------------------------------

const ADVANCE_EM: Record<string, number> = {
  ':': 0.32,
  '.': 0.3,
  ' ': 0.28,
  '—': 0.62,
  '-': 0.35,
  '/': 0.4,
  '%': 0.8,
};
/** Avance por cifra tabular en SF Pro Heavy (todas miden lo mismo, por eso «tabular»). */
const DIGIT_EM = 0.6;
const LETTER_EM = 0.58;

export function estimateWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    em += ADVANCE_EM[ch] ?? (ch >= '0' && ch <= '9' ? DIGIT_EM : LETTER_EM);
  }
  return em * fontSize;
}

/**
 * Factor de escala que SwiftUI aplicaría para que `width` quepa en `maxWidth`,
 * con el suelo de `minimumScaleFactor` (0.4 en GiantNumber).
 */
export function fitScale(width: number, maxWidth: number, minScale = 0.4): number {
  if (width <= maxWidth) return 1;
  return Math.max(minScale, maxWidth / width);
}
