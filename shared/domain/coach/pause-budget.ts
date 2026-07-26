// Pause budget (#13) — how much pausing an athlete has left in the tank.
//
// A pause STOPS the billing (Stripe `pause_collection`, see lib/coach/billing-actions),
// so it cannot be unlimited: without a cap the roster fills with athletes who hold a
// plaza and generate nothing. The cap is also what buys the other half of the deal —
// while paused, the plaza is RESERVED instead of passing to the waitlist. Both halves
// were decided together (docs/DECISIONS.md, 2026-07-26).
//
// Two rules keep the number honest:
//   • It counts days ACTUALLY spent paused, never days requested. Coming back early
//     hands the unused days straight back.
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

/** A stretch of pause, both ends INCLUSIVE — the same range adherence excludes. */
export interface PauseSpan {
  /** ISO YYYY-MM-DD. */
  start_date: string;
  /** ISO YYYY-MM-DD, or null while the pause is still open. */
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
 * Collapse overlapping / touching spans so a day is never counted twice. In practice
 * the DB holds at most one open interval per athlete (you can only pause while activo),
 * but the arithmetic should not depend on that invariant holding forever.
 */
function mergeSpans(spans: readonly { from: Date; to: Date }[]): { from: Date; to: Date }[] {
  const sorted = [...spans].sort((a, b) => a.from.getTime() - b.from.getTime());
  const out: { from: Date; to: Date }[] = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    // `<= to + 1 day` because the ends are inclusive: the 5th–7th and the 8th–9th
    // are one continuous 5th–9th pause, not two.
    if (last && span.from.getTime() <= addDays(last.to, 1).getTime()) {
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

  const clipped: { from: Date; to: Date }[] = [];
  for (const span of spans) {
    const start = parseIsoDate(span.start_date);
    // An open pause runs to today. A PLANNED end still in the future counts only what
    // has actually been lived — the athlete has not spent tomorrow yet.
    const declaredEnd = span.end_date === null ? today : parseIsoDate(span.end_date);
    const end = declaredEnd > today ? today : declaredEnd;
    if (end < start) continue; // defensive: a malformed row never adds days

    const from = start < windowStart ? windowStart : start;
    if (end < from) continue; // fell out of the rolling window entirely
    clipped.push({ from, to: end });
  }

  const merged = mergeSpans(clipped);
  let consumed = 0;
  for (const span of merged) consumed += diffDays(span.to, span.from) + 1;

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
 * Days a pause from `startIso` to `endIso` would cost, both ends inclusive. Used to
 * check a request against the budget BEFORE applying it — the athlete has to see the
 * cost on the screen where they pick the dates, not after.
 */
export function pauseSpanLength(startIso: string, endIso: string): number {
  return diffDays(parseIsoDate(endIso), parseIsoDate(startIso)) + 1;
}
