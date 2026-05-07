import type { BuilderSegment } from './template-types';

export interface SegmentWarning {
  uid: string;
  index: number;
  message: string;
}

// Non-blocking validation: missing zones, missing rest, empty params.
// Triggered on save but rendered live in sidebar so Pablo can fix as he edits.
export function validateSegments(segments: BuilderSegment[]): SegmentWarning[] {
  const out: SegmentWarning[] = [];
  segments.forEach((s, i) => {
    const p = s.params_json;
    const cat = s.exercise_category;

    if (cat === 'cardio') {
      if (!p.hr_zone) push('falta target HR');
      if (!p.distance_meters && !p.time_seconds) push('falta distancia o tiempo');
    }
    if (cat === 'strength') {
      if (!p.sets || !p.reps) push('faltan series×reps');
      if (!p.weight_kg && !p.weight_pct_1rm) push('falta carga');
      if (p.rest_seconds == null) push('falta rest');
    }
    if (cat === 'hyrox_station') {
      if (!p.distance_meters && !p.reps) push('falta distancia o reps');
    }
    if (cat === 'skill') {
      if (!p.reps && !p.time_seconds) push('falta reps o tiempo');
    }
    if (cat === 'mobility' || cat === 'plyometric' || cat === 'core') {
      if (!p.reps && !p.time_seconds && !p.sets) push('faltan parámetros');
    }

    function push(message: string) {
      out.push({ uid: s.uid, index: i, message });
    }
  });
  return out;
}
