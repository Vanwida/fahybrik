import 'server-only';

import type { Sql } from '@/lib/db';
import { sql } from '@/lib/db';
import type { DailyTss, LoadSummary } from '@fahybrid/shared/domain/training-load';
import {
  getDailyTssSeries as _getDailyTssSeries,
  getLoadSummary as _getLoadSummary,
} from '@fahybrid/shared/domain/training-load';

export * from '@fahybrid/shared/domain/training-load/tss';
export * from '@fahybrid/shared/domain/training-load/banister';
export { computeAcr, computeLoadSeries } from '@fahybrid/shared/domain/training-load';

export function getDailyTssSeries(params: {
  athlete_id: number | bigint;
  end_date: Date;
  days: number;
  client?: Sql;
}): Promise<DailyTss[]> {
  return _getDailyTssSeries({ ...params, client: params.client ?? sql });
}

export function getLoadSummary(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<LoadSummary> {
  return _getLoadSummary({ ...params, client: params.client ?? sql });
}
