import {
  type WeekSession,
  type WeekSlots,
} from '@fahybrid/shared/schema/program-templates';
import {
  emptyWeekSlots as _emptyWeekSlots,
  parseWeekSlotsRaw,
  templateIdKey as _templateIdKey,
} from '@fahybrid/shared/domain/coach/program-week-slots';

/** Client-safe — no DB imports. */
export function emptyWeekSlots(): WeekSlots {
  return _emptyWeekSlots();
}

/** API/DB wire format — template_id como number, exercise_id como number. */
function normalizeSession(session: WeekSession): WeekSession {
  if (session.kind !== 'workout') {
    return { ...session, kind: 'rest', template_id: null };
  }
  const blocks = session.blocks?.map((block) => ({
    ...block,
    items: block.items.map((item) => ({
      ...item,
      exercise_id: Number(item.exercise_id),
      params_json: item.params_json ?? {},
    })),
  }));
  return {
    ...session,
    kind: 'workout',
    template_id: session.template_id != null ? Number(session.template_id) : null,
    ...(blocks ? { blocks } : {}),
  };
}

export function normalizeWeekSlots(slots: WeekSlots): WeekSlots {
  return {
    days: slots.days.map((day) => ({
      ...day,
      sessions: day.sessions.map(normalizeSession),
    })),
  };
}

export function weekSlotsToJson(slots: WeekSlots): string {
  return JSON.stringify(normalizeWeekSlots(slots));
}

/**
 * Unwrap legacy double-encoded jsonb (string holding JSON text) y normaliza
 * shape legacy (am/pm/parts/pm_parts) → nuevo (sessions[]).
 */
export function parseWeekSlotsFromDb(raw: unknown): WeekSlots {
  return normalizeWeekSlots(parseWeekSlotsRaw(raw));
}

export function templateIdKey(id: string | number | bigint | null | undefined): string | null {
  return _templateIdKey(id);
}
