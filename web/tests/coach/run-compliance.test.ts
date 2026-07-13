// Pure unit tests for the coach run-compliance WIRE (#66) — buildRunCompliance
// takes assembled workout blocks + logged actuals and returns per-tramo verdicts
// + the session aggregate. No DB: synthetic AssignmentDetailWorkout / SegmentActual.

import { describe, expect, test } from 'vitest';
import { buildRunCompliance } from '@/lib/dashboard/coach/run-compliance';
import type {
  AssignmentDetailItem,
  AssignmentDetailWorkout,
  ResolvedIntensity,
} from '@/lib/athlete/assignment-detail';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';

// ── fixtures ──────────────────────────────────────────────────────────────────
let seq = 0;
function makeItem(overrides: Partial<AssignmentDetailItem>): AssignmentDetailItem {
  const id = ++seq;
  return {
    uid: `segment-${id}`,
    template_segment_id: id,
    exercise_id: String(id),
    exercise_name: 'Carrera',
    exercise_slug: 'run',
    exercise_category: 'run',
    exercise_video_url: null,
    cues: null,
    params_json: {},
    prescription_json: null,
    resolved_intensity: null,
    resolved_load: null,
    notes: null,
    ...overrides,
  };
}

function runItem(prescription: Prescription, resolved?: ResolvedIntensity, uid?: string): AssignmentDetailItem {
  return makeItem({
    ...(uid ? { uid, template_segment_id: Number(uid.replace('segment-', '')) } : {}),
    prescription_json: prescription,
    resolved_intensity: resolved ?? null,
  });
}

function zoneBand(fast_s: number, slow_s: number | null): ResolvedIntensity {
  return { zone_label: 'Z4', range_label: 'banda', fast_s, slow_s, pace_unit: 'per_km', needs_review: false };
}

function workout(items: AssignmentDetailItem[]): AssignmentDetailWorkout {
  return {
    name: 'Sesión',
    focus: null,
    coach_note: null,
    estimated_duration_minutes: null,
    blocks: [
      { uid: 'b1', title: 'Principal', format: 'intervals', block_position: 0, coach_note: null, config_json: {}, items },
    ],
  };
}

