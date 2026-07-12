import 'server-only';

// Coach "consejos" — the read/write data layer behind coach_guidance (mig 0123).
//
// A coach owns an ordered list of tactical tips PER context (the doubles race
// board, the doubles simulation). Until they author their own, every surface
// serves the SYSTEM DEFAULTS (shared/domain/coach-guidance — agnostic, no brand).
// This module is the single resolver so the athlete reads (race-gap, simulation)
// and the coach editor never diverge on "coach row else defaults".

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  defaultCoachTips,
  type CoachGuidanceContext,
} from '@fahybrid/shared/domain/coach-guidance';
import type { CoachGuidanceResponse } from '@fahybrid/shared/schema/coach-guidance';

interface GuidanceRow {
  items: string[];
  updated_at: string;
}

/**
 * The coach's authored tips for a context, or null when they have none. The row
 * is coach-owned (unique per coach+context). A coach_id of null (no coach in
 * scope) always resolves to defaults without a query.
 */
async function loadCoachGuidanceRow(
  coach_id: bigint | number | null,
  context: CoachGuidanceContext,
  client: Sql,
): Promise<GuidanceRow | null> {
  if (coach_id == null) return null;
  const rows = await client<GuidanceRow[]>`
    select items, updated_at::text as updated_at
    from coach_guidance
    where coach_id = ${coach_id} and context = ${context}
    limit 1
  `;
  return rows[0] ?? null;
}

/**
 * The resolved tips for a context: the coach's own list when present (and
 * non-empty), else the system defaults. The single read used by the athlete
 * surfaces (race-gap board, simulation) — they only need the strings.
 */
export async function resolveCoachTips(
  coach_id: bigint | number | null,
  context: CoachGuidanceContext,
  client: Sql = defaultSql,
): Promise<string[]> {
  const row = await loadCoachGuidanceRow(coach_id, context, client);
  if (row && row.items.length > 0) return row.items;
  return defaultCoachTips(context);
}

/**
 * The coach editor GET: the resolved tips + whether they are the coach's own edit
 * or the system defaults (so the editor can say "usando los del sistema").
 */
export async function getCoachGuidance(
  coach_id: bigint | number,
  context: CoachGuidanceContext,
  client: Sql = defaultSql,
): Promise<CoachGuidanceResponse> {
  const row = await loadCoachGuidanceRow(coach_id, context, client);
  if (row && row.items.length > 0) {
    return { context, items: row.items, is_custom: true, updated_at: row.updated_at };
  }
  return { context, items: defaultCoachTips(context), is_custom: false, updated_at: null };
}

/**
 * The coach editor PUT: upsert the coach's tips for a context (the whole list is
 * replaced — order is meaningful). `items` is already validated by the route's
 * Zod schema (1..8 trimmed, non-empty, bounded). Returns the fresh response.
 */
export async function upsertCoachGuidance(
  coach_id: bigint | number,
  context: CoachGuidanceContext,
  items: string[],
  client: Sql = defaultSql,
): Promise<CoachGuidanceResponse> {
  const rows = await client<{ updated_at: string }[]>`
    insert into coach_guidance (coach_id, context, items, updated_at)
    values (${coach_id}, ${context}, ${items as unknown as string[]}, now())
    on conflict (coach_id, context) do update set
      items = excluded.items,
      updated_at = now()
    returning updated_at::text as updated_at
  `;
  return { context, items, is_custom: true, updated_at: rows[0]?.updated_at ?? new Date().toISOString() };
}
