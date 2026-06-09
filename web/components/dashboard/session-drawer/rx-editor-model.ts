// rx-editor-model — pure helpers for PrescriptionEditorV2 (no React). The
// editor presents the canonical Prescription through a "uniform sets" lens
// ("4 series iguales") and only drops to the per-set table on demand; these
// helpers derive that view and describe the current combination in natural
// language for the validity line.

import type {
  Measure,
  Prescription,
  PrescriptionSet,
  Target,
} from '@fahybrid/shared/domain/prescription';
import { setMeasure, setTarget } from '@fahybrid/shared/domain/prescription';
import {
  TARGET_LABEL,
  blockMeasureOf,
} from '@/components/dashboard/programming/studio/prescription-model';
import { MEASURE_FIELD_LABEL } from './prescription-presets';

// ── Uniform-sets view (the collapsed "N series iguales" representation) ──────
export interface SetsView {
  count: number;
  measure: Measure | undefined;
  target: Target | undefined;
  rest_s: number | undefined;
  uniform: boolean;
}

function sameJson(values: unknown[]): boolean {
  if (values.length <= 1) return true;
  const first = JSON.stringify(values[0] ?? null);
  return values.every((v) => JSON.stringify(v ?? null) === first);
}

export function setsView(sets: PrescriptionSet[], blockRest: number | undefined): SetsView {
  const measures = sets.map((s) => setMeasure(s));
  const targets = sets.map((s) => setTarget(s));
  const rests = sets.map((s) => s.rest_s);
  return {
    count: sets.length,
    measure: measures[0],
    target: targets[0],
    rest_s: rests[0] ?? blockRest,
    uniform: sameJson(measures) && sameJson(targets) && sameJson(rests),
  };
}

/** Whether this prescription edits as a per-set strength-style table. */
export function isPerSetShape(p: Prescription): boolean {
  if (p.scheme === 'sets') return true;
  const n = p.sets?.length ?? 0;
  return (p.scheme === 'interval' || p.scheme === 'rounds' || p.scheme === 'for_time') && n > 1;
}

// Natural description of the current combination, for the validity line:
// "reps + %RM + descanso".
export function comboDescription(p: Prescription): string {
  const parts: string[] = [];
  const m = p.sets?.length ? setMeasure(p.sets[0]!) : blockMeasureOf(p);
  if (m) parts.push(MEASURE_FIELD_LABEL[m.kind].toLowerCase());
  const t = p.sets?.length ? setTarget(p.sets[0]!) ?? p.target : p.target;
  if (t) parts.push(TARGET_LABEL[t.kind]);
  const hasRest = p.rest_s !== undefined || p.sets?.some((s) => s.rest_s !== undefined);
  if (hasRest) parts.push('descanso');
  return parts.join(' + ');
}