function lap(item_uid: string, position: number, over: Partial<SegmentActual> = {}): SegmentActual {
  return {
    position,
    item_uid,
    modality: 'run',
    duration_seconds: null,
    reps_completed: null,
    weight_used_kg: null,
    distance_meters: null,
    avg_pace_s_per_500m: null,
    avg_pace_s_per_km: null,
    avg_power_w: null,
    stroke_rate_spm: null,
    avg_hr: null,
    max_hr: null,
    calories: null,
    incline_pct: null,
    run_cadence_spm: null,
    drag_factor: null,
    avg_calories_per_hour: null,
    peak_drive_force_lbs: null,
    avg_drive_force_lbs: null,
    erg_splits: null,
    ...over,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────
describe('buildRunCompliance — zone tramo (resolved band)', () => {
  const presc: Prescription = { scheme: 'steady', modality: 'run', target: { kind: 'hr_zone', value: 4 } };

  test('executed pace inside the resolved band → dentro, 100%', () => {
    const item = runItem(presc, zoneBand(245, 255), 'segment-100');
    const res = buildRunCompliance(workout([item]), [lap('segment-100', 1, { avg_pace_s_per_km: 250 })]);
    expect(res.tramos).toEqual([{ item_uid: 'segment-100', position: 1, verdict: 'dentro' }]);
    expect(res.summary.pct_dentro).toBe(100);
    expect(res.summary.evaluable).toBe(1);
  });

  test('faster than the resolved band → fuera_rapido', () => {
    const item = runItem(presc, zoneBand(245, 255), 'segment-101');
    const res = buildRunCompliance(workout([item]), [lap('segment-101', 1, { avg_pace_s_per_km: 238 })]);
    expect(res.tramos[0]!.verdict).toBe('fuera_rapido');
    expect(res.summary.pct_dentro).toBe(0);
  });

  test('a zone with no resolved snapshot → sin_dato (never fabricated)', () => {
    const item = runItem(presc, undefined, 'segment-102'); // athlete untested
    const res = buildRunCompliance(workout([item]), [lap('segment-102', 1, { avg_pace_s_per_km: 250 })]);
    expect(res.tramos[0]!.verdict).toBe('sin_dato');
    expect(res.summary.pct_dentro).toBeNull();
  });
});

describe('buildRunCompliance — explicit pace band tramo', () => {
  const presc: Prescription = {
    scheme: 'steady',
    modality: 'run',
    target: { kind: 'pace', unit: 'per_km', min_s: 265, max_s: 275 },
  };

  test('slower than the band → fuera_lento', () => {
    const item = runItem(presc, undefined, 'segment-110');
    const res = buildRunCompliance(workout([item]), [lap('segment-110', 1, { avg_pace_s_per_km: 300 })]);
    expect(res.tramos[0]!.verdict).toBe('fuera_lento');
  });

  test('pace derived from distance + duration when the lap has no pace column', () => {
    const item = runItem(presc, undefined, 'segment-111');
    // 1000 m in 270 s → 270 s/km → inside 265–275
    const res = buildRunCompliance(
      workout([item]),
      [lap('segment-111', 1, { distance_meters: 1000, duration_seconds: 270 })],
    );
    expect(res.tramos[0]!.verdict).toBe('dentro');
  });
});

describe('buildRunCompliance — non-run + no-execution', () => {
  test('a non-run item is ignored entirely', () => {
    const strength: Prescription = { scheme: 'sets', modality: 'strength', target: { kind: 'percent_rm', value: 80 } };
    const item = runItem(strength, undefined, 'segment-120');
    const res = buildRunCompliance(workout([item]), [lap('segment-120', 1, { modality: 'strength', avg_pace_s_per_km: 250 })]);
    expect(res.tramos).toEqual([]);
    expect(res.summary.total).toBe(0);
  });

  test('a prescribed run tramo with no execution → one sin_dato (position null)', () => {
    const presc: Prescription = { scheme: 'steady', modality: 'run', target: { kind: 'hr_zone', value: 2 } };
    const item = runItem(presc, zoneBand(300, null), 'segment-121');
    const res = buildRunCompliance(workout([item]), []);
    expect(res.tramos).toEqual([{ item_uid: 'segment-121', position: null, verdict: 'sin_dato' }]);
    expect(res.summary.total).toBe(1);
    expect(res.summary.evaluable).toBe(0);
  });
});

describe('buildRunCompliance — native/legacy multi-lap structure', () => {
  test('one template_segment executed as N laps → work segments zipped to laps in order', () => {
    // A legacy intervals block (2 rounds) → legacyToStructure expands to 2 work
    // segments; two laps under the same item_uid align to them positionally.
    const presc: Prescription = {
      scheme: 'intervals',
      modality: 'run',
      rounds: 2,
      work_s: 180,
      rest_s: 60,
      target: { kind: 'pace', unit: 'per_km', min_s: 245, max_s: 255 },
    };
    const item = runItem(presc, undefined, 'segment-130');
    const res = buildRunCompliance(workout([item]), [
      lap('segment-130', 1, { avg_pace_s_per_km: 250 }), // dentro
      lap('segment-130', 2, { avg_pace_s_per_km: 238 }), // fuera_rapido
    ]);
    expect(res.tramos.map((t) => t.verdict)).toEqual(['dentro', 'fuera_rapido']);
    expect(res.summary).toMatchObject({ total: 2, evaluable: 2, dentro: 1, fuera_rapido: 1, pct_dentro: 50 });
  });
});

describe('buildRunCompliance — session aggregate over a mixed session', () => {
  test('% counts only evaluable tramos across the whole session', () => {
    const warm = runItem(
      { scheme: 'steady', modality: 'run', target: { kind: 'hr_zone', value: 1 } },
      undefined, // no snapshot → sin_dato
      'segment-140',
    );
    const rep1 = runItem({ scheme: 'steady', modality: 'run', target: { kind: 'hr_zone', value: 5 } }, zoneBand(240, 250), 'segment-141');
    const rep2 = runItem({ scheme: 'steady', modality: 'run', target: { kind: 'hr_zone', value: 5 } }, zoneBand(240, 250), 'segment-142');
    const res = buildRunCompliance(workout([warm, rep1, rep2]), [
      lap('segment-140', 1, { avg_pace_s_per_km: 330 }),
      lap('segment-141', 2, { avg_pace_s_per_km: 245 }), // dentro
      lap('segment-142', 3, { avg_pace_s_per_km: 260 }), // fuera_lento
    ]);
    expect(res.summary.total).toBe(3);
    expect(res.summary.sin_dato).toBe(1);
    expect(res.summary.evaluable).toBe(2);
    expect(res.summary.pct_dentro).toBe(50); // 1 dentro of 2 evaluable
  });
});
