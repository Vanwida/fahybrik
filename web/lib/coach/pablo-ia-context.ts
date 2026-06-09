import 'server-only';

import type { Sql } from '@/lib/db';
import { sql } from '@/lib/db';
import {
  buildAthleteContextPack as _buildAthleteContextPack,
  type AthleteContextPack,
  type ProgressionVerdict,
} from '@fahybrid/shared/domain/coach/pablo-ia-context';

export type { AthleteContextPack, ProgressionVerdict };

export function buildAthleteContextPack(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<AthleteContextPack> {
  return _buildAthleteContextPack({ ...params, client: params.client ?? sql });
}

/** Alias for plan naming. */
export const buildPabloIaContextPack = buildAthleteContextPack;
