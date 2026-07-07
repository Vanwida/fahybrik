import 'server-only';

import type { Sql } from '@/lib/db';
import { sql } from '@/lib/db';
import {
  computeAthleteDailyReadiness as _computeAthleteDailyReadiness,
  getLatestReadiness as _getLatestReadiness,
  getAthleteReadinessToday as _getAthleteReadinessToday,
  type ReadinessBreakdown,
  type ReadinessTrendPoint,
  type DailyReadinessSnapshot,
} from '@fahybrid/shared/domain/coach/athlete-daily-readiness';

export type { ReadinessBreakdown, ReadinessTrendPoint, DailyReadinessSnapshot };

export function computeAthleteDailyReadiness(params: {
  athlete_id: number | bigint;
  recorded_for: string;
  timezone?: string;
  client?: Sql;
}): Promise<DailyReadinessSnapshot | null> {
  return _computeAthleteDailyReadiness({ ...params, client: params.client ?? sql });
}

export function getLatestReadiness(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<DailyReadinessSnapshot | null> {
  return _getLatestReadiness({ ...params, client: params.client ?? sql });
}

/** Athlete-facing today reader: the Inicio snapshot + a 7-day trend + enriched
 *  raw breakdown values, for the readiness detail sheet. */
export function getAthleteReadinessToday(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<DailyReadinessSnapshot | null> {
  return _getAthleteReadinessToday({ ...params, client: params.client ?? sql });
}
