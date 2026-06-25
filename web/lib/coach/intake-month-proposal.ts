import 'server-only';

import type { Sql } from '@/lib/db';
import { sql } from '@/lib/db';
import {
  proposeFirstMonthForIntake as _proposeFirstMonthForIntake,
  type IntakeMonthProposal,
} from '@fahybrid/shared/domain/coach/intake-month-proposal';

export type { IntakeMonthProposal };

export function proposeFirstMonthForIntake(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  level_id: number | bigint;
  client?: Sql;
}): Promise<IntakeMonthProposal | null> {
  return _proposeFirstMonthForIntake({ ...params, client: params.client ?? sql });
}
