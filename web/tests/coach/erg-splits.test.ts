import { describe, expect, it } from 'vitest';
import { parseErgSplits } from '@/lib/dashboard/coach/erg-splits';
import { buildSegmentActuals, type SegmentActualRow } from '@/lib/dashboard/coach/session-actuals';

// The PM5 interval-splits reader is TOLERANT by design: `raw_lap_data_json` is a
// shared jsonb column (zone_seconds, provider laps, …) and the definitive PM5
// shape is still owned by the iOS capture agent. A well-formed splits array is
// surfaced; everything else degrades to null (no table, never a throw, never a
// fabricated row).

const goodBlob = {
  splits: [
    { t_s: 90, dist_m: 500, pace_s_per_500m: 90, spm: 28 },
    { t_s: 92, dist_m: 500, pace_s_per_500m: 92, spm: 27, rest_s: 30 },
  ],
  drag_factor: 118,
  cal_per_hour: 900,
};

describe('parseErgSplits — tolerant read of raw_lap_data_json', () => {
  it('parses a well-formed splits blob (object) with optional meta', () => {
    const out = parseErgSplits(goodBlob);
    expect(out).not.toBeNull();
    expect(out!.splits).toHaveLength(2);
    expect(out!.splits[0]!.pace_s_per_500m).toBe(90);
    expect(out!.splits[1]!.rest_s).toBe(30);
    expect(out!.drag_factor).toBe(118);
    expect(out!.cal_per_hour).toBe(900);
  });

  it('parses the same blob delivered as a JSON string', () => {
    expect(parseErgSplits(JSON.stringify(goodBlob))).not.toBeNull();
  });

  it('strips unknown provider keys instead of failing', () => {
    const out = parseErgSplits({
      splits: [{ t_s: 90, dist_m: 500, pace_s_per_500m: 90, spm: 28, heart_rate: 150 }],
      provider: 'pm5',
    });
    expect(out).not.toBeNull();
    expect(out!.splits).toHaveLength(1);
  });

  it('returns null for a zone-seconds-only blob (no splits array)', () => {
    expect(parseErgSplits({ zone_seconds: { z1: 100, z2: 200 } })).toBeNull();
  });

  it('returns null for an empty splits array', () => {
    expect(parseErgSplits({ splits: [] })).toBeNull();
  });

  it('returns null for a malformed split (missing pace) — no partial rows', () => {
    expect(parseErgSplits({ splits: [{ t_s: 90, dist_m: 500, spm: 28 }] })).toBeNull();
  });

  it('returns null for null / garbage / bad JSON string', () => {
    expect(parseErgSplits(null)).toBeNull();
    expect(parseErgSplits(undefined)).toBeNull();
    expect(parseErgSplits(42)).toBeNull();
    expect(parseErgSplits('not json {')).toBeNull();
  });
});

describe('buildSegmentActuals — splits map onto the actual', () => {
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
    incline_pct: null,
    run_cadence_spm: null,
    raw_lap_data_json: null,
    ...over,
  });

  it('carries parsed splits when the blob is well-formed', () => {
    const [a] = buildSegmentActuals([baseRow({ raw_lap_data_json: goodBlob })]);
    expect(a!.splits).not.toBeNull();
    expect(a!.splits!.splits).toHaveLength(2);
  });

  it('splits is null when the column is null or unrecognised', () => {
    expect(buildSegmentActuals([baseRow()])[0]!.splits).toBeNull();
    expect(buildSegmentActuals([baseRow({ raw_lap_data_json: { zone_seconds: {} } })])[0]!.splits).toBeNull();
  });
});
