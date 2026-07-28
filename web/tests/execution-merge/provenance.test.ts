import { describe, expect, it } from 'vitest';
import {
  apparatusOfSegmentSource,
  deriveExecutionProvenance,
  isLiveEngineSegmentSource,
  type ProvenanceSegment,
} from '@fahybrid/shared/domain/execution-merge';

// Provenance derived from the tramos (migs 0143 + 0144). The bug these pin down
// is concrete: four sessions Alex ran LIVE with a PM5 and a treadmill were stored
// with source='manual' and shown as «Registro: A mano», because the live client
// declares 'manual' and the server believed it. The tramos knew better all along.
//
// Every case below is a real payload shape the sync route receives — no invented
// vocabulary: the per-tramo tokens are exactly the ones production holds
// (pm5, treadmill, gps, healthkit, manual, concept2, demo).

const seg = (source: string | null, duration_seconds: number | null = 60): ProvenanceSegment => ({
  source,
  duration_seconds,
});

describe('provenance · the token vocabulary', () => {
  it('normalises pm5 to concept2 — a PM5 is a Concept2 monitor, not a brand of its own', () => {
    expect(apparatusOfSegmentSource('pm5')).toBe('concept2');
    expect(apparatusOfSegmentSource('concept2')).toBe('concept2');
  });

  it('accepts the local apparatus the live engine reads (mig 0143)', () => {
    expect(apparatusOfSegmentSource('treadmill')).toBe('treadmill');
    expect(apparatusOfSegmentSource('gps')).toBe('gps');
  });

  it('refuses tokens that are NOT apparatus — manual, demo, anything unknown', () => {
    // These reach the biometric_source enum if let through, so the allow-list is
    // load-bearing, not cosmetic: an unknown token would break the insert.
    expect(apparatusOfSegmentSource('manual')).toBeNull();
    expect(apparatusOfSegmentSource('demo')).toBeNull();
    expect(apparatusOfSegmentSource('garmin-fenix-8-pro')).toBeNull();
    expect(apparatusOfSegmentSource(null)).toBeNull();
  });

  it('tolerates casing and padding from the client', () => {
    expect(apparatusOfSegmentSource('  PM5 ')).toBe('concept2');
    expect(isLiveEngineSegmentSource(' Treadmill')).toBe(true);
  });

  it('counts manual as engine vocabulary but concept2 as the ingestor’s', () => {
    // The live engine stamps 'manual' on a tramo it timed that no device
    // measured; 'concept2' is what the erg INGESTOR writes, never the engine.
    expect(isLiveEngineSegmentSource('manual')).toBe(true);
    expect(isLiveEngineSegmentSource('concept2')).toBe(false);
  });
});

