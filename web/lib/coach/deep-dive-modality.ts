// EL REPARTO DE LA SEMANA DEL DEEP DIVE — de qué fue el trabajo de los últimos
// 7 días, en horas, %, km de carrera y kilos de fuerza. Puro (sin BD): el
// cargador (`athlete-deep-dive.ts#loadModality`) trae un tramo por fila y esto lo
// clasifica y suma.
//
// CLASIFICAR POR LO QUE SE HIZO, NO POR LA PLANTILLA. Antes se leía la categoría
// del ejercicio de la PLANTILLA (`template_segments.exercise_id`): un entreno
// libre, una importación de Apple Salud o un tramo sin enlace no tenían plantilla
// y desaparecían del reparto. Y la categoría `cardio` caía entera en «running»:
// un remo o un SkiErg sumaban sus metros a los km de correr. Ahora manda la
// modalidad del TRAMO (`segment_executions.modality`, la canónica que ya usan
// zonas y volumen, `SEG_MODALITY_SQL`); el ejercicio (el del tramo, o el de su
// línea prescrita si no lo trae) solo decide lo que la modalidad no dice — una
// estación HYROX, movilidad, técnica.
//
// LOS PORCENTAJES SUMAN 100: se reparten sobre el tiempo de TODOS los tramos
// clasificados (nada se queda fuera: lo que no encaja es «other») y se redondean
// por restos mayores. Antes cada fila pisaba el % de la anterior con la misma
// clave (core y fuerza, técnica y pliometría) y lo sin categoría contaba en el
// total sin salir en ninguna fila.

import { largestRemainder } from '@fahybrid/shared/domain/goal-gap';
import { toSegmentModality } from '@fahybrid/shared/domain/segment-modality';
import { segmentVolumeKg, type VolumeSet } from '@fahybrid/shared/domain/strength';
import type { ModalityKey, ModalityRow } from './deep-dive-types';

/** Un tramo de la ventana, como lo trae el cargador. */
export interface ModalitySegment {
  /** Modalidad canónica del tramo (`SEG_MODALITY_SQL`). */
  modality: string | null;
  /** Categoría del ejercicio (`exercises.category`), si hay ejercicio. */
  category: string | null;
  /** Modalidad del ejercicio (`exercises.modality`), para un `cardio` sin modalidad de tramo. */
  exercise_modality: string | null;
  seconds: number;
  meters: number;
  reps_completed: number | null;
  weight_used_kg: number | null;
  sets: ReadonlyArray<VolumeSet>;
}

const ERG = new Set(['row', 'ski', 'bike']);

/** El cubo del reparto al que pertenece un tramo. */
export function modalityBucket(seg: Pick<ModalitySegment, 'modality' | 'category' | 'exercise_modality'>): ModalityKey {
  const m = toSegmentModality(seg.modality);
  if (m === 'run') return 'running';
  if (ERG.has(m)) return 'erg';
  // Una estación HYROX es HYROX aunque el tramo diga «fuerza» (un trineo, unos
  // lunges con saco): la categoría del movimiento es más precisa que la modalidad.
  if (seg.category === 'hyrox_station') return 'hyrox';
  if (m === 'strength') return 'strength';
  switch (seg.category) {
    case 'strength':
    case 'core':
      return 'strength';
    case 'skill':
    case 'plyometric':
      return 'skill';
    case 'mobility':
      return 'recovery';
    case 'cardio': {
      const em = toSegmentModality(seg.exercise_modality);
      if (em === 'run') return 'running';
      if (ERG.has(em)) return 'erg';
      return 'other';
    }
    default:
      return 'other';
  }
}

const LABEL: Record<ModalityKey, string> = {
  running: 'Running',
  erg: 'Erg',
  strength: 'Strength',
  hyrox: 'HYROX-spec',
  skill: 'Skill/Mob',
  recovery: 'Recovery',
  other: 'Other',
};

const ORDER: readonly ModalityKey[] = ['running', 'erg', 'strength', 'hyrox', 'skill', 'recovery', 'other'];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Las filas del reparto, en orden fijo. `km` solo en running (metros de tramos de
 * carrera), `kg` solo en strength (tonelaje, `segmentVolumeKg`). Los % suman 100
 * cuando hubo tiempo; todo 0 si no.
 */
export function buildModalityRows(segments: ReadonlyArray<ModalitySegment>): {
  rows: ModalityRow[];
  total_seconds: number;
} {
  const seconds = new Map<ModalityKey, number>(ORDER.map((k) => [k, 0]));
  let runMeters = 0;
  let strengthKg = 0;
  for (const seg of segments) {
    const key = modalityBucket(seg);
    seconds.set(key, (seconds.get(key) ?? 0) + Math.max(0, seg.seconds));
    if (key === 'running') runMeters += Math.max(0, seg.meters);
    if (key === 'strength') {
      strengthKg +=
        segmentVolumeKg({ sets: seg.sets, reps_completed: seg.reps_completed, weight_used_kg: seg.weight_used_kg }) ?? 0;
    }
  }
  const total = ORDER.reduce((sum, k) => sum + (seconds.get(k) ?? 0), 0);
  const pcts = total > 0 ? largestRemainder(ORDER.map((k) => (seconds.get(k) ?? 0) / total), 100) : ORDER.map(() => 0);

  const rows: ModalityRow[] = ORDER.map((key, i) => ({
    key,
    label: LABEL[key],
    hours: round2((seconds.get(key) ?? 0) / 3600),
    pct: pcts[i] ?? 0,
    km: key === 'running' ? round1(runMeters / 1000) : null,
    kg: key === 'strength' ? Math.round(strengthKg) : null,
  }));
  return { rows, total_seconds: total };
}
