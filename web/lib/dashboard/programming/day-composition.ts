import type {
  WeekDay,
  WeekDayPart,
  WeekDayPartItem,
  WeekSession,
  WeekSlots,
} from '@fahybrid/shared/schema/program-templates';
import { normalizeWeekDay } from '@fahybrid/shared/schema/program-templates';
import {
  newBlockUid,
  type SessionIndex,
  type StudioSelection,
} from '@/lib/dashboard/programming/studio-types';

/** Bloques (parts) de una sesión concreta. */
export function blocksForSession(day: WeekDay, sessionIndex: SessionIndex): WeekDayPart[] {
  return day.sessions[sessionIndex]?.blocks ?? [];
}

/** ¿La sesión `sessionIndex` tiene al menos un bloque? */
export function sessionHasBlocks(day: WeekDay, sessionIndex: SessionIndex): boolean {
  return blocksForSession(day, sessionIndex).length > 0;
}

/** ¿El día tiene alguna sesión (no es 100% descanso)? */
export function dayHasAnySession(day: WeekDay): boolean {
  return day.sessions.length > 0;
}

/**
 * UX policy (Studio): por defecto se muestra session[0]. session[1] puede ser
 * "expandida" por el coach o aparecer automáticamente si ya tiene bloques.
 * Sesiones 3+ no se muestran en la UI actual; el modelo las soporta para
 * cuando rediseñemos la columna día en Fase 2.
 */
export function initialExpandedSessions(slots: WeekSlots): Set<number> {
  const expanded = new Set<number>();
  for (const day of slots.days) {
    if (day.sessions.length >= 2 && sessionHasBlocks(day, 1)) {
      expanded.add(day.day_of_week);
    }
  }
  return expanded;
}

/** ¿La segunda sesión es visible (porque tiene contenido o el coach la expandió)? */
export function isSecondSessionVisible(
  day: WeekDay,
  expanded: ReadonlySet<number>,
): boolean {
  return expanded.has(day.day_of_week) || sessionHasBlocks(day, 1) || day.sessions.length >= 2;
}

/** Permitir el botón "+ 2.º entreno" sólo si la sesión 2 aún no está visible. */
export function canAddSecondSession(
  day: WeekDay,
  expanded: ReadonlySet<number>,
): boolean {
  return !isSecondSessionVisible(day, expanded);
}

/** Índices de sesión visibles en el Studio (siempre 0; opcionalmente 1). */
export function visibleSessionIndices(
  day: WeekDay,
  expanded: ReadonlySet<number>,
): SessionIndex[] {
  if (isSecondSessionVisible(day, expanded)) return [0, 1];
  return [0];
}

export function daySubtitle(day: WeekDay, expanded: ReadonlySet<number>): string {
  if (day.focus) return day.focus;
  const primary = blocksForSession(day, 0).length;
  const secondary = blocksForSession(day, 1).length;
  if (primary === 0 && secondary === 0) return 'Descanso';
  if (primary > 0 && secondary > 0) return 'Doble sesión';
  if (isSecondSessionVisible(day, expanded) && secondary > 0 && primary === 0) {
    return '2.º entreno';
  }
  return primary > 0 ? `${primary} bloques` : 'Descanso';
}

/**
 * Sustituye los bloques de la sesión `sessionIndex`. Si la sesión no existe,
 * la crea (kind='workout', sin template_id). Si `blocks` queda vacío,
 * limpia el campo; el trimming elimina sesiones vacías al final.
 */
export function patchSessionBlocks(
  slots: WeekSlots,
  dayOfWeek: number,
  sessionIndex: SessionIndex,
  blocks: WeekDayPart[],
): WeekSlots {
  return {
    days: slots.days.map((day) => {
      if (day.day_of_week !== dayOfWeek) return day;
      const sessions = ensureSessionAt(day.sessions, sessionIndex);
      const next = sessions.map((session, idx) => {
        if (idx !== sessionIndex) return session;
        return blocks.length > 0
          ? { ...session, blocks }
          : { ...session, blocks: undefined };
      });
      return { ...day, sessions: trimTrailingEmptySessions(next) };
    }),
  };
}

function ensureSessionAt(sessions: WeekSession[], index: SessionIndex): WeekSession[] {
  if (index < sessions.length) return sessions;
  const out = [...sessions];
  while (out.length <= index) {
    out.push({ kind: 'workout', template_id: null });
  }
  return out;
}

