import { describe, expect, it } from 'vitest';
import { buildSegmentActuals, type SegmentActualRow } from '@/lib/dashboard/coach/session-actuals';

// #62 — the per-segment actuals carry the AVERAGE incline / cadence (mig 0124) so
// the athlete's executed-session detail (and the coach drawer) can show them. Pins
// the TYPES + the pg-numeric coercion; honest nulls never become a fabricated 0.
describe('session-actuals · buildSegmentActuals · incline / cadence (#62)', () => {
  const baseRow = (over: Partial<SegmentActualRow> = {}): SegmentActualRow => ({
    template_segment_id: '10',
    position: 0,
    modality: 'run',
    started_at: '2026-07-01T10:00:00Z',
    ended_at: '2026-07-01T10:05:00Z',
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
    emom_rounds_completed: null,
    emom_rounds_prescribed: null,
    incline_pct: null,
    run_cadence_spm: null,
    raw_lap_data_json: null,
    ...over,
  });

  it('coerces incline_pct (numeric string from pg) and carries run_cadence_spm', () => {
    const [a] = buildSegmentActuals([baseRow({ incline_pct: '2.5', run_cadence_spm: 178 })]);
    expect(a!.incline_pct).toBe(2.5);
    expect(a!.run_cadence_spm).toBe(178);
  });

  it('a numeric incline already coerced passes through unchanged', () => {
    const [a] = buildSegmentActuals([baseRow({ incline_pct: 8, run_cadence_spm: 182 })]);
    expect(a!.incline_pct).toBe(8);
    expect(a!.run_cadence_spm).toBe(182);
  });

  it('null incline / cadence stays null — never a fabricated 0', () => {
    const [a] = buildSegmentActuals([baseRow()]);
    expect(a!.incline_pct).toBeNull();
    expect(a!.run_cadence_spm).toBeNull();
  });
});
