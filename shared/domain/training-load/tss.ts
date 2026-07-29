// Training Stress Score (Banister-style).
//
// Reference TSS = 100 for one hour at threshold (intensity factor 1.0).
// Intensity comes from exactly ONE source, in this order of preference:
//   1. Power vs FTP  (avg_power_watts + ftp_watts)
//   2. HR vs LTHR    (avg_hr + lthr)
//   3. The athlete's own RPE
//
// HONESTIDAD DEL DATO (docs/CONTRATO-UI.md §7) — there is NO fourth mode.
// A session whose intensity nobody measured or declared does NOT get a default
// intensity: `computeTss` returns null and the caller carries its duration as
// unpriced work. The previous default (IF 0.65) turned every unrated session
// into ~42 TSS per hour of invented load, which fed the coach's fitness/fatigue
// trends and the progression engine as if it were evidence.
//
// Today only mode 3 can ever fire: `workout_executions` stores
// `total_duration_seconds` and `perceived_exertion` and nothing else — there is
// no HR column, no power column, and no LTHR/FTP anywhere in the schema
// (verified against production, 28-jul-2026). Modes 1–2 are the contract for
// when per-session HR/power lands; they are covered by tests and must not be
// mistaken for live paths.

/**
 * The threshold heart rate the HR mode prices a session against, WITH its
 * provenance — never a bare number.
 *
 * WHY THE SHAPE. `resolveThresholdHr` always answers, because its last rung is
 * 0.88 × Tanaka(age): every athlete with a birth date has an "LTHR". If this
 * field were a plain `number | null`, that estimate would flow in at the type
 * boundary and the engine would price the session's intensity against a
 * BIRTHDAY — then report it as measured intensity, and `loadIntensityCoverage()`
 * would read 100 % on invented load. That is the same failure the 0.65 default
 * IF caused, rebuilt one layer up. The type now refuses to carry the anchor
 * without the flag that decides whether it may be used.
 */
export type TssThresholdHr = {
  bpm: number;
  /** True when inferred (from a max HR, or from age). Estimated ⇒ NOT usable here. */
  estimated: boolean;
};

export type TssInput = {
  duration_seconds: number;
  rpe?: number | null;            // 1..10
  avg_hr?: number | null;         // bpm
  /** Measured threshold HR + provenance. An ESTIMATED anchor prices nothing. */
  lthr?: TssThresholdHr | null;
  hr_rest?: number | null;        // bpm
  hr_max?: number | null;         // bpm
  avg_power_watts?: number | null;
  ftp_watts?: number | null;
};

const SECONDS_PER_HOUR = 3600;

// Map RPE 1..10 to a relative intensity factor.
// 10 = ~1.10 (race effort), 7 = ~0.85 (threshold), 5 = ~0.70 (tempo), 3 = ~0.55 (easy aerobic).
// Quadratic-ish curve calibrated against Foster session-RPE convention.
const RPE_TO_IF: ReadonlyMap<number, number> = new Map([
  [1, 0.30],
  [2, 0.45],
  [3, 0.55],
  [4, 0.65],
  [5, 0.70],
  [6, 0.78],
  [7, 0.85],
  [8, 0.93],
  [9, 1.00],
  [10, 1.10],
]);

/**
 * RPE → intensity factor. Null when the value is not a usable RPE (NaN, ±∞):
 * a broken number is "unknown", never a mid-scale guess.
 */
function ifFromRpe(rpe: number): number | null {
  if (!Number.isFinite(rpe)) return null;
  const clamped = Math.min(10, Math.max(1, Math.round(rpe)));
  return RPE_TO_IF.get(clamped) ?? null;
}

// Karvonen-based HR reserve fraction → IF approximation.
// HRR fraction at LTHR is ~0.85 for trained athletes; we anchor IF=1.0 there.
function ifFromHr(input: TssInput): number | null {
  const { avg_hr, lthr } = input;
  if (avg_hr == null || lthr == null || lthr.bpm <= 0) return null;
  // An ESTIMATED threshold does not price a session. Falling through to RPE (or to
  // null) is the honest answer: better an unpriced hour the coach can see than a
  // TSS whose intensity came from the athlete's date of birth.
  if (lthr.estimated) return null;
  return avg_hr / lthr.bpm;
}

function ifFromPower(input: TssInput): number | null {
  const { avg_power_watts, ftp_watts } = input;
  if (avg_power_watts == null || ftp_watts == null || ftp_watts <= 0) return null;
  return avg_power_watts / ftp_watts;
}

/**
 * Effective intensity factor — power > HR > RPE preference.
 * NULL when none of the three is available: the session's intensity is unknown.
 */
export function intensityFactor(input: TssInput): number | null {
  const ifPower = ifFromPower(input);
  if (ifPower != null) return ifPower;
  const ifHr = ifFromHr(input);
  if (ifHr != null) return ifHr;
  if (input.rpe == null) return null;
  return ifFromRpe(input.rpe);
}

/**
 * Load for one session.
 *   • 0    — no duration, so no work was done (nothing to price).
 *   • null — there IS duration but its intensity is unknown. The caller must
 *            carry the duration as unpriced work, never substitute a number.
 */
export function computeTss(input: TssInput): number | null {
  if (!Number.isFinite(input.duration_seconds) || input.duration_seconds <= 0) {
    return 0;
  }
  const intensity = intensityFactor(input);
  if (intensity == null) return null;
  const hours = input.duration_seconds / SECONDS_PER_HOUR;
  // TSS = (sec × NP × IF) / (FTP × 3600) × 100. With NP=FTP×IF this reduces to:
  return Math.max(0, hours * intensity * intensity * 100);
}
