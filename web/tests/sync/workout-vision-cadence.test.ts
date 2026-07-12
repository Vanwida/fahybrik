/**
 * Pure unit tests for the vision → proposal mapper's mig-0124 routing: on a RUN
 * capture the device "spm" is CADENCE (→ run_cadence_spm) and any incline maps to
 * incline_pct; on an ERG capture the same "spm" stays stroke rate. No DB / no LLM.
 */
import { describe, expect, test } from 'vitest';
import { mapVisionToProposal } from '@/lib/sync/workout-vision';
import type { PrescriptionContext, PrescribedItemContext } from '@/lib/sync/workout-vision';
import type { Modality } from '@fahybrid/shared/domain/prescription';

function ctxFor(modality: Modality): PrescriptionContext {
  const item: PrescribedItemContext = {
    uid: 'i1',
    modality,
    measure: 'distance',
    measure_value: 1000,
    target: 'pace',
    reps: null,
    rest_s: null,
    text: 'test',
    template_segment_id: 1,
  };
  return { primary_modality: modality, format: 'intervals', summary: '', bouts_expected: null, items: [item] };
}

// A full VisionRaw literal (every key present; the mapper reads them structurally).
function rawWith(over: Record<string, unknown>): Parameters<typeof mapVisionToProposal>[0]['raw'] {
  return {
    total_time_s: 240,
    distance_m: 1000,
    avg_pace_s: 240,
    best_pace_s: null,
    pace_unit: null,
    avg_hr: 160,
    max_hr: null,
    calories: null,
    avg_spm: null,
    avg_incline_pct: null,
    avg_power_w: null,
    training_load: null,
    splits: [],
    zones: [],
    uncertain: [],
    notes: null,
    ...over,
  } as Parameters<typeof mapVisionToProposal>[0]['raw'];
}

describe('mapVisionToProposal — spm routes by modality (mig 0124)', () => {
  test('a RUN capture routes avg_spm to run_cadence_spm (not stroke_rate_spm) and maps incline', () => {
    const raw = rawWith({
      avg_spm: 176,
      avg_incline_pct: 6,
      splits: [{ index: 1, item_uid: 'i1', time_s: 240, distance_m: 1000, pace_s: 240, spm: 178, incline_pct: 5, avg_hr: 160, power_w: null, calories: null }],
    });
    const p = mapVisionToProposal({ raw, ctx: ctxFor('run'), app: 'garmin', model: 'test' });

    // Totals: cadence in its own field, stroke rate untouched.
    expect(p.metrics.run_cadence_spm.value).toBe(176);
    expect(p.metrics.stroke_rate_spm.value).toBeNull();
    expect(p.metrics.incline_pct.value).toBe(6);

    // The confirm payload carries the run signals on the segment (→ persisted columns).
    const seg = p.proposed_execution.segments?.[0] as Record<string, unknown> | undefined;
    expect(seg?.run_cadence_spm).toBe(178);
    expect(seg?.incline_pct).toBe(5);
    expect(seg?.stroke_rate_spm).toBeUndefined();
  });

  test('an ERG (row) capture keeps avg_spm as stroke_rate_spm, no run cadence', () => {
    const raw = rawWith({
      avg_pace_s: 110,
      avg_spm: 30,
      splits: [{ index: 1, item_uid: 'i1', time_s: 110, distance_m: 500, pace_s: 110, spm: 30, incline_pct: null, avg_hr: 160, power_w: 280, calories: null }],
    });
    const p = mapVisionToProposal({ raw, ctx: ctxFor('row'), app: 'concept2', model: 'test' });

    expect(p.metrics.stroke_rate_spm.value).toBe(30);
    expect(p.metrics.run_cadence_spm.value).toBeNull();

    const seg = p.proposed_execution.segments?.[0] as Record<string, unknown> | undefined;
    expect(seg?.stroke_rate_spm).toBe(30);
    expect(seg?.run_cadence_spm).toBeUndefined();
  });
});
