// HKWorkoutActivityType.rawValue → nuestra modalidad de tramo.
//
// Apple publica enteros estables (Running=37, Walking=52, …). Lo que no entra
// en correr / remo / ski / bici / fuerza es `other`: no abrimos un cubo por
// cada deporte que el reloj sepa nombrar.

import type { SegmentModality } from '@fahybrid/shared/domain/segment-modality';

/** Raw values we actually map. Everything else → other. */
// Walking (52) y hiking (24) NO son `run`: un paseo a 17 min/km dentro del cubo
// de correr envenena todo lo que se calcula sobre él (volumen «cuánto corres»,
// eficiencia al mismo pulso, medias por tipo). Se quedan en `other`, donde su
// carga y sus zonas siguen contando sin disfrazarse de kilómetros corridos.
// La migración 0192 reparó lo ya importado con este mismo criterio.
const HK_RUN = new Set([37, 71]); // running, wheelchairRunPace
const HK_ROW = new Set([35]); // rowing
const HK_SKI = new Set([60]); // crossCountrySkiing
const HK_BIKE = new Set([13, 74]); // cycling, handCycling
const HK_STRENGTH = new Set([20, 50, 59, 63]); // functional, traditional, core, HIIT

export function healthkitActivityToModality(
  raw: number | null | undefined,
): SegmentModality {
  if (raw == null || !Number.isFinite(raw)) return 'other';
  const n = Math.trunc(raw);
  if (HK_RUN.has(n)) return 'run';
  if (HK_ROW.has(n)) return 'row';
  if (HK_SKI.has(n)) return 'ski';
  if (HK_BIKE.has(n)) return 'bike';
  if (HK_STRENGTH.has(n)) return 'strength';
  return 'other';
}

const TITLES: Record<number, string> = {
  8: 'Boxeo',
  13: 'Bici',
  16: 'Elíptica',
  20: 'Fuerza',
  24: 'Senderismo',
  35: 'Remo',
  37: 'Carrera',
  46: 'Natación',
  50: 'Fuerza',
  52: 'Caminata',
  57: 'Yoga',
  59: 'Core',
  60: 'Ski de fondo',
  63: 'HIIT',
  68: 'Escaleras',
  73: 'Cardio',
};

export function healthkitActivityTitle(raw: number | null | undefined): string {
  if (raw == null || !Number.isFinite(raw)) return 'Entreno';
  return TITLES[Math.trunc(raw)] ?? 'Entreno';
}
