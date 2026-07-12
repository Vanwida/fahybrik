// Archetype PREFILLS for the run-structure editor. Picking an archetype fills the
// PRINCIPAL phase with a ready, valid, editable sequence in the sport's vocabulary
// — so the coach starts from "Progresivo" and tweaks distances/zones, instead of
// an empty list. These are NOT new schemes (agnostic rule): they seed the SAME
// RunStructure grammar. All numbers are sensible defaults Pablo edits.

import type {
  Element,
  Segment,
  SegmentMeasure,
  SegmentTarget,
} from '@fahybrid/shared/domain/prescription';

export type RunArchetypeId = 'series' | 'progresivo' | 'fartlek' | 'cuestas' | 'piramide';

export interface RunArchetype {
  id: RunArchetypeId;
  name: string;
  hint: string;
  icon: string;
}

// Ordered the way a coach reaches for them.
export const RUN_ARCHETYPES: RunArchetype[] = [
  { id: 'series', name: 'Series', hint: 'N × distancia @ ritmo + recuperación', icon: 'repeat' },
  { id: 'progresivo', name: 'Progresivo', hint: 'Tramos que suben de zona', icon: 'trending_up' },
  { id: 'fartlek', name: 'Fartlek', hint: 'Cambios de ritmo fuerte/suave por RPE', icon: 'bolt' },
  { id: 'cuestas', name: 'Cuestas', hint: 'Repeticiones en pendiente, bajada andando', icon: 'landscape' },
  { id: 'piramide', name: 'Pirámide', hint: 'Distancias que suben y bajan', icon: 'change_history' },
];

const dist = (m: number): SegmentMeasure => ({ type: 'distance', m });
const dur = (s: number): SegmentMeasure => ({ type: 'duration', s });
const paceZone = (zone: number): SegmentTarget => ({ type: 'pace_zone', zone });
const rpe = (value: number): SegmentTarget => ({ type: 'rpe', value });

const work = (measure: SegmentMeasure, target: SegmentTarget | null, extra: Partial<Segment> = {}): Segment => ({
  kind: 'work',
  measure,
  target,
  ...extra,
});
const rec = (measure: SegmentMeasure, mode: Segment['recovery_mode'], target: SegmentTarget | null = null): Segment => ({
  kind: 'recovery',
  measure,
  target,
  recovery_mode: mode,
});

/** The PRINCIPAL-phase elements each archetype seeds. */
export function prefillElements(id: RunArchetypeId): Element[] {
  switch (id) {
    case 'series':
      return [{ times: 6, elements: [work(dist(1000), paceZone(3)), rec(dur(90), 'parado')] }];
    case 'progresivo':
      return [work(dist(2000), paceZone(2)), work(dist(2000), paceZone(3)), work(dist(1000), paceZone(4))];
    case 'fartlek':
      return [{ times: 8, elements: [work(dur(120), rpe(8)), rec(dur(60), 'trote', rpe(3))] }];
    case 'cuestas':
      return [{ times: 8, elements: [work(dist(200), rpe(9), { incline_pct: 8 }), rec(dist(200), 'caminar')] }];
    case 'piramide':
      return [
        work(dist(400), paceZone(4)),
        rec(dur(90), 'parado'),
        work(dist(800), paceZone(4)),
        rec(dur(90), 'parado'),
        work(dist(1200), paceZone(3)),
        rec(dur(90), 'parado'),
        work(dist(800), paceZone(4)),
        rec(dur(90), 'parado'),
        work(dist(400), paceZone(4)),
      ];
  }
}

/** A default warm-up / cool-down phase body (a single easy Z1 bout). */
export function defaultWarmupElements(): Element[] {
  return [work(dur(600), paceZone(1))];
}
export function defaultCooldownElements(): Element[] {
  return [work(dur(600), paceZone(1))];
}
