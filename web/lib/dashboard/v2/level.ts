// v2 — SINGLE SOURCE OF TRUTH for an athlete's level display name.
//
// Previously this derived a fake level (N1–N4) from the subscription modality
// (pro_elite→N4, dobles→N3, individual→N2, else→N1). That heuristic is now
// replaced: migration 0057 added athletes.level_id → athlete_levels(id), and
// the roster loader joins athlete_levels to read the real level name directly
// from the database.
//
// This module is now a thin adapter: it reads level_name from the joined row
// and returns it as-is. Callers that need a display string get the coach-defined
// level name (e.g. 'N1', 'N3', 'Elite'). Null means the athlete has no level
// assigned — UIs render "—" in that case.

export interface AthleteLevelInput {
  /** Real level name from athlete_levels.name, null when none assigned. */
  level_name: string | null;
  /** sort_order from athlete_levels, used for ranking; 0 when null. */
  level_sort: number;
}

/**
 * Returns the athlete's level name from the DB join, or null when none is set.
 * Null → UI should render "—", not a fabricated level.
 */
export function athleteLevel(athlete: AthleteLevelInput): string | null {
  return athlete.level_name ?? null;
}