describe('provenance · deriveExecutionProvenance', () => {
  it('a PM5-only session: the erg owns the numbers, and it was run in the app', () => {
    // THE BUG, in one case: the client declares 'manual' and the tramos say pm5.
    const p = deriveExecutionProvenance({
      segments: [seg('pm5', 300), seg('pm5', 240)],
      declared_source: 'manual',
    });
    expect(p.contributing_sources).toEqual(['concept2']);
    expect(p.totals_source).toBe('concept2');
    expect(p.source).toBe('concept2'); // measured evidence beats the declaration
    expect(p.recorded_via).toBe('live');
  });

  it('treadmill + healthkit: BOTH apparatus contribute, the longest owns the totals', () => {
    const p = deriveExecutionProvenance({
      segments: [seg('healthkit', 120), seg('treadmill', 900)],
      declared_source: 'manual',
    });
    // Enum order (healthkit is declared before treadmill), matching how Postgres
    // sorts the array in the 0144 backfill.
    expect(p.contributing_sources).toEqual(['healthkit', 'treadmill']);
    expect(p.totals_source).toBe('treadmill');
    expect(p.source).toBe('treadmill');
    expect(p.recorded_via).toBe('live');
  });

  it('a live session with no apparatus at all: run in the app, measured by hand', () => {
    const p = deriveExecutionProvenance({
      segments: [seg('manual', 600), seg('manual', 300)],
      declared_source: 'manual',
    });
    expect(p.contributing_sources).toEqual([]); // '{}' is a fact: nothing measured it
    expect(p.totals_source).toBeNull();
    expect(p.source).toBe('manual');
    expect(p.recorded_via).toBe('live'); // the engine timed it — NOT a typed log
  });

  it('no tramos at all: nobody timed anything, so it was typed in afterwards', () => {
    const p = deriveExecutionProvenance({ segments: [], declared_source: 'manual' });
    expect(p.recorded_via).toBe('manual');
    expect(p.contributing_sources).toEqual([]);
    expect(p.totals_source).toBeNull();
    expect(p.source).toBe('manual');
  });

  it('an empty payload from an older client keeps the legacy healthkit default', () => {
    // The passive Apple-Health path posts neither tramos nor a source. Changing
    // this would relabel every installed client's writes.
    const p = deriveExecutionProvenance({});
    expect(p.source).toBe('healthkit');
    expect(p.recorded_via).toBe('manual');
  });

  it('tramos stamped by a non-engine pipeline read as imported', () => {
    const p = deriveExecutionProvenance({ segments: [seg('concept2', 480)] });
    expect(p.recorded_via).toBe('imported');
    expect(p.contributing_sources).toEqual(['concept2']);
    expect(p.source).toBe('concept2');
  });

  it('tramos with NO token at all leave recorded_via unknown rather than guessing', () => {
    // An old client that posts segments without provenance. NULL is the honest
    // answer (mig 0144); 'live' or 'imported' here would be a guess dressed up.
    const p = deriveExecutionProvenance({ segments: [seg(null, 300)] });
    expect(p.recorded_via).toBeNull();
    expect(p.contributing_sources).toEqual([]);
  });

  it('an explicit recorded_via from the client always wins', () => {
    const p = deriveExecutionProvenance({
      segments: [seg('pm5', 300)],
      declared_recorded_via: 'imported',
    });
    expect(p.recorded_via).toBe('imported');
    expect(p.totals_source).toBe('concept2'); // the apparatus is still measured
  });

  it('a tramo of unknown duration still names the apparatus, but ranks last', () => {
    const p = deriveExecutionProvenance({
      segments: [seg('gps', null), seg('pm5', 30)],
    });
    // Mirrors the SQL's `order by duration desc nulls last`: the measured tramo
    // wins the totals even though it is shorter than an unmeasured one.
    expect(p.totals_source).toBe('concept2');
    expect(p.contributing_sources).toEqual(['concept2', 'gps']);
  });

  it('is order-stable on ties: the earlier tramo keeps the totals', () => {
    const a = deriveExecutionProvenance({ segments: [seg('treadmill', 300), seg('gps', 300)] });
    const b = deriveExecutionProvenance({ segments: [seg('gps', 300), seg('treadmill', 300)] });
    expect(a.totals_source).toBe('treadmill');
    expect(b.totals_source).toBe('gps');
    // Order never affects the roster — it is a set.
    expect(a.contributing_sources).toEqual(b.contributing_sources);
  });

  it('a second sync carrying a NEW apparatus derives it on its own', () => {
    // The union with what is already stored happens in the ON CONFLICT (see
    // execution-provenance.db.test.ts); the payload derivation is just this.
    const p = deriveExecutionProvenance({ segments: [seg('treadmill', 600)] });
    expect(p.contributing_sources).toEqual(['treadmill']);
  });

  it('the seed vocabulary contributes nothing — demo tramos are not a session', () => {
    const p = deriveExecutionProvenance({ segments: [seg('demo', 600)] });
    expect(p.contributing_sources).toEqual([]);
    expect(p.totals_source).toBeNull();
    expect(p.recorded_via).toBeNull(); // never lived, never typed: unknown
  });
});
