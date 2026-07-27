// @fahybrid/shared/domain/goal-gap — the GOAL label (pure).
//
// HYROX goals are spoken in whole minutes ("sub-60", "sub-75", "sub-59"). ANY
// whole-minute goal reads "Sub-<minutes>" — a 3540 goal is a sub-59 attempt, not
// a "59:00" — and only a non-round value (e.g. 3512) shows the exact clock
// (H:MM:SS over an hour, else M:SS).

import {
  ACCURACY_AFINANDO_MIN,
  ACCURACY_CLAVADO_MIN,
  ACCURACY_MUY_AFINADO_MIN,
} from '../evidence';

/** Seconds → exact clock string: "1:15:00" over an hour, else "58:30". */
export function exactTimeLabel(totalS: number): string {
  const t = Math.max(0, Math.round(totalS));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "Sub-75" (any whole-minute goal), else the exact clock. */
export function goalLabel(totalS: number): string {
  const t = Math.round(totalS);
  if (t > 0 && t % 60 === 0) return `Sub-${t / 60}`;
  return exactTimeLabel(t);
}

// ── Precision label (predicted vs real) ───────────────────────────────────────
//
// The single-sentence read on how well the prediction held, keyed on accuracy_pct
// (0–100, higher = the prediction landed closer). Rendered mid-phrase after the
// percent — "Predicción a 98% — clavado" — so the copy is lowercase.

/** Accuracy tiers, highest first; `min` is the inclusive lower bound (percent).
 *  The boundaries live in domain/evidence because the prediction BANDS are
 *  derived from the very same scale — one statement of "how wrong is wrong". */
const ACCURACY_TIERS: ReadonlyArray<{ min: number; label: string }> = [
  { min: ACCURACY_CLAVADO_MIN, label: 'clavado' },
  { min: ACCURACY_MUY_AFINADO_MIN, label: 'muy afinado' },
  { min: ACCURACY_AFINANDO_MIN, label: 'afinando' },
];
/** Below the lowest tier — the prediction still has a way to go. */
const ACCURACY_TIER_FLOOR = 'aún lejos';

/** accuracy_pct (0–100) → its Spanish precision label. */
export function accuracyLabel(accuracyPct: number): string {
  for (const t of ACCURACY_TIERS) if (accuracyPct >= t.min) return t.label;
  return ACCURACY_TIER_FLOOR;
}
