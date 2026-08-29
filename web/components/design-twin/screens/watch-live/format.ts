// Formateadores del reloj — espejo de WatchFormat (LiveHUDShared.swift), que a
// su vez delega en WorkoutSession.formatElapsed y CountdownFormat.
//
// OJO: el reloj NO formatea el TIEMPO como el iPhone y por eso no se reusa
// `fmtClock` de sim.ts: lleva los minutos a dos cifras — «04:36», no «4:36».
//
// La CUENTA ATRÁS sí: por debajo del minuto es «:45» (con dos puntos delante) y
// redondea al más cercano, igual que el móvil. Aquí decía CEIL, y era cierto
// mientras `CountdownFormat` tenía dos funciones (`standalone` CEIL / `mirrored`
// ROUND). Quedó una —la regla del móvil, que es el dueño del tiempo— porque las
// dos convivían en la misma pantalla del espejo y el mismo segundo se leía
// distinto según quién lo pintara. Ver docs/DECISIONS.md (2026-08-29).

/** WorkoutSession.formatElapsed — «04:36» · «1:02:40». */
export function clock(seconds: number): string {
  const total = Math.round(Math.max(0, seconds));
  const s = String(total % 60).padStart(2, '0');
  if (total >= 3600) {
    return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${s}`;
  }
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${s}`;
}

/** CountdownFormat.remaining — ROUND; «:45» por debajo del minuto, «01:30» a partir de él. */
export function countdown(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
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

/** Formato.duracion — «45 min» · «1 h» · «1 h 10»; nil por debajo del minuto. */
export function duracion(minutos: number): string | null {
  if (minutos <= 0) return null;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m}`;
}

/**
 * Formato.duracionPrevista — «desde 50 min», el SUELO que escribe el plan (no
 * una estimación centrada: «~50 min» prometía un promedio que no era).
 */
export function duracionPrevista(minutos: number | null): string | null {
  if (minutos === null) return null;
  const cifra = duracion(minutos);
  return cifra ? `desde ${cifra}` : null;
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
