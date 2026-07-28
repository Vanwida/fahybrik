// COBERTURA DE LA CARGA — what a load reading is allowed to claim about itself.
//
// A session with no measured or declared intensity emits no TSS (see ./tss.ts),
// so every CTL/ATL/TSB/ACR number is computed over the SUBSET of the athlete's
// work that could be priced. That subset is not a defect to hide: it is a
// property of the reading, and any screen that shows the numbers must be able to
// show it too (docs/CONTRATO-UI.md §7).
//
// WHICH NUMBERS SURVIVE A HOLE, AND WHICH DO NOT — this is the whole point of
// the module, and it is not a matter of taste:
//
//   • CTL, ATL and summed TSS are MONOTONE in the missing work. Every unpriced
//     session could only have added load, never removed it, so the shown value
//     is a FLOOR: the truth is "this much or more". Safe to show, as a floor.
//
//   • TSB (= CTL − ATL) and ACR (7 d over the 28 d mean) are a DIFFERENCE and a
//     RATIO of two partially-observed quantities, and their bias is not even
//     single-signed. Adding a session's load x that happened n days ago moves
//     CTL by ≈ (x/42)·(41/42)^n and ATL by ≈ (x/7)·(6/7)^n. Those two curves
//     cross at n ≈ 14: a session missing from the last fortnight makes TSB read
//     FRESHER than reality, and one missing from the older half of the window
//     makes it read MORE FATIGUED. ACR flips the same way around the 7-day edge.
//     So with a hole in the window nobody can say which way "fresco / cargado"
//     or "ACR alto / bajo" is wrong — only that it is. The verdict goes; the
//     number stays, declared.
//
// The hole is NOT a system failure and must never be worded as one: it is
// sessions the athlete did not rate. That is why the reading carries an action.

import type { LoadSummary } from './banister';

/**
 * Below this share of intensity-known work in the chronic window, no verdict
 * that depends on "how much did this athlete train" is defensible. Owned here
 * because it answers a question about a LOAD READING, and every consumer
 * (progress readiness, roster, deep-dive) must draw the line in the same place.
 */
export const LOAD_COVERAGE_MIN = 0.9;

export type LoadCoverageState =
  /** Nothing executed in the window: no coverage to report, which is not 0 %. */
  | 'no_work'
  /** Every executed second was priced. The numbers are whole. */
  | 'complete'
  /** Some executed work could not be priced. The numbers describe a subset. */
  | 'partial';

export type LoadCoverage = {
  state: LoadCoverageState;
  /** 0…1 share of executed seconds priced into the load numbers; null on `no_work`. */
  pct: number | null;
  known_seconds: number;
  unknown_seconds: number;
  /** Sessions behind `unknown_seconds` — what the coach actually asks for. */
  unknown_sessions: number;
  /**
   * Whether TSB and ACR may still carry their verdict word ("fresco",
   * "cargado", "alto", "bajo"). False only while the hole is big enough to make
   * the verdict undecidable; the numbers themselves are always shown.
   */
  allows_verdict: boolean;
  /** Dense surfaces (roster cell, chip). Null when there is nothing to declare. */
  badge_es: string | null;
  /** One sentence naming the hole, and the consequence when the verdict is gone. */
  note_es: string | null;
  /** What the coach can do about it. Null when there is nothing to do. */
  action_es: string | null;
};

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/**
 * Bulk training time, as a coach reads it off a screen: "47 min", "1 h 20 min".
 * Deliberately NOT `prescription/to-text.formatDuration`, which writes athletic
 * shorthand for a prescribed interval (`2'30''`) — a different concept, and 77
 * minutes of unrated work rendered as `77'` reads as a single interval.
 */
export function formatBulkDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < SECONDS_PER_MINUTE) return 'menos de 1 min';
  const totalMinutes = Math.round(s / SECONDS_PER_MINUTE);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Turn a load summary into the coverage the screens must agree on: the state,
 * the verdict gate, and the exact wording. Built ONCE here so the roster and the
 * deep-dive can never declare the same athlete differently.
 */
export function readLoadCoverage(summary: LoadSummary): LoadCoverage {
  const known_seconds = summary.known_seconds_28d;
  const unknown_seconds = summary.unknown_seconds_28d;
  const unknown_sessions = summary.unknown_sessions_28d;
  const total = known_seconds + unknown_seconds;

  if (total <= 0) {
    return {
      state: 'no_work',
      pct: null,
      known_seconds,
      unknown_seconds,
      unknown_sessions,
      // Nothing was executed, so nothing is missing: zero load is a measurement,
      // not a hole, and it earns its verdict like any other reading.
      allows_verdict: true,
      badge_es: null,
      note_es: null,
      action_es: null,
    };
  }

  const pct = known_seconds / total;

  if (unknown_seconds <= 0) {
    return {
      state: 'complete',
      pct,
      known_seconds,
      unknown_seconds,
      unknown_sessions,
      allows_verdict: true,
      badge_es: null,
      note_es: null,
      action_es: null,
    };
  }

  const allows_verdict = pct >= LOAD_COVERAGE_MIN;
  // Round DOWN: a 89.7 % reading must not present itself as 90 %, the very line
  // where the verdict is withheld.
  const pctLabel = Math.floor(pct * 100);
  const one = unknown_sessions === 1;
  const sessions = one ? '1 sesión sin valorar' : `${unknown_sessions} sesiones sin valorar`;
  const gap = `${sessions} (${formatBulkDuration(unknown_seconds)}) ${one ? 'se queda' : 'se quedan'} fuera de estos números`;

  return {
    state: 'partial',
    pct,
    known_seconds,
    unknown_seconds,
    unknown_sessions,
    allows_verdict,
    badge_es: `${pctLabel} % valorado`,
    note_es: allows_verdict
      ? `${gap}: la carga real es igual o mayor.`
      : `${gap}. Con ese hueco no se puede decir si está fresco o cargado.`,
    action_es: one ? 'Pídele el RPE de esa sesión.' : 'Pídele el RPE de esas sesiones.',
  };
}
