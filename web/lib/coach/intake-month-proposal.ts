import 'server-only';

import type { Sql } from '@/lib/db';
import { sql } from '@/lib/db';
import { parseIsoDate } from '@fahybrid/shared/domain/dates';
import {
  proposeFirstMonthForIntake as _proposeFirstMonthForIntake,
  type IntakeMonthProposal,
} from '@fahybrid/shared/domain/coach/intake-month-proposal';
import { loadCoachToday } from '@/lib/coach/coach-timezone';

export type { IntakeMonthProposal };

/** When the first plan starts is the COACH's decision: «this week» is the
 *  club's week (docs/DECISIONS.md 2026-09-23, «Qué día es en cada sitio»). */
export async function proposeFirstMonthForIntake(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  level_id: number | bigint;
  client?: Sql;
}): Promise<IntakeMonthProposal | null> {
  const client = params.client ?? sql;
  const on_date = parseIsoDate(await loadCoachToday(params.coach_id, { client }));
  return _proposeFirstMonthForIntake({ ...params, on_date, client });
}
