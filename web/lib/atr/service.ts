// ATR service layer — app wrapper.
//
// The logic lives in @fahybrid/shared/domain/atr/service. This thin wrapper
// preserves the `server-only` guard and injects this app's `sql` client so the
// existing callers keep the `client?` optional ergonomics.

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql } from '@/lib/db';
import {
  computeMacrocycle as _computeMacrocycle,
  getCurrentBlock as _getCurrentBlock,
  getNextWorkout as _getNextWorkout,
  recommendAthleteTransition as _recommendAthleteTransition,
  type ComputeMacrocycleResult,
  type CurrentBlockResult,
  type NextWorkoutResult,
  type AthleteTransitionRecommendation,
} from '@fahybrid/shared/domain/atr/service';
import type { BlockSpec } from '@fahybrid/shared/domain/atr/planner';

export type {
  ComputeMacrocycleResult,
  CurrentBlockResult,
  NextWorkoutResult,
  AthleteTransitionRecommendation,
};

export {
  AtrError,
  evaluateTransition,
  planMacrocycle,
  findCurrentBlock,
  DEFAULT_BLOCK_SPECS,
} from '@fahybrid/shared/domain/atr/service';
export type { BlockSpec, PlannedMacrocycle } from '@fahybrid/shared/domain/atr/service';

export function computeMacrocycle(params: {
  athlete_id: number | bigint;
  target_event_id: number | bigint;
  block_specs?: ReadonlyArray<BlockSpec>;
  client?: Sql;
}): Promise<ComputeMacrocycleResult> {
  return _computeMacrocycle({ ...params, client: params.client ?? sql });
}

export function getCurrentBlock(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<CurrentBlockResult | null> {
  return _getCurrentBlock({ ...params, client: params.client ?? sql });
}

export function getNextWorkout(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<NextWorkoutResult> {
  return _getNextWorkout({ ...params, client: params.client ?? sql });
}

export function recommendAthleteTransition(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<AthleteTransitionRecommendation | null> {
  return _recommendAthleteTransition({ ...params, client: params.client ?? sql });
}
