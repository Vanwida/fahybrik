// The pause budget — the arithmetic that decides whether an athlete may pause.
//
// WHY IT MATTERS: a pause voids the Stripe invoices. If this function over-counts,
// an athlete who is entitled to pause gets told no and cancels instead — the worst
// outcome for the business. If it under-counts, the roster fills with reserved
// plazas that generate nothing. Both failures are silent, which is why the edges
// are pinned here rather than trusted to a read-through.
//
// THE OFF-BY-ONE THAT MATTERS: `end_date` is the day the athlete COMES BACK and is
// not itself a paused day — that is what the coach's dialog has always written
// ("Vuelve el") and what every production row already means. Reading it as the last
// paused day would overcharge every single pause by one day.

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

  it('does NOT charge the return day — it is the day they train again', () => {
    // Away on the 1st, back on the 8th: seven days paused (1–7), not eight.
    const b = computePauseBudget([{ start_date: '2026-06-01', end_date: '2026-06-08' }], TODAY);
    expect(b.consumed_days).toBe(7);
    expect(b.available_days).toBe(PAUSE_BUDGET_DAYS - 7);
  });

  it('charges an open pause up to and including today', () => {
    const b = computePauseBudget([{ start_date: '2026-07-24', end_date: null }], TODAY);
    expect(b.consumed_days).toBe(3); // 24, 25, 26
  });

  it('charges a BOOKED pause only for the days already lived', () => {
    // Booked until mid-August, but only the 24th–26th have happened. Charging the
    // whole booking up front would block a second pause the athlete has not taken yet.
    const b = computePauseBudget([{ start_date: '2026-07-24', end_date: '2026-08-15' }], TODAY);
    expect(b.consumed_days).toBe(3);
  });

  it('a same-day change of mind costs nothing', () => {
    // Paused and resumed today: closeCurrentPauseTx stamps end_date = today, so the
    // span is empty. Charging a day for a pause that never happened is a bug.
    const b = computePauseBudget([{ start_date: TODAY, end_date: TODAY }], TODAY);
    expect(b.consumed_days).toBe(0);
  });

  it('drops days that have rolled out of the 12-month window', () => {
    // A year and a bit ago: entirely outside the window.
    const b = computePauseBudget([{ start_date: '2025-05-01', end_date: '2025-05-20' }], TODAY);
    expect(b.consumed_days).toBe(0);
    expect(b.available_days).toBe(PAUSE_BUDGET_DAYS);
  });

  it('clips a pause that straddles the edge of the window', () => {
    // Window opens 2025-07-27. A pause from the 20th returning on the 31st only spends
    // the days inside it: 27th → 30th = 4.
    const b = computePauseBudget([{ start_date: '2025-07-20', end_date: '2025-07-31' }], TODAY);
    expect(b.consumed_days).toBe(4);
  });

  it('never counts a day twice when spans overlap or meet end-to-start', () => {
    // Back on the 6th and away again on the 6th is one continuous stretch 1st→8th,
    // which costs 7 days. Real data should not contain these, but the arithmetic
    // must not depend on that.
    const b = computePauseBudget(
      [
        { start_date: '2026-06-01', end_date: '2026-06-06' },
        { start_date: '2026-06-06', end_date: '2026-06-08' },
        { start_date: '2026-06-03', end_date: '2026-06-07' },
      ],
      TODAY,
    );
    expect(b.consumed_days).toBe(7);
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
  it('costs nothing when the return day is the same day', () => {
    expect(pauseSpanLength('2026-08-01', '2026-08-01')).toBe(0);
  });

  it('matches what a two-week pause actually costs', () => {
    // Away from the 18th, back on 1 Sep → 18 Aug through 31 Aug → 14 days.
    expect(pauseSpanLength('2026-08-18', '2026-09-01')).toBe(14);
  });

  it('spans a month boundary without drifting', () => {
    expect(pauseSpanLength('2026-01-30', '2026-02-02')).toBe(3);
  });
});
