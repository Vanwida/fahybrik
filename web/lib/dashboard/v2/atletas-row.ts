// v2 ATLETAS — view-model for one roster row. Flattens an AthleteRow into the
// exact display fields the table renders, deriving each from the REAL loader
// fields (no invented data). Centralised so sorting/filtering and the cell
// rendering read the same derived values. Pure, server-safe (no 'use client').

import type { AthleteRow } from '@/lib/dashboard/athletes/list';
import { athleteLevel } from '@/lib/dashboard/v2/level';
import type { AthleteLevel } from '@/components/v2/LevelBadge';
import { rosterStatus, type RosterStatus } from '@/lib/dashboard/v2/atletas-status';
import { atrPhaseLabel } from '@/lib/dashboard/constants/atr-phases';

export interface RosterRow {
  athlete_id: string;
  full_name: string;
  level: AthleteLevel;
  status: RosterStatus;
  /** "Acumulación · sem 2" | "Sin fase" — derived from block_type/week. */
  phase_label: string;
  /** Compact ATR code for the phase badge, null when no active block. */
  phase_code: 'ACC' | 'TRANS' | 'REAL' | null;
  /** Current-week compliance % (loader field), null when no scheduled work. */
  adherence_pct: number | null;
  /** Numeric level rank (1–4) for sorting. */
  level_rank: number;
}

const LEVEL_RANK: Record<AthleteLevel, number> = { N1: 1, N2: 2, N3: 3, N4: 4 };

/** Build the phase label from block_type + week, e.g. "Intensificación · sem 3". */
function phaseLabel(a: AthleteRow): string {
  if (a.block_type == null) return 'Sin fase';
  const base = atrPhaseLabel(a.block_type);
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
    level_rank: LEVEL_RANK[level],
  };
}
