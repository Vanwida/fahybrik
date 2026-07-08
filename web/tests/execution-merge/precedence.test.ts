import { describe, expect, it } from 'vitest';
import {
  mergeContributions,
  fidelityRank,
  channelOfStoredSource,
  type SourceContribution,
} from '@fahybrid/shared/domain/execution-merge';

// #36 Garmin sin SDK — the PURE fusion policy. These encode the merge-relevant
// stress-test cases from the design (docs/design/garmin-sin-sdk-fusion-model.html)
// with zero free text: each real workout shape must fold into ONE result with the
// right per-group provenance.

// A device skeleton as it arrives from the passive HealthKit ingest: totals only,
// no segments (recon: HKWorkout laps carry no per-lap metrics).
function skeleton(over: Partial<SourceContribution> = {}): SourceContribution {
  return {
    provider: 'healthkit',
    channel: 'device_stream',
    totals: {
      duration_s: 3600,
      distance_m: 8000,
      avg_hr: 152,
      max_hr: 178,
      calories: 620,
      started_at: '2026-07-08T07:00:00.000Z',
      ended_at: '2026-07-08T08:00:00.000Z',
    },
    ...over,
  };
}

// A screenshot→IA capture of a Garmin summary: rich (splits/power/pace) but OCR
// on the totals.
function garminCapture(over: Partial<SourceContribution> = {}): SourceContribution {
  return {
    provider: 'garmin',
    channel: 'ocr_capture',
    hasSegments: true,
    ...over,
  };
}

describe('fidelityRank — the ranking axis (Fork C)', () => {
  it('device beats OCR beats manual for totals', () => {
    expect(fidelityRank('totals', 'device_stream')).toBeGreaterThan(
      fidelityRank('totals', 'ocr_capture'),
    );
    expect(fidelityRank('totals', 'ocr_capture')).toBeGreaterThan(
      fidelityRank('totals', 'manual'),
    );
  });

  it('a device stream CANNOT supply segments (splits) — rank -1', () => {
    expect(fidelityRank('segments', 'device_stream')).toBe(-1);
    expect(fidelityRank('segments', 'ocr_capture')).toBeGreaterThan(0);
  });

  it('rpe is manual-only — every other channel is -1', () => {
    expect(fidelityRank('rpe', 'manual')).toBeGreaterThan(0);
    expect(fidelityRank('rpe', 'device_stream')).toBe(-1);
    expect(fidelityRank('rpe', 'ocr_capture')).toBe(-1);
  });
});

describe('channelOfStoredSource — reconstruct channel from a persisted provider', () => {
  it("'healthkit' is our sole device-stream marker today", () => {
    expect(channelOfStoredSource('healthkit')).toBe('device_stream');
  });
  it("'manual' → manual; capture providers → ocr_capture", () => {
    expect(channelOfStoredSource('manual')).toBe('manual');
    expect(channelOfStoredSource('garmin')).toBe('ocr_capture');
    expect(channelOfStoredSource('coros')).toBe('ocr_capture');
    expect(channelOfStoredSource('concept2')).toBe('ocr_capture');
  });
});

describe('case 1 — Garmin skeleton + capture enrich (the happy path)', () => {
  const merged = mergeContributions([
    skeleton(),
    garminCapture({
      // The capture also reads the totals off the screen (OCR), slightly off.
      totals: { duration_s: 3599, distance_m: 8000, avg_hr: 150, calories: 618 },
    }),
  ]);

  it('device totals win over the OCR totals', () => {
    expect(merged.totals.duration_s).toBe(3600); // healthkit, not the 3599 OCR
    expect(merged.totals.avg_hr).toBe(152);
    expect(merged.totals_source).toBe('healthkit');
  });

  it('segments come from the capture (the skeleton has none)', () => {
    expect(merged.segments_source).toBe('garmin');
  });

  it('both providers are recorded as contributors (a genuine fusion)', () => {
    expect(merged.contributing_sources).toEqual(['healthkit', 'garmin']);
    expect(merged.contributing_sources.length).toBeGreaterThanOrEqual(2);
  });
});

