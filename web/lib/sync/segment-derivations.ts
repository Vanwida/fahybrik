// Lo que la ingesta de tramos deriva de cada tramo que manda el móvil, sin tocar
// la base: la modalidad canónica, la duración honesta, el trabajo previo y la
// atribución de tramo de una carrera estructurada. Aparte de
// ingest-execution-segments.ts (que escribe las filas), que lo re-exporta.

import type { SegmentModality } from '@fahybrid/shared/domain/segment-modality';
import { coerceWireInstant } from '@/lib/sync/wire-instant';
import {
  sanitizeDurationSeconds,
  sanitizeLegPhase,
  sanitizeLegRole,
  sanitizeNonNegativeInt,
} from '@/lib/sync/sanitize-measurement';
import type { SegmentInput } from '@/lib/sync/segment-input-schema';

/** Normalise a free-ish modality string from the client to the canonical set. */
export function normalizeModality(raw: string | null | undefined): SegmentModality {
  if (!raw) return 'other';
  const v = raw.trim().toLowerCase();
  switch (v) {
    case 'run':
    case 'running':
      return 'run';
    case 'row':
    case 'rowing':
    case 'rowerg':
    case 'row-erg':
      return 'row';
    case 'ski':
    case 'skierg':
    case 'ski-erg':
      return 'ski';
    case 'bike':
    case 'bikeerg':
    case 'bike-erg':
    case 'cycling':
    case 'assault-bike':
      return 'bike';
    case 'strength':
    case 'lift':
    case 'weights':
      return 'strength';
    default:
      return 'other';
  }
}

/**
 * La modalidad de un EJERCICIO (las nueve de 0053) en el vocabulario de los tramos
 * (seis). Funcional, core, movilidad y «otro» caen en `other`: el vocabulario de
 * tramos es estrecho a propósito (`shared/domain/segment-modality.ts`), y lo que un
 * tramo funcional ES lo sigue diciendo su `exercise_id`.
 */
export function segmentModalityOfExercise(raw: string | null | undefined): SegmentModality {
  switch (raw) {
    case 'run':
    case 'row':
    case 'ski':
    case 'bike':
    case 'strength':
      return raw;
    default:
      return 'other';
  }
}

/** El ejercicio al que quedó enlazado un tramo, y si su bloque es de una sola modalidad. */
export interface LinkedExercise {
  /** `exercises.modality` (0053). */
  modality: string | null;
  /** Todos los ejercicios del bloque del segmento caen en la misma modalidad de tramo. */
  blockSingleModality: boolean;
}

/**
 * CON QUÉ SE HIZO UN TRAMO (DECISIONS 2026-09-28). Lo decide, por este orden:
 *   1. una CINTA: si sus números salen de la cinta, es correr (una cinta solo mide
 *      carrera o marcha, diga lo que diga el cable);
 *   2. el EJERCICIO enlazado (0053: la modalidad es del ejercicio, no del cable):
 *      · bloque de una sola modalidad → la del ejercicio, sea el tramo un ejercicio
 *        o el bloque entero plegado;
 *      · bloque que MEZCLA modalidades → si el cable dice `other`, el tramo es el
 *        bloque plegado (un WOD de varios movimientos no tiene una modalidad) y se
 *        queda en `other`; si nombra una, es el tramo de ESE ejercicio y manda él
 *        (un SkiErg que el aparato llamó «row» es ski);
 *   3. sin ejercicio, lo que diga el cable.
 */
export function tramoModality(args: {
  wire: string | null | undefined;
  source: string | null | undefined;
  exercise: LinkedExercise | null;
}): SegmentModality {
  if (args.source?.trim().toLowerCase() === 'treadmill') return 'run';
  const wire = normalizeModality(args.wire);
  if (!args.exercise) return wire;
  const fromExercise = segmentModalityOfExercise(args.exercise.modality);
  if (args.exercise.blockSingleModality) return fromExercise;
  return wire === 'other' ? 'other' : fromExercise;
}

/**
 * Honest per-segment duration in whole seconds: explicit `duration_seconds`
 * wins; else derive it from explicit started/ended timestamps; else UNKNOWN
 * (null) — we never invent a duration from the execution window.
 *
 * Exported because the execution recorder ranks the tramos by this SAME
 * duration to pick `totals_source` (the longest tramo owns the totals). One
 * rule, one place: a second definition would let the two disagree.
 */
export function segmentDurationSeconds(seg: SegmentInput): number | null {
  const explicit = sanitizeDurationSeconds(seg.duration_seconds);
  if (explicit != null) return explicit;
  const started = coerceWireInstant(seg.started_at);
  const ended = coerceWireInstant(seg.ended_at);
  if (started && ended) {
    const d = (new Date(ended).getTime() - new Date(started).getTime()) / 1000;
    return Number.isFinite(d) && d >= 0 ? Math.round(d) : null;
  }
  return null;
}

/**
 * prior_work_s for one segment = summed duration of the payload segments that
 * come BEFORE it (lower position) — a fatigue proxy for analytics/prediction.
 * Honest-or-nothing: if ANY earlier segment has no measurable duration, prior
 * work is unknown → null (never a partial sum). The first segment has 0 prior
 * work — a fact, not a fabrication.
 */
export function priorWorkSeconds(segments: SegmentInput[], current: SegmentInput): number | null {
  let sum = 0;
  for (const s of segments) {
    if (s.position >= current.position) continue;
    const d = segmentDurationSeconds(s);
    if (d == null) return null;
    sum += d;
  }
  return sanitizeNonNegativeInt(sum);
}

/**
 * La atribución de tramo de una carrera estructurada (mig 0146): índice plano +
 * rol + fase. TODO o NADA — el CHECK `segment_executions_leg_all_or_none_chk` lo
 * exige, y por una razón: media atribución no responde ninguna de las dos
 * preguntas para las que existe (¿contra qué tramo prescrito casa? ¿es una serie
 * o el trote de vuelta?). Un cliente que mande solo una parte aterriza como «esta
 * fila no es un bout de carrera», que es la respuesta honesta.
 */
export function legAttribution(seg: SegmentInput): {
  index: number | null;
  role: string | null;
  phase: string | null;
} {
  const index = sanitizeNonNegativeInt(seg.leg_index);
  const role = sanitizeLegRole(seg.leg_role);
  const phase = sanitizeLegPhase(seg.leg_phase);
  if (index == null || role == null || phase == null) {
    return { index: null, role: null, phase: null };
  }
  return { index, role, phase };
}
