// Pause budget (#13) — how much pausing an athlete has left in the tank.
//
// A pause STOPS the billing (Stripe `pause_collection`, see lib/coach/billing-actions),
// so it cannot be unlimited: without a cap the roster fills with athletes who hold a
// plaza and generate nothing. The cap is also what buys the other half of the deal —
// while paused, the plaza is RESERVED instead of passing to the waitlist. Both halves
// were decided together (docs/DECISIONS.md, 2026-07-26).
//
// WHAT `end_date` MEANS. It is the day the athlete COMES BACK, and it is NOT itself a
// paused day. That is the meaning the coach's dialog has always written ("Vuelve el")
// and the meaning every row in production already carries, so it is the one everything
// else bends to. A pause from the 18th with end_date on the 1st costs the 18th through
// the 31st — fourteen days.
//
// Two more rules keep the number honest:
//   • It counts days ACTUALLY spent paused, never days booked. Coming back early hands
//     the unused days straight back.
//   • The window ROLLS. A calendar year would let an athlete chain December with
//     January and quietly spend a double budget.
//
// Pure and framework-agnostic on purpose: the same arithmetic backs the athlete API,
// the coach dashboard and the tests, with no database in the way.

import { addDays, diffDays, isoDateString, parseIsoDate } from '../dates';

/** Days of paused-and-not-billed an athlete gets per rolling window. Four weeks. */
export const PAUSE_BUDGET_DAYS = 28;

/** Length of the rolling window the budget is measured over. Twelve months. */
export const PAUSE_BUDGET_WINDOW_DAYS = 365;

/** A stretch of pause: `[start_date, end_date)` — the return day is not paused. */
export interface PauseSpan {
  /** ISO YYYY-MM-DD, the first paused day. */
  start_date: string;
  /** ISO YYYY-MM-DD the athlete returns, or null while the pause is still open. */
  end_date: string | null;
}

export interface PauseBudget {
  /** The cap itself, echoed so a UI never has to hardcode it. */
  budget_days: number;
  /** Days already spent inside the window. */
  consumed_days: number;
  /** What is left. Never negative, even if a coach pauses past the cap by hand. */
  available_days: number;
  /**
   * The day at least one day frees up again — i.e. when the oldest counted day
   * drops out of the rolling window. null when nothing has been consumed.
   */
  renews_on: string | null;
}

/**
 * Collapse overlapping / touching half-open spans so a day is never counted twice. In
 * practice the DB holds at most one open interval per athlete (you can only pause while
 * activo), but the arithmetic should not depend on that invariant holding forever.
 */
function mergeSpans(spans: readonly { from: Date; to: Date }[]): { from: Date; to: Date }[] {
  const sorted = [...spans].sort((a, b) => a.from.getTime() - b.from.getTime());
  const out: { from: Date; to: Date }[] = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    // `<=` because the ends are EXCLUSIVE: a pause returning on the 6th and another
    // starting on the 6th are one continuous stretch, not two.
    if (last && span.from.getTime() <= last.to.getTime()) {
      if (span.to > last.to) last.to = span.to;
      continue;
    }
    out.push({ from: span.from, to: span.to });
  }
  return out;
}

/**
 * How much of the pause budget is spent, given every pause the athlete has on record.
 *
 * `todayIso` is passed in rather than read from the clock so the caller decides the
 * timezone (the box day, Europe/Madrid) and so tests are deterministic.
 */
export function computePauseBudget(
  spans: readonly PauseSpan[],
  todayIso: string,
  budgetDays: number = PAUSE_BUDGET_DAYS,
  windowDays: number = PAUSE_BUDGET_WINDOW_DAYS,
): PauseBudget {
  const today = parseIsoDate(todayIso);
  const windowStart = addDays(today, -(windowDays - 1));
  // Today has been lived, so the exclusive end of "everything so far" is tomorrow.
  const livedThrough = addDays(today, 1);

  const clipped: { from: Date; to: Date }[] = [];
  for (const span of spans) {
    const start = parseIsoDate(span.start_date);
    // An open pause runs to today. A BOOKED return still in the future counts only what
    // has actually been lived — the athlete has not spent tomorrow yet.
    const declaredEnd = span.end_date === null ? livedThrough : parseIsoDate(span.end_date);
    const end = declaredEnd > livedThrough ? livedThrough : declaredEnd;
    if (end <= start) continue; // defensive: a malformed or zero-length row adds nothing

    const from = start < windowStart ? windowStart : start;
    if (end <= from) continue; // fell out of the rolling window entirely
    clipped.push({ from, to: end });
  }

  const merged = mergeSpans(clipped);
  let consumed = 0;
  for (const span of merged) consumed += diffDays(span.to, span.from);

  const earliest = merged.length > 0 ? merged[0]!.from : null;
  return {
    budget_days: budgetDays,
    consumed_days: consumed,
    available_days: Math.max(0, budgetDays - consumed),
    // The oldest counted day leaves the window `windowDays` after it happened.
    renews_on: earliest === null ? null : isoDateString(addDays(earliest, windowDays)),
  };
}

/**
 * Days a pause starting `startIso` and returning on `returnIso` would cost. Used to
 * check a request against the budget BEFORE applying it — the athlete has to see the
 * cost on the screen where they pick the dates, not after.
 */
export function pauseSpanLength(startIso: string, returnIso: string): number {
  return Math.max(0, diffDays(parseIsoDate(returnIso), parseIsoDate(startIso)));
}
