import { describe, it, expect } from 'vitest';
import {
  doblesSimulationPutSchema,
  athleteSimulationPutSchema,
  athleteSplitToStored,
  storedToReaderCarrier,
  normalizeStationSplit,
  defaultStationSplits,
  DOBLES_STATION_INDICES,
  type DoblesStationSplit,
} from '@fahybrid/shared/schema/dobles-simulation';

// Write-path contract for the coach simulation editor. The editor builds a body
// that must pass doblesSimulationPutSchema, and the endpoint normalizes each split
// so a stored share never contradicts assigned_to. These pin both invariants.

function fullSplits(overrides: Partial<DoblesStationSplit> & { station_index: number }): DoblesStationSplit[] {
  // 8 valid split stations, with one overridden.
  return DOBLES_STATION_INDICES.map((station_index) =>
    station_index === overrides.station_index
      ? { assigned_to: 'split' as const, self_share: 0.5, ...overrides }
      : { station_index, assigned_to: 'split' as const, self_share: 0.5 },
  );
}

describe('normalizeStationSplit', () => {
  it('pins A-full to share 1', () => {
    expect(normalizeStationSplit({ station_index: 2, assigned_to: 'a', self_share: 0.3 }).self_share).toBe(1);
  });
  it('pins B-full to share 0', () => {
    expect(normalizeStationSplit({ station_index: 2, assigned_to: 'b', self_share: 0.9 }).self_share).toBe(0);
  });
  it('clamps a split share into 0..1', () => {
    expect(normalizeStationSplit({ station_index: 2, assigned_to: 'split', self_share: 1.4 }).self_share).toBe(1);
    expect(normalizeStationSplit({ station_index: 2, assigned_to: 'split', self_share: -0.2 }).self_share).toBe(0);
    expect(normalizeStationSplit({ station_index: 2, assigned_to: 'split', self_share: 0.6 }).self_share).toBe(0.6);
  });
});

describe('defaultStationSplits', () => {
  it('prefills exactly the 8 stations at a 50/50 split', () => {
    const d = defaultStationSplits();
    expect(d).toHaveLength(8);
    expect(d.map((s) => s.station_index).sort((a, b) => a - b)).toEqual([...DOBLES_STATION_INDICES].sort((a, b) => a - b));
    expect(d.every((s) => s.assigned_to === 'split' && s.self_share === 0.5)).toBe(true);
  });
});

describe('doblesSimulationPutSchema', () => {
  it('accepts a complete, valid body (the editor shape)', () => {
    const res = doblesSimulationPutSchema.safeParse({
      target_event_id: null,
      station_splits: fullSplits({ station_index: 2, assigned_to: 'a', self_share: 1, note: 'Guillem abre' }),
      running_note: 'Ritmo Z3',
      roxzone_note: null,
      tactical_note: null,
    });
    expect(res.success).toBe(true);
  });

  it('rejects when a station is missing (must cover all 8, once)', () => {
    const seven = fullSplits({ station_index: 2 }).slice(0, 7);
    const res = doblesSimulationPutSchema.safeParse({ station_splits: seven });
    expect(res.success).toBe(false);
  });

  it('rejects a duplicated station', () => {
    const dup = fullSplits({ station_index: 2 });
    dup[1] = { ...dup[0] }; // two station_index=2
    const res = doblesSimulationPutSchema.safeParse({ station_splits: dup });
    expect(res.success).toBe(false);
  });

  it('rejects a non-HYROX station index', () => {
    const bad = fullSplits({ station_index: 2 });
    bad[0] = { station_index: 3, assigned_to: 'split', self_share: 0.5 };
    const res = doblesSimulationPutSchema.safeParse({ station_splits: bad });
    expect(res.success).toBe(false);
  });

  it('rejects an out-of-range share', () => {
    const res = doblesSimulationPutSchema.safeParse({
      station_splits: fullSplits({ station_index: 2, assigned_to: 'split', self_share: 1.5 }),
    });
    expect(res.success).toBe(false);
  });

  it('is strict — rejects an unknown key on a split (e.g. the display `label`)', () => {
    // The GET response adds `label`; the editor must strip it (this schema is .strict()).
    const withLabel = fullSplits({ station_index: 2 }).map((s) => ({ ...s, label: 'SkiErg 1km' }));
    const res = doblesSimulationPutSchema.safeParse({ station_splits: withLabel });
    expect(res.success).toBe(false);
  });
});

// The athlete edits self-centric (self/partner/split); storage is A-centric. The
// flip MUST be the exact inverse of the read flip, for a reader who is A or B.
describe('athleteSplitToStored (self-centric → A-centric)', () => {
  it('A editing: self → a/1, partner → b/0, split keeps A-share', () => {
    expect(athleteSplitToStored({ station_index: 2, carrier: 'self', self_share: 1 }, true)).toMatchObject({ assigned_to: 'a', self_share: 1 });
    expect(athleteSplitToStored({ station_index: 2, carrier: 'partner', self_share: 0 }, true)).toMatchObject({ assigned_to: 'b', self_share: 0 });
    expect(athleteSplitToStored({ station_index: 2, carrier: 'split', self_share: 0.6 }, true)).toMatchObject({ assigned_to: 'split', self_share: 0.6 });
  });

  it('B editing: self → b/0, partner → a/1, split stores the COMPLEMENT as A-share', () => {
    expect(athleteSplitToStored({ station_index: 2, carrier: 'self', self_share: 1 }, false)).toMatchObject({ assigned_to: 'b', self_share: 0 });
    expect(athleteSplitToStored({ station_index: 2, carrier: 'partner', self_share: 0 }, false)).toMatchObject({ assigned_to: 'a', self_share: 1 });
    // B does 70% → A's stored share is 30% (float; UI rounds to whole %).
    const bSplit = athleteSplitToStored({ station_index: 2, carrier: 'split', self_share: 0.7 }, false);
    expect(bSplit.assigned_to).toBe('split');
    expect(bSplit.self_share).toBeCloseTo(0.3, 10);
  });

  it('preserves a trimmed note, drops an empty one', () => {
    expect(athleteSplitToStored({ station_index: 2, carrier: 'split', self_share: 0.5, note: ' alterna 250m ' }, true).note).toBe('alterna 250m');
    expect('note' in athleteSplitToStored({ station_index: 2, carrier: 'split', self_share: 0.5, note: '  ' }, true)).toBe(false);
  });
});

describe('storedToReaderCarrier (A-centric → reader frame)', () => {
  it('maps by who executes, per reader side', () => {
    expect(storedToReaderCarrier('a', true)).toBe('self');
    expect(storedToReaderCarrier('a', false)).toBe('partner');
    expect(storedToReaderCarrier('b', true)).toBe('partner');
    expect(storedToReaderCarrier('b', false)).toBe('self');
    expect(storedToReaderCarrier('split', true)).toBe('split');
    expect(storedToReaderCarrier('split', false)).toBe('split');
  });
});

describe('athleteSimulationPutSchema', () => {
  it('accepts a self-centric body of 8 stations', () => {
    const splits = DOBLES_STATION_INDICES.map((station_index) => ({ station_index, carrier: 'split' as const, self_share: 0.5 }));
    expect(athleteSimulationPutSchema.safeParse({ station_splits: splits }).success).toBe(true);
  });
  it('rejects an A/B storage-frame carrier (must be self/partner/split)', () => {
    const splits = DOBLES_STATION_INDICES.map((station_index) => ({ station_index, carrier: 'a', self_share: 1 }));
    expect(athleteSimulationPutSchema.safeParse({ station_splits: splits }).success).toBe(false);
  });
});
