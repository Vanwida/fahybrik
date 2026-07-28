import { describe, expect, it } from 'vitest';
import { buildSegmentActuals, type SegmentActualRow } from '@/lib/dashboard/coach/session-actuals';

// A fully-null segment row (the real segment_executions shape); each test overrides
// just the fields under test — honest nulls everywhere else.
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
  source: null,
  raw_lap_data_json: null,
  ...over,
});

// #62 — the per-segment actuals carry the AVERAGE incline / cadence (mig 0124) so
// the athlete's executed-session detail (and the coach drawer) can show them. Pins
// the TYPES + the pg-numeric coercion; honest nulls never become a fabricated 0.
describe('session-actuals · buildSegmentActuals · incline / cadence (#62)', () => {
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

// mig 0134 — EMOM completion ("X/Y rondas hechas") rides the segment actuals so the
// coach drawer renders it beside the prescription. Integers carried verbatim; both
// null off an EMOM segment (honest absence, never a fabricated 0/0).
describe('session-actuals · buildSegmentActuals · EMOM rounds (mig 0134)', () => {
  it('carries emom_rounds_completed / emom_rounds_prescribed as integers', () => {
    const [a] = buildSegmentActuals([
      baseRow({ emom_rounds_completed: 5, emom_rounds_prescribed: 6 }),
    ]);
    expect(a!.emom_rounds_completed).toBe(5);
    expect(a!.emom_rounds_prescribed).toBe(6);
  });

  it('a fully-completed EMOM (X === Y) is carried, not collapsed', () => {
    const [a] = buildSegmentActuals([
      baseRow({ emom_rounds_completed: 8, emom_rounds_prescribed: 8 }),
    ]);
    expect(a!.emom_rounds_completed).toBe(8);
    expect(a!.emom_rounds_prescribed).toBe(8);
  });

  it('null rounds stay null off an EMOM segment — never a fabricated 0/0', () => {
    const [a] = buildSegmentActuals([baseRow()]);
    expect(a!.emom_rounds_completed).toBeNull();
    expect(a!.emom_rounds_prescribed).toBeNull();
  });
});

// The per-tramo apparatus (migs 0143/0144). The execution carries only the
// PRINCIPAL apparatus, so a mixed session — erg for one tramo, treadmill for the
// next — can only be told apart here. Carried verbatim: the raw token is what the
// engine stamped, and normalising it away would lose which monitor it actually was.
describe('session-actuals · buildSegmentActuals · per-tramo source', () => {
  it('carries the apparatus token of each tramo', () => {
    const actuals = buildSegmentActuals([
      baseRow({ position: 0, source: 'pm5' }),
      baseRow({ position: 1, source: 'treadmill' }),
    ]);
    expect(actuals.map((a) => a.source)).toEqual(['pm5', 'treadmill']);
  });

  it('an unstamped tramo reads null, never a guessed apparatus', () => {
    expect(buildSegmentActuals([baseRow()])[0]!.source).toBeNull();
  });
});

// Time in HR zones, written since the live engine shipped and never read back.
describe('session-actuals · buildSegmentActuals · zone_seconds', () => {
  it('folds the zones out of raw_lap_data_json, filling unvisited bands with 0', () => {
    // The engine partitions the whole tramo across the five bands, so an absent
    // band means zero time there — a fact, and it keeps the payload a fixed shape.
    const [a] = buildSegmentActuals([
      baseRow({ raw_lap_data_json: { zone_seconds: { z2: 120, z3: 60 } } }),
    ]);
    expect(a!.zone_seconds).toEqual({ z1: 0, z2: 120, z3: 60, z4: 0, z5: 0 });
  });

  it('coexists with the erg detail in the same blob', () => {
    const [a] = buildSegmentActuals([
      baseRow({ raw_lap_data_json: { zone_seconds: { z4: 300 }, drag_factor: 118 } }),
    ]);
    expect(a!.zone_seconds).toEqual({ z1: 0, z2: 0, z3: 0, z4: 300, z5: 0 });
    expect(a!.drag_factor).toBe(118);
  });

  it('no HR measured → null, never five zeroes pretending to be a measurement', () => {
    expect(buildSegmentActuals([baseRow()])[0]!.zone_seconds).toBeNull();
    expect(
      buildSegmentActuals([baseRow({ raw_lap_data_json: { drag_factor: 118 } })])[0]!.zone_seconds,
    ).toBeNull();
    expect(
      buildSegmentActuals([baseRow({ raw_lap_data_json: { zone_seconds: {} } })])[0]!.zone_seconds,
    ).toBeNull();
  });

  it('survives a double-encoded blob and a malformed one', () => {
    const [a] = buildSegmentActuals([
      baseRow({ raw_lap_data_json: JSON.stringify({ zone_seconds: { z1: 45 } }) }),
    ]);
    expect(a!.zone_seconds).toEqual({ z1: 45, z2: 0, z3: 0, z4: 0, z5: 0 });
    expect(buildSegmentActuals([baseRow({ raw_lap_data_json: 'not json' })])[0]!.zone_seconds).toBeNull();
  });
});
