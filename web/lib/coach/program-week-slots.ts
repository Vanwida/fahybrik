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

/** API/DB wire format — template_id always string or null (never BigInt). */
export function normalizeWeekSlots(slots: WeekSlots): WeekSlots {
  return {
    days: slots.days.map((day) => ({
      ...day,
      sessions: day.sessions.map(normalizeSession),
    })),
  };
}

function normalizeSession(session: WeekSession): WeekSession {
  if (session.kind !== 'workout') {
    return { ...session, kind: 'rest', template_id: null };
  }
  // Wire format en web/: template_id como string (BigInt no es JSON-serializable).
  // idSchema runtime coerciona string→bigint, pero el tipo TS no lo refleja.
  // Usamos el cast a unknown para puentear el desfase tipos↔runtime.
  return {
    ...session,
    kind: 'workout',
    template_id:
      session.template_id != null
        ? (String(session.template_id) as unknown as WeekSession['template_id'])
        : null,
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
