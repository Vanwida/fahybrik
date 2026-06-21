// v2 — SINGLE SOURCE OF TRUTH for an athlete's competitive level (N1–N4).
//
// The roster model does not yet persist an explicit level field, so v2 derives
// a stable placeholder from the athlete's MODALITY/subscription tier. Centralising
// it here means the SAME athlete reads as the SAME level in every surface (Hoy
// lanes, roster table, detail header, chat) — previously the espera-respuesta lane
// hardcoded N1 while the roster lanes derived from modality, so one athlete could
// show N1 in one column and N2 in another. One function, one answer.
//
// TODO(model): replace this heuristic with a real, persisted `athlete.level`
// column once the level/benchmark engine emits it (F-follow-up). When that lands,
// this util becomes a thin read of that field and every callsite stays unchanged.

import type { AthleteLevel } from '@/components/v2/LevelBadge';

/** Modality tier the heuristic reads. Mirrors `AthleteModality` from the roster
 *  loader, kept structurally minimal so any athlete-like row can be passed in. */
export type AthleteModalityLike = 'individual' | 'dobles' | 'pro_elite' | null | undefined;

export interface AthleteLevelInput {
  /** Subscription/modality tier — the only signal the current heuristic uses. */
  modality?: AthleteModalityLike;
}

/**
 * Derive an athlete's level (N1–N4) from their modality tier:
 *   pro_elite → N4 · dobles → N3 · individual → N2 · unknown/none → N1.
 * Pass any object exposing `modality` (e.g. an `AthleteRow`). When modality is
 * unknown the athlete defaults to N1 — the safest "entry" rung.
 */
export function athleteLevel(athlete: AthleteLevelInput): AthleteLevel {
  switch (athlete.modality) {
    case 'pro_elite':
      return 'N4';
    case 'dobles':
      return 'N3';
    case 'individual':
      return 'N2';
    default:
      return 'N1';
  }
}
