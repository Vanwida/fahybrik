// v2 ATLETAS — view-model for one roster row. Flattens an AthleteRow into the
// exact display fields the table renders, deriving each from the REAL loader
// fields (no invented data). Centralised so sorting/filtering and the cell
// rendering read the same derived values. Pure, server-safe (no 'use client').

import type { AthleteRow } from '@/lib/dashboard/athletes/list';
import { athleteLevel } from '@/lib/dashboard/v2/level';
import { rosterStatus, type RosterStatus } from '@/lib/dashboard/v2/atletas-status';
import { isCheckinRisk } from '@/lib/dashboard/coach/checkin-presentation';
import { PAUSE_REASON_LABELS } from '@fahybrid/shared/domain/coach/athlete-lifecycle';
import type { InjuryZone, InjuryStatus } from '@fahybrid/shared/domain/coach/injury-taxonomy';
import type { AthleteWeekChip } from '@fahybrid/shared/domain/coach/athlete-week-chip';

export interface RosterRow {
  athlete_id: string;
  full_name: string;
  /** Foto del atleta (base de entrega), null = iniciales. */
  avatar_url: string | null;
  /** Real level name from athlete_levels.name (e.g. 'N1', 'N4'). Null = not assigned. */
  level: string | null;
  status: RosterStatus;
  /** "Acumulación · sem 2" | "Sin microciclo" — the coach's microciclo name + week. */
  phase_label: string;
  /** Raw microciclo name (presence + filter key), null when no active microciclo. */
  phase_code: string | null;
  /** Rolling 30-day completion adherence % (loader field), null when no scheduled
   *  work in the window. Same definition as the atleta-detalle header tile. */
  adherence_pct: number | null;
  /** Numeric level rank for sorting (athlete_levels.sort_order). 0 = no level. */
  level_rank: number;
  /** ISO timestamp of the most recent logged session, null when none. */
  last_activity_at: string | null;
  /** Reason label appended to a paused badge ("Lesión"), null unless pausado.
   *  Lets the roster render "En pausa · Lesión" from one derived value. */
  status_detail: string | null;
  /** "Pidió pausa" indicator: the pending-request reason label, null = none pending. */
  pause_request_label: string | null;
  /** The athlete's open injury (#16) for the at-a-glance badge, null when none. The
   *  label + tone are derived at render (injuryBadge) so this stays pure data. */
  injury: { zone: InjuryZone; status: InjuryStatus } | null;
  /** TODAY's check-in sub-score, only when it sits in the risk band (<40, the
   *  adaptive-rule band) — drives the «Check-in N · hoy» chip. Null otherwise;
   *  a bad check-in from yesterday never paints it (viejo ≠ hoy). */
  checkin_risk_sub: number | null;
  /** Entrega de la semana calendario (Visible / No lo ve / …). */
  week_chip: AthleteWeekChip;
}

/** Build the label from the microciclo name + week, e.g. "Acumulación · sem 3". */
function phaseLabel(a: AthleteRow): string {
  if (a.block_type == null) return 'Sin ciclo';
  const base = a.block_type;
  return a.block_week != null ? `${base} · sem ${a.block_week}` : base;
}

export function toRosterRow(a: AthleteRow): RosterRow {
  const level = athleteLevel(a);
  return {
    athlete_id: a.athlete_id,
    full_name: a.full_name,
    avatar_url: a.avatar_url,
    level,
    status: rosterStatus(a),
    phase_label: phaseLabel(a),
    phase_code: a.block_type,
    // Rolling 30-day completion adherence (the loader's window, single-sourced
    // with the resumen via @fahybrid/shared/domain/adherence) — the market-standard
    // meaning of "adherencia", consistent with the atleta-detalle header tile.
    adherence_pct: a.compliance_pct,
    level_rank: a.level_sort,
    last_activity_at: a.last_activity_at,
    // Reason labels come from shared/domain (single source), resolved here so the
    // row cell stays pure. Detail only when actually paused; request label only when
    // an athlete-initiated request is still pending.
    status_detail:
      a.lifecycle_status === 'pausado' && a.pause_reason
        ? PAUSE_REASON_LABELS[a.pause_reason]
        : null,
    pause_request_label: a.pause_request_reason
      ? PAUSE_REASON_LABELS[a.pause_request_reason]
      : null,
    injury: a.injury,
    checkin_risk_sub:
      a.checkin_today_sub != null && isCheckinRisk(a.checkin_today_sub)
        ? a.checkin_today_sub
        : null,
    week_chip: a.week_chip,
  };
}
