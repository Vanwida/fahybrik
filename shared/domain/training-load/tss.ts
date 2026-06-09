// Training Stress Score (Banister-style).
//
// Reference TSS = 100 for one hour at threshold (intensity factor 1.0).
// We support three estimation modes, in order of preference:
//   1. HR-based TrIMP-to-TSS conversion (when avg HR + LTHR known)
//   2. Power-based TSS (when power data + FTP known)
//   3. RPE × duration fallback (always available)
//
// Élite-grade calculations require LTHR/FTP per athlete; until those are
// captured in athlete_benchmarks (field events tracked separately), the
// RPE fallback is the operating mode.

export type TssInput = {
  duration_seconds: number;
  rpe?: number | null;            // 1..10
  avg_hr?: number | null;         // bpm
  lthr?: number | null;           // bpm — Lactate Threshold HR
  hr_rest?: number | null;        // bpm
  hr_max?: number | null;         // bpm
  avg_power_watts?: number | null;
  ftp_watts?: number | null;
};

const SECONDS_PER_HOUR = 3600;

// Map RPE 1..10 to a relative intensity factor.
// 10 = ~1.10 (race effort), 7 = ~0.85 (threshold), 5 = ~0.70 (tempo), 3 = ~0.55 (easy aerobic).
// Quadratic-ish curve calibrated against Foster session-RPE convention.
const RPE_TO_IF: Record<number, number> = {
  1: 0.30,
  2: 0.45,
  3: 0.55,
  4: 0.65,
  5: 0.70,
  6: 0.78,
  7: 0.85,
  8: 0.93,
  9: 1.00,
  10: 1.10,
};

function clampRpe(rpe: number): number {
  if (!Number.isFinite(rpe)) return 5;
  if (rpe < 1) return 1;
  if (rpe > 10) return 10;
  return Math.round(rpe);
}

function ifFromRpe(rpe: number): number {
  return RPE_TO_IF[clampRpe(rpe)] ?? 0.7;
}

// Karvonen-based HR reserve fraction → IF approximation.
// HRR fraction at LTHR is ~0.85 for trained athletes; we anchor IF=1.0 there.
function ifFromHr(input: TssInput): number | null {
  const { avg_hr, lthr } = input;
  if (avg_hr == null || lthr == null || lthr <= 0) return null;
  return avg_hr / lthr;
}

function ifFromPower(input: TssInput): number | null {
  const { avg_power_watts, ftp_watts } = input;
  if (avg_power_watts == null || ftp_watts == null || ftp_watts <= 0) return null;
  return avg_power_watts / ftp_watts;
}

// Effective intensity factor — power > HR > RPE preference.
export function intensityFactor(input: TssInput): number {
  const ifPower = ifFromPower(input);
  if (ifPower != null) return ifPower;
  const ifHr = ifFromHr(input);
  if (ifHr != null) return ifHr;
  if (input.rpe != null) return ifFromRpe(input.rpe);
  return 0.65;
}

export function computeTss(input: TssInput): number {
  if (!Number.isFinite(input.duration_seconds) || input.duration_seconds <= 0) {
    return 0;
  }
  const hours = input.duration_seconds / SECONDS_PER_HOUR;
  const intensity = intensityFactor(input);
  // TSS = (sec × NP × IF) / (FTP × 3600) × 100. With NP=FTP×IF this reduces to:
  return Math.max(0, hours * intensity * intensity * 100);
}
