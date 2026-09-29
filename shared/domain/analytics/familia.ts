// LA FAMILIA DE UN TRAMO — a qué «¿mejoro?» pertenece (modelo §3, A9).
//
// Un tramo ejecutado lleva su modalidad de aparato (`segment_executions.modality`:
// run | row | ski | bike | strength | other), el ejercicio que era (su modalidad
// y su categoría del catálogo, 0053) y el formato del bloque en el que iba
// (`context_format`, 0120). Ninguno solo dice la familia: `other` es una
// estación HYROX, un WOD o una movilidad según el ejercicio y el formato. Aquí
// se decide UNA vez, con la misma regla para lo hecho y para lo planificado,
// para que «horas de estaciones» signifique lo mismo en las dos series.
//
// MECANISMO, no método: no hay número que otro entrenador pondría distinto.

import type { Familia } from './lectura';

/** Los formatos de un metcon con puntuación (`prescription/format.ts`). */
const FORMATOS_WOD: ReadonlySet<string> = new Set([
  'amrap',
  'for_time',
  'emom',
  'tabata',
  'death_by',
  'chipper',
  'ladder',
  'rounds',
]);

export interface EntradaFamilia {
  /** Modalidad del tramo (vocabulario de tramos) o de la línea del plan (la del ejercicio). */
  modalidad: string | null;
  /** `exercises.modality` (0053): run | row | ski | bike | strength | functional | core | mobility | other. */
  exercise_modality: string | null;
  /** `exercises.category`: cardio | strength | skill | hyrox_station | mobility | plyometric | core. */
  exercise_category: string | null;
  /** Formato del bloque (`context_format` del tramo, `block_format` de la plantilla). */
  formato: string | null;
}

/**
 * La familia, en este orden de evidencia:
 *   1. una estación HYROX lo es por su ejercicio, vaya en el formato que vaya;
 *   2. la modalidad del APARATO manda (correr, remo, ski, bici, fuerza);
 *   3. si el aparato no lo dice, la del ejercicio;
 *   4. un simulacro HYROX es estaciones; un formato de metcon es WOD;
 *   5. lo demás (calentamiento, core, movilidad, funcional suelto) es «otro».
 */
export function familiaDe(e: EntradaFamilia): Familia {
  if (e.exercise_category === 'hyrox_station') return 'estaciones';

  const aparato = porModalidad(e.modalidad);
  if (aparato) return aparato;
  const ejercicio = porModalidad(e.exercise_modality);
  if (ejercicio) return ejercicio;

  if (e.formato === 'hyrox_sim') return 'estaciones';
  if (e.formato != null && FORMATOS_WOD.has(e.formato)) return 'wod';
  return 'otro';
}

function porModalidad(m: string | null): Familia | null {
  switch (m) {
    case 'run':
      return 'correr';
    case 'row':
      return 'remo';
    case 'ski':
      return 'ski';
    case 'bike':
      return 'bici';
    case 'strength':
      return 'fuerza';
    default:
      return null;
  }
}
