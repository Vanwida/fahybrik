// v2 ATLETAS — view-model for one roster row. Flattens an AthleteRow into the
// exact display fields the table renders, deriving each from the REAL loader
// fields (no invented data). Centralised so sorting/filtering and the cell
// rendering read the same derived values. Pure, server-safe (no 'use client').

import type { AthleteRow } from '@/lib/dashboard/athletes/list';
import { athleteLevel } from '@/lib/dashboard/v2/level';
import { rosterStatus, type RosterStatus } from '@/lib/dashboard/v2/atletas-status';

export interface RosterRow {
  athlete_id: string;
  full_name: string;
  /** Real level name from athlete_levels.name (e.g. 'N1', 'N4'). Null = not assigned. */
  level: string | null;
  status: RosterStatus;
  /** "Acumulación · sem 2" | "Sin microciclo" — the coach's microciclo name + week. */
  phase_label: string;
  /** Raw microciclo name (presence + filter key), null when no active microciclo. */
  phase_code: string | null;
  /** Current-week compliance % (loader field), null when no scheduled work. */
  adherence_pct: number | null;
  /** Numeric level rank for sorting (athlete_levels.sort_order). 0 = no level. */
  level_rank: number;
}

/** Build the label from the microciclo name + week, e.g. "Acumulación · sem 3". */
function phaseLabel(a: AthleteRow): string {
  if (a.block_type == null) return 'Sin microciclo';
  const base = a.block_type;
  return a.block_week != null ? `${base} · sem ${a.block_week}` : base;
}

export function toRosterRow(a: AthleteRow): RosterRow {
  const level = athleteLevel(a);
  return {
    athlete_id: a.athlete_id,
    full_name: a.full_name,
    level,
    status: rosterStatus(a),
    phase_label: phaseLabel(a),
    phase_code: a.block_type,
    // NOTE: the loader computes CURRENT-WEEK compliance, not a true 30-day window.
    // The UI labels this honestly ("adherencia", not "30d") until a rolling-30d
    // signal exists. // TODO(model): real 30-day adherence aggregate.
    adherence_pct: a.compliance_pct,
    level_rank: a.level_sort,
  };
}
