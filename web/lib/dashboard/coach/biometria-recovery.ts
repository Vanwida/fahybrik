// Recovery / readiness presentation for the coach Biometría tab.
//
// Mirrors the *product shape* of Whoop Recovery / Oura Readiness: one status
// the coach can trust in 3 seconds, built only from signals we already store
// (HRV vs 28d baseline, RHR vs 30d baseline, last-night sleep). Pure — no DB.
//
// Thresholds are product defaults (not coach methodology bands yet). If a coach
// later needs different cut-points, they become editable data — not more consts
// scattered in the UI.

import type { BodyPayload, SleepNight } from '@/lib/dashboard/coach/deep-dive-body';

/** Whoop/Oura-style band for the coach: can they load, hold, or unload. */
export type RecoveryBand = 'green' | 'yellow' | 'red' | 'unknown';

export interface RecoveryVerdict {
  band: RecoveryBand;
  /** Short Spanish label for the hero. */
  label: string;
  /** One-line coach rationale (what fired). */
  detail: string;
  /** True when at least one physiological signal exists for the decision. */
  has_signal: boolean;
}

export interface SignalVsBaseline {
  /** Latest reading. */
  value: number | null;
  /** Athlete baseline (HRV 28d / RHR 30d). */
  baseline: number | null;
  /** value − baseline when both exist. */
  delta: number | null;
  /** value / baseline when both exist and baseline > 0. */
  ratio: number | null;
}

// ── Defaults (document why) ──────────────────────────────────────────────────
/** HRV more than 10% under baseline → recovery stress (Whoop-ish relative). */
const HRV_YELLOW_RATIO = 0.9;
/** HRV more than 20% under baseline → unload. */
const HRV_RED_RATIO = 0.8;
/** Resting HR ≥ +3 bpm over baseline → stress flag. */
const RHR_YELLOW_DELTA_BPM = 3;
/** Resting HR ≥ +6 bpm over baseline → strong stress. */
const RHR_RED_DELTA_BPM = 6;
/** Last night under this many hours → yellow sleep flag. */
const SLEEP_YELLOW_HOURS = 6.5;
/** Last night under this → red sleep flag. */
const SLEEP_RED_HOURS = 5.5;

export function hrvVsBaseline(body: BodyPayload): SignalVsBaseline {
  const value = body.hrv.last_value_ms;
  const baseline = body.hrv.current_baseline_ms;
  return vs(value, baseline);
}

export function rhrVsBaseline(body: BodyPayload): SignalVsBaseline {
  const value = body.rhr.last_bpm;
  const baseline = body.rhr.baseline_30d;
  return vs(value, baseline);
}

function vs(value: number | null, baseline: number | null): SignalVsBaseline {
  if (value == null || baseline == null || baseline === 0) {
    return { value, baseline, delta: null, ratio: null };
  }
  return {
    value,
    baseline,
    delta: value - baseline,
    ratio: value / baseline,
  };
}

/** Most recent night with a total_hours reading, scanning newest first. */
export function lastSleepNight(body: BodyPayload): SleepNight | null {
  for (let i = body.sleep.nights.length - 1; i >= 0; i--) {
    const n = body.sleep.nights[i]!;
    if (n.total_hours != null) return n;
  }
  return null;
}

/**
 * Composite recovery band from available signals. Missing signals are skipped
 * (never invent a green). Zero signals → unknown.
 */
export function deriveRecoveryVerdict(body: BodyPayload): RecoveryVerdict {
  const hrv = hrvVsBaseline(body);
  const rhr = rhrVsBaseline(body);
  const night = lastSleepNight(body);
  const sleepH = night?.total_hours ?? null;

  const flags: string[] = [];
  let reds = 0;
  let yellows = 0;

  if (hrv.ratio != null) {
    if (hrv.ratio < HRV_RED_RATIO) {
      reds += 1;
      flags.push('VFC muy por debajo de su línea base');
    } else if (hrv.ratio < HRV_YELLOW_RATIO) {
      yellows += 1;
      flags.push('VFC por debajo de su línea base');
    }
  }

  if (rhr.delta != null) {
    if (rhr.delta >= RHR_RED_DELTA_BPM || body.rhr.trend_30d === 'up') {
      if (rhr.delta >= RHR_RED_DELTA_BPM) {
        reds += 1;
        flags.push('FC reposo elevada vs su baseline');
      } else if (body.rhr.trend_30d === 'up') {
        yellows += 1;
        flags.push('FC reposo al alza en 30 días');
      }
    } else if (rhr.delta >= RHR_YELLOW_DELTA_BPM) {
      yellows += 1;
      flags.push('FC reposo algo alta vs su baseline');
    }
  } else if (body.rhr.trend_30d === 'up') {
    yellows += 1;
    flags.push('FC reposo al alza en 30 días');
  }

  // Legacy drop count from the payload (crossings under baseline) — backs the
  // same story when we have history but a soft last value.
  if (body.hrv.drops_count >= 3) {
    reds += 1;
    flags.push(`${body.hrv.drops_count} caídas de VFC bajo baseline`);
  } else if (body.hrv.drops_count >= 2) {
    yellows += 1;
    flags.push(`${body.hrv.drops_count} caídas de VFC bajo baseline`);
  }

  if (sleepH != null) {
    if (sleepH < SLEEP_RED_HOURS) {
      reds += 1;
      flags.push(`sueño anoche ${sleepH.toFixed(1)} h`);
    } else if (sleepH < SLEEP_YELLOW_HOURS) {
      yellows += 1;
      flags.push(`sueño anoche ${sleepH.toFixed(1)} h`);
    }
  }

  const has_signal =
    hrv.value != null || rhr.value != null || sleepH != null || body.hrv.drops_count > 0;

  if (!has_signal) {
    return {
      band: 'unknown',
      label: 'Sin señales fiables',
      detail: 'Cuando el reloj o el check-in sincronicen, verás aquí si puede cargar.',
      has_signal: false,
    };
  }

  if (reds >= 1 || yellows >= 3) {
    return {
      band: 'red',
      label: 'Descargar',
      detail: flags.slice(0, 3).join(' · ') || 'Señales de fatiga acumulada.',
      has_signal: true,
    };
  }
  if (yellows >= 1) {
    return {
      band: 'yellow',
      label: 'Mantener',
      detail: flags.slice(0, 3).join(' · ') || 'Algo de estrés; no subas carga.',
      has_signal: true,
    };
  }
  return {
    band: 'green',
    label: 'Puede cargar',
    detail: 'VFC, FC reposo y sueño en rango respecto a su propia línea base.',
    has_signal: true,
  };
}