describe('case 7 — capture arrives BEFORE the skeleton (fidelity still holds)', () => {
  // The capture is FIRST in the array (landed first in time). The fidelity rule
  // must still let the later device value REPLACE the OCR total — never the
  // reverse.
  const merged = mergeContributions([
    garminCapture({ totals: { duration_s: 3599, avg_hr: 150 } }),
    skeleton({ totals: { duration_s: 3600, avg_hr: 152 } }),
  ]);

  it('the device total wins despite arriving second', () => {
    expect(merged.totals.duration_s).toBe(3600);
    expect(merged.totals.avg_hr).toBe(152);
    expect(merged.totals_source).toBe('healthkit');
  });
});

describe('per-field fill — capture supplies what the device lacks', () => {
  // Indoor run: the watch has duration + HR but NO distance; the capture read it
  // off the treadmill/app screen.
  const merged = mergeContributions([
    skeleton({ totals: { duration_s: 1800, avg_hr: 160, distance_m: null } }),
    garminCapture({ totals: { distance_m: 5000 } }),
  ]);

  it('distance falls to the capture; duration/HR stay device', () => {
    expect(merged.totals.duration_s).toBe(1800);
    expect(merged.totals.avg_hr).toBe(160);
    expect(merged.totals.distance_m).toBe(5000);
  });

  it('the totals group is still owned by the higher-fidelity device', () => {
    expect(merged.totals_source).toBe('healthkit');
    expect(merged.contributing_sources).toEqual(['healthkit', 'garmin']);
  });
});

describe('case 6 — Concept2 PM5 capture-only (never_skeleton, terminal)', () => {
  const merged = mergeContributions([
    {
      provider: 'concept2',
      channel: 'ocr_capture',
      hasSegments: true,
      totals: { duration_s: 400, distance_m: 2000, avg_hr: 171 },
    },
  ]);

  it('the capture owns everything; no device involved', () => {
    expect(merged.totals.duration_s).toBe(400);
    expect(merged.totals_source).toBe('concept2');
    expect(merged.segments_source).toBe('concept2');
    expect(merged.contributing_sources).toEqual(['concept2']);
  });
});

describe('RPE is always the athlete — never a device or a photo', () => {
  const merged = mergeContributions([
    // A malformed device contribution that (wrongly) carries an rpe: it must be
    // ignored — device_stream cannot supply rpe.
    skeleton({ rpe: 9 }),
    { provider: 'manual', channel: 'manual', rpe: 7 },
  ]);

  it('takes the manual rpe and stamps the athlete as its source', () => {
    expect(merged.rpe).toBe(7);
    expect(merged.rpe_source).toBe('manual');
  });
});

describe('case 10 — an athlete edit beats the device on that field', () => {
  const merged = mergeContributions([
    skeleton({ totals: { duration_s: 3600 } }),
    // The athlete corrected the duration in review (the watch auto-paused wrong).
    {
      provider: 'manual',
      channel: 'manual',
      explicitFields: ['duration_s'],
      totals: { duration_s: 3660 },
    },
  ]);

  it('the explicit human value wins over the device value', () => {
    expect(merged.totals.duration_s).toBe(3660);
  });
});

describe('case 12 — the capture attach wins the assignment (Fork D)', () => {
  const merged = mergeContributions([
    // The device heuristically linked to the day's OTHER session (id 9).
    skeleton({ assignmentId: 9 }),
    // The athlete opened the capture FROM this session (id 5) and attached it.
    garminCapture({ assignmentAttach: true, assignmentId: 5, totals: { duration_s: 3600 } }),
  ]);

  it('resolves to the attached assignment and flags the conflict', () => {
    expect(merged.resolved_assignment_id).toBe(5);
    expect(merged.assignment_conflict).toBe(true);
  });
});

describe('score precedence + degenerate input', () => {
  it('a captured score beats a hand-typed one', () => {
    const merged = mergeContributions([
      { provider: 'manual', channel: 'manual', score: { time_s: 500 } },
      { provider: 'garmin', channel: 'ocr_capture', score: { time_s: 492 } },
    ]);
    expect(merged.score.time_s).toBe(492);
    expect(merged.score_source).toBe('garmin');
  });

  it('empty input → all-null execution, no contributors, no conflict', () => {
    const merged = mergeContributions([]);
    expect(merged.totals.duration_s).toBeNull();
    expect(merged.totals_source).toBeNull();
    expect(merged.rpe).toBeNull();
    expect(merged.contributing_sources).toEqual([]);
    expect(merged.resolved_assignment_id).toBeNull();
    expect(merged.assignment_conflict).toBe(false);
  });
});
