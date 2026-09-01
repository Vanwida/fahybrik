// Cómo se reparte un stream FIT (un único archivo plano de mensajes) entre las
// varias actividades que puede contener. Un FIT multideporte entrelaza sus
// records/laps de cada tramo en el MISMO stream — el orden de escritura no es
// un contrato fiable para separarlos, así que todo aquí se resuelve por
// TIEMPO: la ventana [started_at, ended_at] de cada session es la única
// frontera de la que nos fiamos.

import type { LapMesg, SessionMesg } from '@garmin/fitsdk';

export interface SessionWindow {
  started_at: Date;
  ended_at: Date;
}

interface TimedMesg {
  timestamp?: unknown;
  startTime?: unknown;
  totalElapsedTime?: unknown;
}

/**
 * `timestamp` es el cierre del mensaje (session o lap) y `start_time` su
 * apertura — ambos son campos núcleo del perfil de Activity y casi siempre
 * están los dos. Si algún dispositivo omite `start_time` pero trae
 * `total_elapsed_time`, se deriva restando del cierre: sigue siendo aritmética
 * sobre datos que el propio fichero trae, no una invención. Si ninguna de las
 * dos vías cuaja, la ventana no puede definirse — y el contrato exige que
 * TODA actividad tenga una (es lo único no-opcional junto con la modalidad).
 */
function resolveWindow(mesg: TimedMesg): SessionWindow | null {
  const endedAt = mesg.timestamp instanceof Date ? mesg.timestamp : null;
  if (!endedAt) return null;

  let startedAt = mesg.startTime instanceof Date ? mesg.startTime : null;
  if (!startedAt && typeof mesg.totalElapsedTime === 'number') {
    startedAt = new Date(endedAt.getTime() - mesg.totalElapsedTime * 1000);
  }
  if (!startedAt || startedAt.getTime() > endedAt.getTime()) return null;

  return { started_at: startedAt, ended_at: endedAt };
}

export function resolveSessionWindow(session: SessionMesg): SessionWindow | null {
  return resolveWindow(session);
}

export function resolveLapWindow(lap: LapMesg): SessionWindow | null {
  return resolveWindow(lap);
}

/**
 * Reparte una lista cronológica (records o laps ya resueltos) entre las
 * ventanas de las sessions del fichero, usando UN timestamp representativo por
 * elemento. Un timestamp justo en el límite compartido entre dos sessions cae
 * en la PRIMERA que lo contiene. Lo que no cae en ninguna ventana (pre-roll de
 * GPS antes de que arranque la session, deriva de reloj) se descarta en
 * silencio: no pertenece a ninguna actividad canónica, y avisar por cada
 * punto suelto sería ruido, no señal.
 */
export function bucketByWindow<T>(
  items: T[],
  getTime: (item: T) => Date | null,
  windows: SessionWindow[],
): T[][] {
  const buckets: T[][] = windows.map(() => []);
  for (const item of items) {
    const t = getTime(item);
    if (!t) continue;
    const ts = t.getTime();
    const idx = windows.findIndex((w) => ts >= w.started_at.getTime() && ts <= w.ended_at.getTime());
    if (idx !== -1) buckets[idx]!.push(item);
  }
  return buckets;
}

/** Redondeos de reloj entre el cierre del lap y el cierre de la session — por
 *  debajo de esto, se consideran la MISMA ventana. */
const LAP_MIRROR_TOLERANCE_MS = 2000;

/**
 * El "lap-espejo": cuando la ÚNICA lap de una session cubre, dentro de
 * tolerancia, la misma ventana que la session entera, no aporta estructura
 * (ni splits reales ni un auto-lap real) — es el reloj cerrando el lap
 * implícito al parar el cronómetro. El contrato pide descartarlo.
 */
export function isMirrorLap(lap: SessionWindow, session: SessionWindow): boolean {
  return (
    Math.abs(lap.started_at.getTime() - session.started_at.getTime()) <= LAP_MIRROR_TOLERANCE_MS &&
    Math.abs(lap.ended_at.getTime() - session.ended_at.getTime()) <= LAP_MIRROR_TOLERANCE_MS
  );
}