function trimTrailingEmptySessions(sessions: WeekSession[]): WeekSession[] {
  const out = [...sessions];
  while (out.length > 0) {
    const last = out[out.length - 1]!;
    const empty =
      last.kind !== 'workout' ||
      ((!last.blocks || last.blocks.length === 0) && last.template_id == null);
    if (!empty) break;
    out.pop();
  }
  return out;
}

export function reorderPartsInSession(
  slots: WeekSlots,
  dayOfWeek: number,
  sessionIndex: SessionIndex,
  activeUid: string,
  overUid: string,
): WeekSlots | null {
  const day = slots.days.find((d) => d.day_of_week === dayOfWeek);
  if (!day) return null;
  const blocks = blocksForSession(day, sessionIndex);
  const from = blocks.findIndex((p) => p.uid === activeUid);
  const to = blocks.findIndex((p) => p.uid === overUid);
  if (from < 0 || to < 0 || from === to) return null;
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return patchSessionBlocks(slots, dayOfWeek, sessionIndex, next);
}

/**
 * Mueve un bloque de una sesión origen a otra sesión destino (puede ser de
 * otro día) — F13 "arrastrar y soltar bloques en cada día". Si `beforePartUid`
 * es null, lo añade al final del destino; si apunta a un bloque del destino,
 * lo inserta justo antes. No-op (devuelve null) si origen y destino coinciden
 * o si el bloque no existe.
 */
export function movePartBetweenSessions(
  slots: WeekSlots,
  from: { day_of_week: number; session_index: SessionIndex },
  to: { day_of_week: number; session_index: SessionIndex },
  partUid: string,
  beforePartUid: string | null,
): WeekSlots | null {
  const fromDay = slots.days.find((d) => d.day_of_week === from.day_of_week);
  if (!fromDay) return null;
  const fromBlocks = blocksForSession(fromDay, from.session_index);
  const moving = fromBlocks.find((p) => p.uid === partUid);
  if (!moving) return null;

  const sameSession =
    from.day_of_week === to.day_of_week && from.session_index === to.session_index;
  if (sameSession) {
    // Reordenar dentro de la misma sesión lo cubre reorderPartsInSession.
    if (!beforePartUid || beforePartUid === partUid) return null;
    return reorderPartsInSession(
      slots,
      from.day_of_week,
      from.session_index,
      partUid,
      beforePartUid,
    );
  }

  // 1. Quita el bloque de la sesión origen.
  let next = patchSessionBlocks(
    slots,
    from.day_of_week,
    from.session_index,
    fromBlocks.filter((p) => p.uid !== partUid),
  );

  // 2. Insértalo en la sesión destino, antes de `beforePartUid` o al final.
  const toDay = next.days.find((d) => d.day_of_week === to.day_of_week);
  const toBlocks = toDay ? blocksForSession(toDay, to.session_index) : [];
  const insertAt = beforePartUid
    ? Math.max(0, toBlocks.findIndex((p) => p.uid === beforePartUid))
    : toBlocks.length;
  const nextToBlocks = [...toBlocks];
  nextToBlocks.splice(insertAt < 0 ? toBlocks.length : insertAt, 0, moving);
  next = patchSessionBlocks(next, to.day_of_week, to.session_index, nextToBlocks);

  return next;
}

/** Clona una semana completa (todos los días/sesiones/bloques/ejercicios) con
 * uids nuevos. Base de "duplicar semana" (F12) — el destino queda independiente
 * del origen para selección/dnd/edición. */
export function cloneWeekSlotsWithNewUids(slots: WeekSlots): WeekSlots {
  return {
    days: slots.days.map((day) => ({
      ...day,
      sessions: day.sessions.map((session) => ({
        ...session,
        blocks: session.blocks?.map(clonePartWithNewUids),
      })),
    })),
  };
}

/** Clona un bloque generando uids nuevos (bloque + cada ejercicio) para no
 * colisionar con el original en selección/dnd. Conserva procedencia y
 * modificadores (el duplicado es un uso independiente del mismo bloque). */
export function clonePartWithNewUids(part: WeekDayPart): WeekDayPart {
  return {
    ...part,
    uid: newBlockUid(),
    items: part.items.map((item) => ({ ...item, uid: newBlockUid() })),
  };
}

/**
 * Duplica un bloque (F12). Inserta la copia justo después del original en la
 * misma sesión, o al final de la sesión destino si `to` apunta a otro día/sesión.
 * Devuelve los slots actualizados + el uid del nuevo bloque (para seleccionarlo).
 */
