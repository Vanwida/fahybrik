import 'server-only';

import type { Sql } from '@/lib/db';
import { sql } from '@/lib/db';
import {
  computeAthleteDailyReadiness as _computeAthleteDailyReadiness,
  getLatestReadiness as _getLatestReadiness,
  type ReadinessBreakdown,
  type DailyReadinessSnapshot,
} from '@fahybrid/shared/domain/coach/athlete-daily-readiness';

export type { ReadinessBreakdown, DailyReadinessSnapshot };

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
