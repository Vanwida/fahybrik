import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  getAthleteProgrammingStatus as _getAthleteProgrammingStatus,
  loadProgrammingStatusMap as _loadProgrammingStatusMap,
  type AthleteProgrammingStatus,
  type ProgrammingStatus,
} from '@fahybrid/shared/domain/coach/programming-status';

export type { AthleteProgrammingStatus, ProgrammingStatus };

export async function getAthleteProgrammingStatus(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<AthleteProgrammingStatus> {
  return _getAthleteProgrammingStatus({ ...params, client: params.client ?? defaultSql });
}

export async function loadProgrammingStatusMap(params: {
  athlete_ids: Array<number | bigint>;
  client?: Sql;
}): Promise<Map<string, AthleteProgrammingStatus>> {
  return _loadProgrammingStatusMap({
    athlete_ids: params.athlete_ids,
    client: params.client ?? defaultSql,
  });
}
