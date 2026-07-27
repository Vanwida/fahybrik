// «Cómo se encuentra» — pure presentation domain for the daily check-in.
//
// The athlete answers 5 questions in iOS (CheckinModel.swift) where soreness and
// fatigue are NEGATIVELY keyed in storage (5 = worst) but were ASKED positively
// («Recuperación muscular», «Energía»: 1 peor → 5 mejor) via an inverted binding.
// Every coach surface must mirror the question the athlete actually answered, so
// the inversion happens HERE, once — a raw soreness 5 renders as «Recuperación 1/5»,
// never as a high mark. Pure module (no server imports): usable from client
// components and unit-testable without a DB.

/** Sub-score danger band. A check-in below this is "viene mal": it drives the
 *  roster chip AND the adaptive-override rule (lib/sync/checkin.ts) — one number,
 *  two consumers, never two thresholds drifting apart. */
export const CHECKIN_RISK_SUB_SCORE_MAX = 40;

/** Below this (and above the risk band) the score pill reads as warn — aligned
 *  with the PlanTab "A vigilar" readiness banner threshold. */
export const CHECKIN_WARN_SUB_SCORE_MAX = 55;

/** The latest check-in as the resumen ships it (display-anchored, athlete-tz). */
export interface CheckinContent {
  /** Athlete-local ISO day the check-in belongs to. */
  recorded_for: string;
  /** 'HH:MM' wall-clock in the athlete's timezone (display-ready). */
  time_label: string;
  /** Whole local days between the athlete's today and recorded_for (0 = today). */
  days_ago: number;
  soreness: number | null;
  mood: number | null;
  motivation: number | null;
  fatigue: number | null;
  sleep_quality: number | null;
  notes: string | null;
  sub_score: number;
  adaptive_flag: string | null;
}

/** One slot of the trailing-7-local-days strip (ascending, today last). A day
 *  without a check-in ships sub_score null — an honest gap, never a zero. */
export interface CheckinWeekSlot {
  iso: string;
  /** ISO weekday 1 (lunes) … 7 (domingo). */
  dow: number;
  sub_score: number | null;
}

export type CheckinTone = 'ok' | 'warn' | 'danger';

/** True when the check-in sits in the risk band (drives the roster chip). */
export function isCheckinRisk(subScore: number): boolean {
  return subScore < CHECKIN_RISK_SUB_SCORE_MAX;
}

/** Tone for a 0–100 sub-score (score pill + week-strip squares). */
export function checkinScoreTone(subScore: number): CheckinTone {
  if (subScore < CHECKIN_RISK_SUB_SCORE_MAX) return 'danger';
  if (subScore < CHECKIN_WARN_SUB_SCORE_MAX) return 'warn';
  return 'ok';
}

/** Tone for a 1–5 dimension value (already positive-framed). */
export function checkinValueTone(value: number): CheckinTone {
  if (value <= 2) return 'danger';
  if (value === 3) return 'warn';
  return 'ok';
}

export interface CheckinDimensionRow {
  key: 'soreness' | 'mood' | 'motivation' | 'fatigue' | 'sleep_quality';
  /** The EXACT question label the athlete answered in iOS. */
  label: string;
  /** Positive-framed 1–5 (5 = mejor, siempre) — inverted for soreness/fatigue. */
  value: number | null;
}

/** The 5 question rows, positive-framed, in the iOS question order. */
export function checkinDimensionRows(c: {
  soreness: number | null;
  mood: number | null;
  motivation: number | null;
  fatigue: number | null;
  sleep_quality: number | null;
}): CheckinDimensionRow[] {
  const invert = (v: number | null) => (v == null ? null : 6 - v);
  return [
    { key: 'soreness', label: 'Recuperación muscular', value: invert(c.soreness) },
    { key: 'mood', label: 'Ánimo', value: c.mood },
    { key: 'motivation', label: 'Motivación', value: c.motivation },
    { key: 'fatigue', label: 'Energía', value: invert(c.fatigue) },
    { key: 'sleep_quality', label: 'Calidad del sueño', value: c.sleep_quality },
  ];
}

/** Header freshness copy: today shows the time, older days are dated honestly. */
export function checkinFreshnessLabel(c: Pick<CheckinContent, 'days_ago' | 'time_label'>): string {
  if (c.days_ago <= 0) return `Check-in de hoy · ${c.time_label}`;
  if (c.days_ago === 1) return 'Check-in de ayer';
  return `Último check-in hace ${c.days_ago} días`;
}

/** Coach-facing copy per adaptive flag. Unknown/legacy flags render nothing
 *  rather than inventing a claim about what the app proposed. */
export function adaptiveFlagCopy(flag: string | null): string | null {
  if (flag === 'consider_swap_z2_30') {
    return 'Check-in en banda de riesgo con sesión exigente hoy y HRV a la baja. La app le ha propuesto cambiar a Z2 · 30′ — decides tú.';
  }
  return null;
}

/** Weekday initial for the strip (ISO dow 1–7 → L M X J V S D). */
export const CHECKIN_DOW_LABEL: Record<number, string> = {
  1: 'L',
  2: 'M',
  3: 'X',
  4: 'J',
  5: 'V',
  6: 'S',
  7: 'D',
};
