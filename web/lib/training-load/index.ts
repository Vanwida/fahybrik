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
export * from '@fahybrid/shared/domain/training-load/coverage';
export * from '@fahybrid/shared/domain/training-load/intensity';
export {
  computeAcr,
  computeLoadSeries,
  CTL_WARMUP_DAYS,
} from '@fahybrid/shared/domain/training-load';

export function getDailyTssSeries(params: {
  athlete_id: number | bigint;
  end_date: Date;
  days: number;
  client?: Sql;
  /** Método del coach: pendiente a partir de la cual el ritmo deja de preciar. */
  gradient_retires_pace_pct?: number;
}): Promise<DailyTss[]> {
  return _getDailyTssSeries({ ...params, client: params.client ?? sql });
}

export function getLoadSummary(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  days?: number;
  client?: Sql;
  gradient_retires_pace_pct?: number;
}): Promise<LoadSummary> {
  return _getLoadSummary({ ...params, client: params.client ?? sql });
}
