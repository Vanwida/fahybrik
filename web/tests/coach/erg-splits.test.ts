import { describe, expect, it } from 'vitest';
import { parseErgDetail } from '@/lib/execution/erg-splits';
import { buildSegmentActuals, type SegmentActualRow } from '@/lib/dashboard/coach/session-actuals';

// The PM5 erg-detail reader is TOLERANT by design: `raw_lap_data_json` is a shared
// jsonb column (zone_seconds today, other payloads tomorrow). It surfaces the erg
// aggregates + interval splits when present, and degrades to null for everything
// else — no throw, no fabricated row. Keys are the EXACT snake_case iOS posts, so
// the round-trip is symmetric (see erg-splits.ts).

// A realistic blob: zone_seconds (unrelated) + the erg detail iOS folds in.
const goodBlob = {
  zone_seconds: { z2: 120, z3: 60 },
  drag_factor: 118,
  avg_calories_per_hour: 900,
  peak_drive_force_lbs: 142.5,
  avg_drive_force_lbs: 98.2,
  erg_splits: [
    { index: 0, time_seconds: 90, distance_meters: 500, avg_pace_s_per_500m: 90, stroke_rate_spm: 28, avg_power_w: 210, calories: 12, calories_per_hour: 900, drag_factor: 118, rest_time_seconds: null, rest_distance_meters: null, avg_hr: 150 },
    { index: 1, time_seconds: 92, distance_meters: 500, avg_pace_s_per_500m: 92, stroke_rate_spm: 27, avg_power_w: 205, calories: 12, calories_per_hour: 880, drag_factor: 118, rest_time_seconds: 30, rest_distance_meters: 0, avg_hr: 152 },
  ],
};

describe('parseErgDetail — tolerant read of raw_lap_data_json', () => {
  it('parses erg aggregates + splits, stripping the unrelated zone_seconds key', () => {
    const out = parseErgDetail(goodBlob);
    expect(out).not.toBeNull();
    expect(out!.drag_factor).toBe(118);
    expect(out!.avg_calories_per_hour).toBe(900);
    expect(out!.peak_drive_force_lbs).toBe(142.5);
    expect(out!.avg_drive_force_lbs).toBe(98.2);
    expect(out!.erg_splits).toHaveLength(2);
    expect(out!.erg_splits![0]!.avg_pace_s_per_500m).toBe(90);
    expect(out!.erg_splits![1]!.rest_time_seconds).toBe(30);
    // The stripped key never leaks into the erg shape.
    expect((out as Record<string, unknown>).zone_seconds).toBeUndefined();
  });

  it('parses the same blob delivered as a JSON string', () => {
    expect(parseErgDetail(JSON.stringify(goodBlob))).not.toBeNull();
  });

  it('returns aggregates even when there are no interval splits', () => {
    const out = parseErgDetail({ drag_factor: 120, avg_calories_per_hour: 850 });
    expect(out).not.toBeNull();
    expect(out!.drag_factor).toBe(120);
    expect(out!.erg_splits).toBeNull();
  });

  it('returns splits even when there are no segment aggregates', () => {
    const out = parseErgDetail({ erg_splits: [{ index: 0, avg_power_w: 200 }] });
    expect(out).not.toBeNull();
    expect(out!.erg_splits).toHaveLength(1);
  });

  it('strips unknown provider keys instead of failing', () => {
    const out = parseErgDetail({ erg_splits: [{ index: 0, avg_power_w: 200, heart_rate: 150 }], provider: 'pm5' });
    expect(out).not.toBeNull();
    expect(out!.erg_splits).toHaveLength(1);
  });

  it('returns null for a zone-seconds-only blob (no erg data)', () => {
    expect(parseErgDetail({ zone_seconds: { z1: 100, z2: 200 } })).toBeNull();
  });

  it('normalises an empty splits array with no aggregates to null', () => {
    expect(parseErgDetail({ erg_splits: [] })).toBeNull();
  });

  it('returns null for a malformed split (missing required index)', () => {
    expect(parseErgDetail({ erg_splits: [{ avg_power_w: 200 }] })).toBeNull();
  });

  it('returns null for null / garbage / bad JSON string', () => {
    expect(parseErgDetail(null)).toBeNull();
    expect(parseErgDetail(undefined)).toBeNull();
    expect(parseErgDetail(42)).toBeNull();
    expect(parseErgDetail('not json {')).toBeNull();
  });
});

describe('buildSegmentActuals — erg detail maps onto the flat SegmentActual fields', () => {
  const baseRow = (over: Partial<SegmentActualRow> = {}): SegmentActualRow => ({
    template_segment_id: '10',
    position: 0,
    modality: 'row',
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
    leg_index: null,
    leg_role: null,
    leg_phase: null,
    is_structural: false,
    raw_lap_data_json: null,
    ...over,
  });

  it('flattens aggregates + splits from raw_lap_data_json', () => {
    const [a] = buildSegmentActuals([baseRow({ raw_lap_data_json: goodBlob })]);
    expect(a!.drag_factor).toBe(118);
    expect(a!.avg_calories_per_hour).toBe(900);
    expect(a!.peak_drive_force_lbs).toBe(142.5);
    expect(a!.avg_drive_force_lbs).toBe(98.2);
    expect(a!.erg_splits).toHaveLength(2);
  });

  it('leaves all erg fields null when the column is null or unrecognised', () => {
    const [a] = buildSegmentActuals([baseRow()]);
    expect(a!.drag_factor).toBeNull();
    expect(a!.erg_splits).toBeNull();
    expect(buildSegmentActuals([baseRow({ raw_lap_data_json: { zone_seconds: {} } })])[0]!.erg_splits).toBeNull();
  });
});
