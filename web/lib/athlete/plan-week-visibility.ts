import 'server-only';

// Resolutor del horizonte de visibilidad del plan para UN atleta (FH-27).
// Free (sin coach) → max 0, sin wall de club. Con coach → lee su club.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingColumn } from '@/lib/dashboard/db/pg-errors';
import {
  DEFAULT_PLAN_WEEK_HORIZON,
  LEGACY_PLAN_WEEK_HORIZON,
  maxWeekOffset,
  planWeekHorizonWallMessage,
  type PlanWeekHorizon,
} from '@fahybrid/shared/domain/coach/plan-week-horizon';
import type { AthletePlanWeekVisibility } from '@fahybrid/shared/schema/coach-plan-week-horizon';

const COLUMN = 'plan_week_horizon';

export interface ResolvedPlanWeekVisibility extends AthletePlanWeekVisibility {
  /** Horizonte crudo del coach — null si free. */
  coachHorizon: PlanWeekHorizon | null;
}

/** Atleta sin coach: solo la semana en curso, sin copy de club. */
export function freeAthletePlanVisibility(): ResolvedPlanWeekVisibility {
  return {
    max_week_offset: 0,
    horizon: null,
    peek_blocked_by_horizon: false,
    wall_message: null,
    coachHorizon: null,
  };
}

async function loadCoachHorizonForAthlete(
  athlete_id: number | bigint,
  client: Sql,
): Promise<{ coach_id: bigint | null; horizon: PlanWeekHorizon | null }> {
  try {
    const rows = await client<
      Array<{ coach_id: string | null; plan_week_horizon: PlanWeekHorizon | null }>
    >`
      select
        a.coach_id::text as coach_id,
        c.plan_week_horizon
      from athletes a
      left join coaches c on c.id = a.coach_id
      where a.id = ${athlete_id as number}
      limit 1
    `;
    const row = rows[0];
    if (!row?.coach_id) return { coach_id: null, horizon: null };
    return {
      coach_id: BigInt(row.coach_id),
      horizon: row.plan_week_horizon ?? DEFAULT_PLAN_WEEK_HORIZON,
    };
  } catch (err) {
    if (isPgMissingColumn(err, COLUMN)) {
      const rows = await client<Array<{ coach_id: string | null }>>`
        select coach_id::text as coach_id from athletes where id = ${athlete_id as number} limit 1
      `;
      const coachId = rows[0]?.coach_id;
      if (!coachId) return { coach_id: null, horizon: null };
      return { coach_id: BigInt(coachId), horizon: LEGACY_PLAN_WEEK_HORIZON };
    }
    throw err;
  }
}

/**
 * Horizonte vigente para el atleta. `peek_blocked_by_horizon` se rellena cuando
 * el caller sabe que hay contenido publicado en offset+1 pero el tope lo impide.
 */
export async function resolveAthletePlanWeekVisibility(
  athlete_id: number | bigint,
  opts: {
    weekOffset?: number;
    nextWeekPublished?: boolean;
    client?: Sql;
  } = {},
): Promise<ResolvedPlanWeekVisibility> {
  const client = opts.client ?? defaultSql;
  const { coach_id, horizon } = await loadCoachHorizonForAthlete(athlete_id, client);

  if (coach_id == null || horizon == null) {
    return freeAthletePlanVisibility();
  }

  const max_week_offset = maxWeekOffset(horizon);
  const weekOffset = opts.weekOffset ?? 0;
  const nextWeekPublished = opts.nextWeekPublished ?? false;
  const peek_blocked_by_horizon =
    nextWeekPublished && weekOffset >= max_week_offset && max_week_offset >= 0;

  return {
    max_week_offset,
    horizon,
    peek_blocked_by_horizon,
    wall_message: peek_blocked_by_horizon ? planWeekHorizonWallMessage(horizon) : null,
    coachHorizon: horizon,
  };
}

/** Mensaje de muro cuando el cliente pide un offset fuera de rango. */
export function wallMessageForOffsetDenied(
  visibility: ResolvedPlanWeekVisibility,
): string {
  if (visibility.horizon) return planWeekHorizonWallMessage(visibility.horizon);
  return planWeekHorizonWallMessage(null);
}
