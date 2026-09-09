import 'server-only';

// Lectura/escritura de `coaches.plan_week_horizon` (mig 0209, FH-27).
// Espejo de web/lib/coach/signal-thresholds.ts — una columna, un resolutor.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingColumn } from '@/lib/dashboard/db/pg-errors';
import {
  DEFAULT_PLAN_WEEK_HORIZON,
  LEGACY_PLAN_WEEK_HORIZON,
  maxWeekOffset,
  type PlanWeekHorizon,
} from '@fahybrid/shared/domain/coach/plan-week-horizon';
import type { CoachPlanWeekHorizonResponse } from '@fahybrid/shared/schema/coach-plan-week-horizon';

const COLUMN = 'plan_week_horizon';

interface HorizonRow {
  plan_week_horizon: PlanWeekHorizon;
  updated_at: string | null;
}

async function loadHorizonRow(
  coach_id: bigint | number,
  client: Sql,
): Promise<HorizonRow | null> {
  try {
    const rows = await client<HorizonRow[]>`
      select
        plan_week_horizon,
        updated_at::text as updated_at
      from coaches
      where id = ${coach_id}
      limit 1
    `;
    return rows[0] ?? null;
  } catch (err) {
    if (isPgMissingColumn(err, COLUMN)) {
      // Entorno sin migrar: comportamiento legacy (peek +1).
      return {
        plan_week_horizon: LEGACY_PLAN_WEEK_HORIZON,
        updated_at: null,
      };
    }
    throw err;
  }
}

/** Horizonte vigente del club. Nunca null — sin fila → defecto legacy en entornos viejos. */
export async function getCoachPlanWeekHorizon(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachPlanWeekHorizonResponse> {
  const row = await loadHorizonRow(coach_id, client);
  const horizon = row?.plan_week_horizon ?? DEFAULT_PLAN_WEEK_HORIZON;
  return {
    plan_week_horizon: horizon,
    max_week_offset: maxWeekOffset(horizon),
    updated_at: row?.updated_at ?? null,
  };
}

export async function updateCoachPlanWeekHorizon(
  coach_id: bigint | number,
  horizon: PlanWeekHorizon,
  client: Sql = defaultSql,
): Promise<CoachPlanWeekHorizonResponse> {
  const rows = await client<{ updated_at: string }[]>`
    update coaches
    set plan_week_horizon = ${horizon}
    where id = ${coach_id}
    returning updated_at::text as updated_at
  `;
  return {
    plan_week_horizon: horizon,
    max_week_offset: maxWeekOffset(horizon),
    updated_at: rows[0]?.updated_at ?? new Date().toISOString(),
  };
}
