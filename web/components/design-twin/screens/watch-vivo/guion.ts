// Los cuatro guiones de la muñeca — datos y curvas deterministas.
//
// Nada es aleatorio: la FC, la distancia y las cuentas atrás son funciones del
// segundo de entreno, así que dos reproducciones del mismo escenario pintan
// exactamente lo mismo.
//
// El ancla de las zonas es el UMBRAL de datos-reales.ts (162 ppm, ESTIMADO), no
// un umbral propio: si el doble usara otro, enseñaría una zona distinta de la
// que enseña la app para el mismo pulso. Y por ser estimado viaja MARCADO hasta
// la página del cuerpo (§7).

import { UMBRAL } from '../../datos-reales';
import { hrZone } from '../../sim';

/** La zona de un pulso, contra el umbral real del proyecto. */
export function zonaDe(bpm: number): 1 | 2 | 3 | 4 | 5 {
  return hrZone(bpm, UMBRAL.ppm);
}

/**
 * El nombre de la zona en español de box. «Rodaje», «tempo» y «umbral» son
 * jerga de corredor: en la muñeca, sudando y a distancia de brazo, tiene que
 * entenderse a la primera y sin traducir nada.
 */
export const ZONA_NOMBRE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'muy suave',
  2: 'suave',
  3: 'medio',
  4: 'fuerte',
  5: 'máximo',
};

/** Interpolación lineal saturada — la forma de todas las curvas de FC de aquí. */
export function rampa(desde: number, hasta: number, t: number, duracionS: number): number {
  if (duracionS <= 0) return hasta;
  const k = Math.min(1, Math.max(0, t / duracionS));
  return desde + (hasta - desde) * k;
}

// ---------------------------------------------------------------------------
// (a) Series de 400 — serie 3 de 8
// ---------------------------------------------------------------------------

/**
 * No hay en la base ninguna sesión de series de carrera (el corpus de
 * `datos-reales` es remo, fuerza y simulación HYROX), así que las cifras son un
 * guion coherente, no una fila de producción: 8×400 a 3:30/km con 1:00 de
 * recuperación, que es una sesión de pista normal de un atleta de híbrido.
 *
 * El tramo arranca a 160 m del final a propósito: nadie mira el reloj al
 * empezar la serie, se mira cuando duele. Así el cierre de serie (destello,
 * segmento del aro que se completa) llega dentro de los primeros 35 s.
 */
export const SERIES = {
  total: 8,
  actual: 3,
  metros: 400,
  /** Metros que quedaban cuando arranca la reproducción. */
  restanteInicialM: 160,
  /** 4,76 m/s = 3:30/km. */
  velocidadMs: 4.76,
  ritmoSecKm: 210,
  recuperacionS: 60,
} as const;

/** FC de la serie: 168 → 176 corriendo (Z5), y la caída a 138 al recuperar. */
export function bpmSerie(estado: 'trabajo' | 'recupera', tEstadoS: number): number {
  return estado === 'trabajo'
    ? Math.round(rampa(168, 176, tEstadoS, 34))
    : Math.round(rampa(176, 138, tEstadoS, 45));
}

// ---------------------------------------------------------------------------
// (b) EMOM — ronda 4 de 12
// ---------------------------------------------------------------------------

export const EMOM = {
  rondas: 12,
  actual: 4,
  ventanaS: 60,
  /** Segundos que quedaban del minuto al arrancar la reproducción. */
  restanteInicialS: 38,
} as const;

/** Alterna bici y burpees; la ronda 4 es la de la bici. */
export function tareaEmom(ronda: number): string {
  return ronda % 2 === 0 ? '12 cal bici' : '10 burpees';
}

/** FC del EMOM: cruza de medio (Z3) a fuerte (Z4) dentro del minuto. */
export function bpmEmom(estado: 'trabajo' | 'recupera', tEstadoS: number): number {
  return estado === 'trabajo'
    ? Math.round(rampa(150, 162, tEstadoS, 40))
    : Math.round(rampa(162, 146, tEstadoS, 30));
}

// ---------------------------------------------------------------------------
// (c) Descanso de fuerza — dato de PRODUCCIÓN
// ---------------------------------------------------------------------------

/**
 * Fila real: `templates` 497 · asignación 349 · atleta 64. Cuatro series de 5 a
 * 100 kg con 90 s de descanso, tal cual las trae la prescripción.
 *
 * La FC sale de la ejecución 162 de esa misma asignación (media 95, máx 122):
 * una sesión de sentadilla entera vive en Z1 contra un umbral de 162. Por eso
 * aquí el fondo de la página del cuerpo es gris y no rojo, y está bien que lo
 * sea.
 */
export const FUERZA = {
  procedencia: 'plantilla 497 · asignación 349 · atleta 64',
  series: 4,
  serieActual: 3,
  reps: 5,
  cargaKg: 100,
  descansoS: 90,
} as const;

/** FC de la fuerza: 118 bajando a 104 en el descanso, 118 durante la serie. */
export function bpmFuerza(estado: 'descanso' | 'serie', tEstadoS: number): number {
  return estado === 'descanso' ? Math.round(rampa(118, 104, tEstadoS, 80)) : 118;
}

// ---------------------------------------------------------------------------
// (d) AMRAP — el último tramo de la ventana
// ---------------------------------------------------------------------------

/**
 * AMRAP de 12 min, reproducido en sus últimos 39 s: es cuando el reloj sirve
 * de verdad (cuántas llevo, cuánto queda, ¿me da otra?) y cuando el atleta
 * toca la pantalla más veces.
 */
export const AMRAP = {
  ventanaS: 720,
  restanteInicialS: 39,
  rondasIniciales: 9,
} as const;

/** FC del AMRAP: 168 → 174, arriba del todo (Z5) hasta la bocina. */
export function bpmAmrap(tS: number): number {
  return Math.round(rampa(168, 174, tS, 40));
}
