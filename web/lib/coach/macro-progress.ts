import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  buildMacroProgress as _buildMacroProgress,
  buildAthleteMacroSummary as _buildAthleteMacroSummary,
  loadMicrocycleDetail as _loadMicrocycleDetail,
  type MacroWeekStatus,
  type MacroProgressWeek,
  type MacroPhaseAssignment,
  type MacroBlockSpan,
  type MacroProgressPayload,
  type MicrocycleWeekDetail,
  type MicrocycleDetailPayload,
} from '@fahybrid/shared/domain/coach/macro-progress';

export type {
  MacroWeekStatus,
  MacroProgressWeek,
  MacroPhaseAssignment,
  MacroBlockSpan,
  MacroProgressPayload,
  MicrocycleWeekDetail,
  MicrocycleDetailPayload,
};

export function buildMacroProgress(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<MacroProgressPayload> {
  return _buildMacroProgress({ ...params, client: params.client ?? defaultSql });
}

export function loadMicrocycleDetail(params: {
  athlete_id: number | bigint;
  microcycle_id: number | bigint;
  client?: Sql;
}): Promise<MicrocycleDetailPayload | null> {
  return _loadMicrocycleDetail({ ...params, client: params.client ?? defaultSql });
}

export function buildAthleteMacroSummary(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): ReturnType<typeof _buildAthleteMacroSummary> {
  return _buildAthleteMacroSummary({ ...params, client: params.client ?? defaultSql });
}
