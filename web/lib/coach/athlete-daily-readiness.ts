import 'server-only';

import type { Sql } from '@/lib/db';
import { sql } from '@/lib/db';
import {
  computeAthleteDailyReadiness as _computeAthleteDailyReadiness,
  getLatestReadiness as _getLatestReadiness,
  getAthleteReadinessToday as _getAthleteReadinessToday,
  refreshAthleteReadinessToday as _refreshAthleteReadinessToday,
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

/** Athlete-facing today reader: computes today's snapshot fresh (fallback: the
 *  stored latest) + a 7-day trend, for the Inicio card and detail sheet. */
export function getAthleteReadinessToday(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<DailyReadinessSnapshot | null> {
  return _getAthleteReadinessToday({ ...params, client: params.client ?? sql });
}

/** Data-arrival hook (HealthKit batch / check-in ingest): recompute-and-persist
 *  today's snapshot so stored-snapshot readers see the data that just landed. */
export function refreshAthleteReadinessToday(params: {
  athlete_id: number | bigint;
  now?: Date;
  client?: Sql;
}): Promise<void> {
  return _refreshAthleteReadinessToday({ ...params, client: params.client ?? sql });
}
