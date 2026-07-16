// #34 — client-side draft model + mappers for the coach Tests editor. Bridges the
// wire shape (CoachCalibrationTest, from the API) and the editor form, and the form
// and the write input (CoachTestResultInput). The calibration catalog + baseline
// measures come from shared (the SAME source the server validates against), so the
// two dropdowns can never offer something the API would reject.

import type {
  CoachCalibrationTest,
  CoachTestResult,
} from '@/lib/coach/coach-tests';
import type {
  StoreResultMeasure,
  StoreResultUnit,
} from '@fahybrid/shared/schema/test-battery';
import type { CoachTestResultInput } from '@fahybrid/shared/schema/coach-tests';
import { CALIBRATION_TARGETS } from '@fahybrid/shared/domain/coach/test-battery';

/** One result being edited. A CALIBRATION result carries only a catalog target
 *  key (slug/measure/unit derived); a BASELINE result carries its own measure/unit.
 *  `optional` marks a result that never blocks the test's completion (#34). */
export type DraftResult =
  | { kind: 'calibration'; target: string; label: string; optional: boolean }
  | { kind: 'baseline'; measure: StoreResultMeasure; unit: StoreResultUnit; label: string; optional: boolean };

export interface DraftSchedule {
  week_offset: number;
  day_of_week: number;
}

/** The full test editing draft. `id === null` ⇒ creating. */
export interface TestDraft {
  id: string | null;
  name: string;
  protocol: string;
  format: string;
  enabled: boolean;
  results: DraftResult[];
  schedule: DraftSchedule[];
}

// The single <select> in the editor encodes both kinds in one value:
//   `cal:<targetKey>`  → a calibration target
//   `base:<measure>`   → a baseline measure (unit is derived)
export function encodeResultChoice(r: DraftResult): string {
  return r.kind === 'calibration' ? `cal:${r.target}` : `base:${r.measure}`;
}

/** Map a decoded <select> value back to a DraftResult, preserving label + optional. */
export function decodeResultChoice(value: string, label: string, optional: boolean): DraftResult {
  if (value.startsWith('cal:')) {
    return { kind: 'calibration', target: value.slice(4), label, optional };
  }
  const measure = value.slice(5) as StoreResultMeasure;
  return { kind: 'baseline', measure, unit: unitForMeasure(measure), label, optional };
}

/** The natural unit for a baseline measure (time→seconds, load→kg, …). */
export function unitForMeasure(measure: StoreResultMeasure): StoreResultUnit {
  switch (measure) {
    case 'time': return 'seconds';
    case 'distance': return 'meters';
    case 'reps': return 'reps';
    case 'calories': return 'calories';
    case 'load': return 'kg';
    default: return 'reps';
  }
}

function resultToDraft(r: CoachTestResult): DraftResult {
  if (r.derives !== 'none') {
    const target = CALIBRATION_TARGETS.find((t) => t.slug === r.slug && t.derives === r.derives);
    if (target) return { kind: 'calibration', target: target.key, label: r.label, optional: r.optional };
  }
  return { kind: 'baseline', measure: r.measure, unit: r.unit, label: r.label, optional: r.optional };
}

/** A new default result (a 5K-control run-zones calibration — the most common). */
export function defaultDraftResult(): DraftResult {
  const first = CALIBRATION_TARGETS[0]!;
  return { kind: 'calibration', target: first.key, label: '', optional: false };
}

export function emptyTestDraft(): TestDraft {
  return {
    id: null,
    name: '',
    protocol: '',
    format: 'test',
    enabled: true,
    results: [defaultDraftResult()],
    schedule: [{ week_offset: 1, day_of_week: 3 }],
  };
}

export function testToDraft(t: CoachCalibrationTest): TestDraft {
  return {
    id: t.id,
    name: t.name,
    protocol: t.protocol ?? '',
    format: t.format,
    enabled: t.enabled,
    results: t.results.map(resultToDraft),
    schedule: t.schedules.map((s) => ({ week_offset: s.week_offset, day_of_week: s.day_of_week })),
  };
}

export function draftResultToInput(d: DraftResult): CoachTestResultInput {
  const optional = d.optional ? { optional: true as const } : {};
  if (d.kind === 'calibration') {
    const label = d.label.trim();
    return label
      ? { kind: 'calibration', target: d.target, label, ...optional }
      : { kind: 'calibration', target: d.target, ...optional };
  }
  return { kind: 'baseline', measure: d.measure, unit: d.unit, label: d.label.trim(), ...optional };
}
