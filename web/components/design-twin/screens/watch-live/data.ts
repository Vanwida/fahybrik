// Datos de ejemplo de los tres guiones + las curvas deterministas que los mueven.
//
// Nada aquí es aleatorio: la FC y la velocidad son funciones del segundo de
// entreno, así que dos reproducciones del mismo guion pintan exactamente lo
// mismo. Las cifras son coherentes entre sí (el ritmo medio sale de la
// distancia recorrida, los parciales suman los 3 km) — la app nunca fabrica un
// número, y el doble tampoco.

import { hrZone } from '../../sim';

/** Umbral (LTHR) del atleta de ejemplo — de él salen las zonas, como en la app. */
export const UMBRAL_BPM = 168;

// ---------------------------------------------------------------------------
// Guion 1 · «Carrera continua»
// ---------------------------------------------------------------------------

/** El brief del día que empuja el iPhone (WatchTodayPayload). */
export const DIA_CONTINUO = {
  eyebrow: 'Hoy toca',
  titulo: 'Continuo Z3 + core',
  bloques: 2,
  minutos: 50,
  /** `plan.segments.first.previewWorkLine` — el reloj lo pinta como «1º · …». */
  primerBloque: '8 km · @ 4:35 /km · Z3',
} as const;

/** La puerta del bloque de carrera (BlockGateView, bloque NO estructural). */
export const PUERTA_CARRERA = {
  status: 'Bloque 1 / 2',
  eyebrow: 'Ahora',
  titulo: 'Carrera continua',
  /** previewWorkLine partido por « · », como hace `chips`. */
  chips: ['8 km', '@ 4:35 /km', 'Z3'],
} as const;

/** Zona objetivo del bloque continuo. */
export const ZONA_OBJETIVO = 3 as const;

/**
 * Segundos hasta que el GPS entrega distancia utilizable. Antes de eso
 * `liveRunDistanceMeters` es nil, así que ContinuousLiveView pinta la
 * presentación de ZONA; en cuanto hay metros, el héroe pasa a ser el ritmo.
 */
export const GPS_FIX_S = 20;

/** Velocidad (m/s) en el segundo `t`: salida en ritmo, repecho y vuelta al ritmo. */
function speedAt(t: number): number {
  if (t < 90) return 3.55 + (3.7 - 3.55) * (t / 90);
  if (t < 135) return 3.45; // el repecho: sube el pulso y baja el ritmo
  return 3.68;
}

/** FC (ppm) en el segundo `t`: subida inicial, deriva y el repecho que se va a Z4. */
function bpmAt(t: number): number {
  if (t < 14) return 118 + (136 - 118) * (t / 14);
  if (t < 70) return 136 + (146 - 136) * ((t - 14) / 56);
  if (t < 115) return 146 + (157 - 146) * ((t - 70) / 45);
  if (t < 155) return 157 - (157 - 147) * ((t - 115) / 40);
  return 147 + 2.5 * Math.sin((t - 155) / 19);
}

export interface EstadoCarrera {
  bpm: number;
  zona: 1 | 2 | 3 | 4 | 5;
  /** Metros medidos, o null mientras el GPS no da distancia. */
  distanciaM: number | null;
  /** Ritmo MEDIO recorrido (s/km) — `liveCoveredPaceSecPerKm`, no el instantáneo. */
  ritmoSecKm: number | null;
  /** % del tramo dentro de la zona objetivo, o null sin muestras. */
  pctEnZona: number | null;
}

/**
 * El estado del vivo en el segundo `t`. Integra velocidad y zonas segundo a
 * segundo, igual que el motor acumula `lapZoneAccumSec` mientras corre.
 */
export function estadoCarrera(t: number, objetivo: number): EstadoCarrera {
  let metros = 0;
  let segundosEnObjetivo = 0;
  for (let s = 0; s < t; s++) {
    metros += speedAt(s);
    if (hrZone(bpmAt(s), UMBRAL_BPM) === objetivo) segundosEnObjetivo++;
  }
  const bpm = Math.round(bpmAt(t));
  const distanciaM = t >= GPS_FIX_S ? metros : null;
  return {
    bpm,
    zona: hrZone(bpm, UMBRAL_BPM),
    distanciaM,
    ritmoSecKm: distanciaM && distanciaM > 0 ? Math.round(t / (distanciaM / 1000)) : null,
    pctEnZona: t > 0 ? Math.round((segundosEnObjetivo / t) * 100) : null,
  };
}

// ---------------------------------------------------------------------------
// Guion 2 · «Fuerza: series y descanso»
// ---------------------------------------------------------------------------

export const FUERZA = {
  /** El nombre solo asoma en el «Luego» del descanso: la tabla de series no lo repite. */
  ejercicio: 'Sentadilla trasera',
  series: 5,
  cargaKg: 100,
  reps: 5,
  rir: 2,
  descansoS: 90,
} as const;

/** La puerta del bloque siguiente — estructural, así que su chip es el recuento. */
export const PUERTA_VUELTA_CALMA = {
  status: 'Bloque 2 / 2',
  eyebrow: 'Último · ahora',
  titulo: 'Vuelta a la calma',
  chips: ['3 ejercicios'],
} as const;

// ---------------------------------------------------------------------------
// Guion 3 · «Parciales»
// ---------------------------------------------------------------------------

/**
 * Los tres tramos de 1 km recién cerrados. Cada tramo de trabajo de una carrera
 * estructurada cierra su propia vuelta con el título del segmento, por eso los
 * tres comparten nombre. 13:47 en 3 km ≈ 4:35 /km.
 */
export const PARCIALES: ReadonlyArray<{ titulo: string; segundos: number }> = [
  { titulo: 'Carrera', segundos: 276 },
  { titulo: 'Carrera', segundos: 273 },
  { titulo: 'Carrera', segundos: 278 },
];