export function duplicatePart(
  slots: WeekSlots,
  from: { day_of_week: number; session_index: SessionIndex; part_uid: string },
  to?: { day_of_week: number; session_index: SessionIndex },
): { slots: WeekSlots; new_part_uid: string } | null {
  const fromDay = slots.days.find((d) => d.day_of_week === from.day_of_week);
  if (!fromDay) return null;
  const fromBlocks = blocksForSession(fromDay, from.session_index);
  const source = fromBlocks.find((p) => p.uid === from.part_uid);
  if (!source) return null;

  const copy = clonePartWithNewUids(source);
  const dest = to ?? { day_of_week: from.day_of_week, session_index: from.session_index };
  const sameSession =
    dest.day_of_week === from.day_of_week && dest.session_index === from.session_index;

  if (sameSession) {
    const idx = fromBlocks.findIndex((p) => p.uid === from.part_uid);
    const next = [...fromBlocks];
    next.splice(idx + 1, 0, copy); // justo después del original
    return {
      slots: patchSessionBlocks(slots, from.day_of_week, from.session_index, next),
      new_part_uid: copy.uid,
    };
  }

  const destDay = slots.days.find((d) => d.day_of_week === dest.day_of_week);
  const destBlocks = destDay ? blocksForSession(destDay, dest.session_index) : [];
  return {
    slots: patchSessionBlocks(slots, dest.day_of_week, dest.session_index, [
      ...destBlocks,
      copy,
    ]),
    new_part_uid: copy.uid,
  };
}

/** Clona una sesión completa con uids nuevos en todos sus bloques/ejercicios. */
function cloneSessionWithNewUids(session: WeekSession): WeekSession {
  return {
    ...session,
    blocks: session.blocks?.map(clonePartWithNewUids),
  };
}

/**
 * Duplica un día completo (F12) sobre otro día de la MISMA semana. Copia todas
 * las sesiones (con uids nuevos) al día destino, SUSTITUYENDO su contenido.
 * El foco/notas del día destino se reemplazan por los del origen. No-op si
 * origen == destino o si el día origen no existe.
 */
export function duplicateDay(
  slots: WeekSlots,
  fromDayOfWeek: number,
  toDayOfWeek: number,
): WeekSlots | null {
  if (fromDayOfWeek === toDayOfWeek) return null;
  const fromDay = slots.days.find((d) => d.day_of_week === fromDayOfWeek);
  if (!fromDay) return null;
  return {
    days: slots.days.map((day) => {
      if (day.day_of_week !== toDayOfWeek) return day;
      return {
        ...day,
        sessions: fromDay.sessions.map(cloneSessionWithNewUids),
        focus: fromDay.focus,
        notes: fromDay.notes,
      };
    }),
  };
}

export function reorderItemsInPart(
  slots: WeekSlots,
  dayOfWeek: number,
  sessionIndex: SessionIndex,
  partUid: string,
  activeUid: string,
  overUid: string,
): WeekSlots | null {
  const day = slots.days.find((d) => d.day_of_week === dayOfWeek);
  if (!day) return null;
  const blocks = blocksForSession(day, sessionIndex);
  let changed = false;
  const nextBlocks = blocks.map((part) => {
    if (part.uid !== partUid) return part;
    const from = part.items.findIndex((i) => i.uid === activeUid);
    const to = part.items.findIndex((i) => i.uid === overUid);
    if (from < 0 || to < 0 || from === to) return part;
    const items = [...part.items];
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved!);
    changed = true;
    return { ...part, items };
  });
  if (!changed) return null;
  return patchSessionBlocks(slots, dayOfWeek, sessionIndex, nextBlocks);
}

export function findPart(
  slots: WeekSlots,
  dayOfWeek: number,
  sessionIndex: SessionIndex,
  partUid: string,
): WeekDayPart | null {
  const day = slots.days.find((d) => d.day_of_week === dayOfWeek);
  if (!day) return null;
  return blocksForSession(day, sessionIndex).find((p) => p.uid === partUid) ?? null;
}

export function findItem(
  slots: WeekSlots,
  selection: Extract<StudioSelection, { target: 'item' }>,
): WeekDayPartItem | null {
  const part = findPart(slots, selection.day_of_week, selection.session_index, selection.part_uid);
  if (!part) return null;
  return part.items.find((i) => i.uid === selection.item_uid) ?? null;
}

/**
 * Normaliza slots al guardar/cargar: defensivamente convierte cualquier
 * shape legacy (am/pm/parts/pm_parts) al shape nuevo (sessions[]).
 */
export function hydrateSlotsForStudio(slots: WeekSlots): WeekSlots {
  return {
    days: slots.days.map((day) => normalizeWeekDay(day)),
  };
}
