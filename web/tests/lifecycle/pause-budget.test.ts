// The pause budget — the arithmetic that decides whether an athlete may pause.
//
// WHY IT MATTERS: a pause voids the Stripe invoices. If this function over-counts,
// an athlete who is entitled to pause gets told no and cancels instead — the worst
// outcome for the business. If it under-counts, the roster fills with reserved
// plazas that generate nothing. Both failures are silent, which is why the edges
// are pinned here rather than trusted to a read-through.

import { describe, expect, it } from 'vitest';
import {
  PAUSE_BUDGET_DAYS,
  computePauseBudget,
  pauseSpanLength,
} from '../../../shared/domain/coach/pause-budget';

const TODAY = '2026-07-26';

describe('computePauseBudget', () => {
  it('gives the full budget when the athlete has never paused', () => {
    const b = computePauseBudget([], TODAY);
    expect(b.consumed_days).toBe(0);
    expect(b.available_days).toBe(PAUSE_BUDGET_DAYS);
    expect(b.renews_on).toBeNull();
  });

  it('counts both ends of a closed pause — the days actually not trained', () => {
    // 1st to 7th inclusive is a seven-day pause, not six.
    const b = computePauseBudget([{ start_date: '2026-06-01', end_date: '2026-06-07' }], TODAY);
    expect(b.consumed_days).toBe(7);
    expect(b.available_days).toBe(PAUSE_BUDGET_DAYS - 7);
  });

  it('charges an open pause only up to today, never into the future', () => {
    const b = computePauseBudget([{ start_date: '2026-07-24', end_date: null }], TODAY);
    expect(b.consumed_days).toBe(3); // 24, 25, 26
  });

  it('charges a PLANNED pause only for the days already lived', () => {
    // Booked until mid-August, but only the 24th–26th have happened. Charging the
    // whole plan up front would block a second pause the athlete has not taken yet.
    const b = computePauseBudget([{ start_date: '2026-07-24', end_date: '2026-08-15' }], TODAY);
    expect(b.consumed_days).toBe(3);
  });

  it('drops days that have rolled out of the 12-month window', () => {
    // A year and a bit ago: entirely outside the window.
    const b = computePauseBudget([{ start_date: '2025-05-01', end_date: '2025-05-20' }], TODAY);
    expect(b.consumed_days).toBe(0);
    expect(b.available_days).toBe(PAUSE_BUDGET_DAYS);
  });

  it('clips a pause that straddles the edge of the window', () => {
    // Window opens 2025-07-27. A pause from the 20th to the 31st only spends the
    // days inside it: 27th → 31st = 5.
    const b = computePauseBudget([{ start_date: '2025-07-20', end_date: '2025-07-31' }], TODAY);
    expect(b.consumed_days).toBe(5);
  });

  it('never counts a day twice when spans overlap or touch', () => {
    // Two rows describing one continuous stretch (1st–5th and 6th–9th) must cost 9,
    // not 9 + a double-count. Real data should not contain these, but the arithmetic
    // must not depend on that.
    const b = computePauseBudget(
      [
        { start_date: '2026-06-01', end_date: '2026-06-05' },
        { start_date: '2026-06-06', end_date: '2026-06-09' },
        { start_date: '2026-06-03', end_date: '2026-06-07' },
      ],
      TODAY,
    );
    expect(b.consumed_days).toBe(9);
  });

  it('never reports negative days left when a coach pauses past the cap', () => {
    // The coach has no budget — he can park an athlete for two months. The athlete's
    // screen must read "0 left", not "-32".
    const b = computePauseBudget([{ start_date: '2026-05-01', end_date: '2026-07-01' }], TODAY);
    expect(b.consumed_days).toBeGreaterThan(PAUSE_BUDGET_DAYS);
    expect(b.available_days).toBe(0);
  });

  it('renews a year after the oldest counted day, not a year after today', () => {
    const b = computePauseBudget([{ start_date: '2026-03-01', end_date: '2026-03-10' }], TODAY);
    expect(b.renews_on).toBe('2027-03-01');
  });

  it('ignores a malformed span instead of paying it out', () => {
    const b = computePauseBudget([{ start_date: '2026-06-10', end_date: '2026-06-01' }], TODAY);
    expect(b.consumed_days).toBe(0);
  });
});

describe('pauseSpanLength', () => {
  it('counts both ends, so a same-day pause costs one day', () => {
    expect(pauseSpanLength('2026-08-01', '2026-08-01')).toBe(1);
  });

  it('matches what a two-week pause actually costs', () => {
    // Away from the 18th, back on 1 Sep → last paused day is 31 Aug → 14 days.
    expect(pauseSpanLength('2026-08-18', '2026-08-31')).toBe(14);
  });

  it('spans a month boundary without drifting', () => {
    expect(pauseSpanLength('2026-01-30', '2026-02-02')).toBe(4);
  });
});
