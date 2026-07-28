import { describe, expect, it } from 'vitest';
import {
  RESTING_HR_SHOWABLE_DAYS,
  resolveRestingHrOn,
  type RestingHrDay,
} from '@fahybrid/shared/domain/biometrics/resting-hr';

// The pure half of THE resting-HR resolver. The revision rule (last write wins for
// a local day) is enforced in SQL and covered by the db suite; what is pinned here
// is the part that decides WHICH day may speak for today and what it costs to be
// late — the rule six surfaces used to each get wrong in a different way.
//
// Shapes come from the real athlete that exposed the bug (athlete 64): readings on
// consecutive local days, today's not yet published at the time of reading.

function day(on: string, bpm: number): RestingHrDay {
  return {
    on,
    bpm,
    // Apple stamps the daily aggregate inside the day it describes and publishes it
    // hours later; neither instant participates in the resolution, only `on` does.
    recorded_at: new Date(`${on}T00:01:05Z`),
    received_at: new Date(`${on}T15:19:41Z`),
  };
}

const HISTORY: RestingHrDay[] = [
  day('2026-07-24', 52),
  day('2026-07-25', 49),
  day('2026-07-26', 54),
  day('2026-07-27', 52),
];

describe('resolveRestingHrOn', () => {
  it("uses the day's own reading when it has landed, and marks it scorable", () => {
    const r = resolveRestingHrOn(HISTORY, '2026-07-27');
    expect(r).toEqual({ bpm: 52, on: '2026-07-27', age_days: 0, is_for_day: true });
  });

  it('falls back to the most recent earlier day, carrying its age, and refuses to score it', () => {
    // The normal morning state: the platform publishes 6-13 h late, so today has
    // nothing yet. Answering "sin dato" here is what read as broken.
    const r = resolveRestingHrOn(HISTORY, '2026-07-28');
    expect(r).toEqual({ bpm: 52, on: '2026-07-27', age_days: 1, is_for_day: false });
  });

  it('spans a multi-day gap — days without a watch are skipped, not treated as missing data', () => {
    const r = resolveRestingHrOn(HISTORY, '2026-08-03');
    expect(r?.on).toBe('2026-07-27');
    expect(r?.age_days).toBe(7);
    expect(r?.is_for_day).toBe(false);
  });

  it('stops answering once the last reading is older than the showable window', () => {
    const lastDay = '2026-07-27';
    const edge = new Date(Date.parse(`${lastDay}T00:00:00Z`) + RESTING_HR_SHOWABLE_DAYS * 86_400_000);
    const beyond = new Date(edge.getTime() + 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    expect(resolveRestingHrOn(HISTORY, iso(edge))?.age_days).toBe(RESTING_HR_SHOWABLE_DAYS);
    // One day further it stops being "your resting HR" and becomes history: null, so
    // the surface renders its empty state instead of a stale number dressed as current.
    expect(resolveRestingHrOn(HISTORY, iso(beyond))).toBeNull();
  });

  it('never lets a later day speak for an earlier one', () => {
    // Asking about the 25th must not return the 27th's reading just because it is
    // the newest row present — every reader re-resolves per day when backfilling.
    const r = resolveRestingHrOn(HISTORY, '2026-07-25');
    expect(r).toEqual({ bpm: 49, on: '2026-07-25', age_days: 0, is_for_day: true });
  });

  it('picks the newest eligible day regardless of array order', () => {
    const shuffled = [HISTORY[2], HISTORY[0], HISTORY[3], HISTORY[1]];
    expect(resolveRestingHrOn(shuffled, '2026-07-28')?.on).toBe('2026-07-27');
  });

  it('returns null when the athlete has no readings at all', () => {
    expect(resolveRestingHrOn([], '2026-07-28')).toBeNull();
  });

  it('honours a caller-supplied window without touching the default', () => {
    expect(resolveRestingHrOn(HISTORY, '2026-07-30', { max_age_days: 2 })).toBeNull();
    expect(resolveRestingHrOn(HISTORY, '2026-07-29', { max_age_days: 2 })?.bpm).toBe(52);
  });
});
