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
