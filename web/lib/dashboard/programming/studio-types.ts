/**
 * Session index dentro de `day.sessions` (0..N-1). El Studio actual muestra
 * por defecto session[0] y opcionalmente session[1]; soporta N en el modelo
 * aunque la UX expone 2 visibles.
 */
export type SessionIndex = number;

export type StudioSelection =
  | {
      target: 'part';
      day_of_week: number;
      session_index: SessionIndex;
      part_uid: string;
    }
  | {
      target: 'item';
      day_of_week: number;
      session_index: SessionIndex;
      part_uid: string;
      item_uid: string;
    };

export function dragIdExercise(id: string) {
  return `exercise:${id}` as const;
}

export function sortIdPart(dayOfWeek: number, sessionIndex: SessionIndex, partUid: string) {
  return `sort-part:${dayOfWeek}:${sessionIndex}:${partUid}` as const;
}

export function sortIdItem(
  dayOfWeek: number,
  sessionIndex: SessionIndex,
  partUid: string,
  itemUid: string,
) {
  return `sort-item:${dayOfWeek}:${sessionIndex}:${partUid}:${itemUid}` as const;
}

export function dropIdPart(dayOfWeek: number, sessionIndex: SessionIndex, partUid: string) {
  return `part:${dayOfWeek}:${sessionIndex}:${partUid}` as const;
}

/**
 * Droppable a nivel sesión (no de un bloque concreto). Permite soltar un
 * bloque arrastrado en una sesión de OTRO día — incluido cuando la sesión
 * está vacía y no tiene bloques sobre los que soltar (F13).
 */
export function dropIdSession(dayOfWeek: number, sessionIndex: SessionIndex) {
  return `session:${dayOfWeek}:${sessionIndex}` as const;
}

export function parseSessionDropId(
  id: string,
): { day_of_week: number; session_index: SessionIndex } | null {
  const match = /^session:(\d):(\d+)$/.exec(id);
  if (!match) return null;
  const day = Number(match[1]);
  const session_index = Number(match[2]);
  if (day < 1 || day > 7 || !Number.isFinite(session_index)) return null;
  return { day_of_week: day, session_index };
}

export type ActiveDrag =
  | { kind: 'exercise'; id: string }
  | {
      kind: 'sort-part';
      day_of_week: number;
      session_index: SessionIndex;
      part_uid: string;
    }
  | {
      kind: 'sort-item';
      day_of_week: number;
      session_index: SessionIndex;
      part_uid: string;
      item_uid: string;
    };

export function parseActiveDrag(id: string): ActiveDrag | null {
  const exercise = parseDragId(id);
  if (exercise) return { kind: 'exercise', id: exercise.id };

  const partMatch = /^sort-part:(\d):(\d+):(.+)$/.exec(id);
  if (partMatch) {
    const day = Number(partMatch[1]);
    const session_index = Number(partMatch[2]);
    const part_uid = partMatch[3]!;
    if (day >= 1 && day <= 7 && Number.isFinite(session_index) && part_uid) {
      return { kind: 'sort-part', day_of_week: day, session_index, part_uid };
    }
  }

  const itemMatch = /^sort-item:(\d):(\d+):([^:]+):(.+)$/.exec(id);
  if (itemMatch) {
    const day = Number(itemMatch[1]);
    const session_index = Number(itemMatch[2]);
    const part_uid = itemMatch[3]!;
    const item_uid = itemMatch[4]!;
    if (day >= 1 && day <= 7 && Number.isFinite(session_index) && part_uid && item_uid) {
      return { kind: 'sort-item', day_of_week: day, session_index, part_uid, item_uid };
    }
  }

  return null;
}

export function parseDragId(id: string): { type: 'exercise'; id: string } | null {
  const [type, ...rest] = id.split(':');
  const value = rest.join(':');
  if (type === 'exercise' && value) {
    return { type: 'exercise', id: value };
  }
  return null;
}

export function parseDropId(
  id: string,
):
  | { type: 'part'; day_of_week: number; session_index: SessionIndex; part_uid: string }
  | null {
  const match = /^part:(\d):(\d+):(.+)$/.exec(id);
  if (!match) return null;
  const day = Number(match[1]);
  const session_index = Number(match[2]);
  const part_uid = match[3]!;
  if (day < 1 || day > 7 || !Number.isFinite(session_index) || !part_uid) return null;
  return { type: 'part', day_of_week: day, session_index, part_uid };
}

/** Resuelve drop de ejercicio aunque el pointer caiga sobre el sortable del bloque. */
export function resolveExerciseDropTarget(
  overId: string,
):
  | { type: 'part'; day_of_week: number; session_index: SessionIndex; part_uid: string }
  | null {
  const direct = parseDropId(overId);
  if (direct) return direct;

  const parsed = parseActiveDrag(overId);
  if (parsed?.kind === 'sort-part') {
    return {
      type: 'part',
      day_of_week: parsed.day_of_week,
      session_index: parsed.session_index,
      part_uid: parsed.part_uid,
    };
  }
  if (parsed?.kind === 'sort-item') {
    return {
      type: 'part',
      day_of_week: parsed.day_of_week,
      session_index: parsed.session_index,
      part_uid: parsed.part_uid,
    };
  }
  return null;
}

/**
 * Resuelve el destino de un bloque arrastrado (F13 — mover entre días). El
 * `over` puede ser otro bloque sortable (soltar junto a él) o la zona de
 * soltar de una sesión (día/sesión vacía o al final). Devuelve día+sesión
 * destino y, si aplica, el `part_uid` ante el que insertar.
 */
export function resolvePartDropTarget(
  overId: string,
):
  | { day_of_week: number; session_index: SessionIndex; before_part_uid: string | null }
  | null {
  const session = parseSessionDropId(overId);
  if (session) {
    return { ...session, before_part_uid: null };
  }
  const parsed = parseActiveDrag(overId);
  if (parsed?.kind === 'sort-part') {
    return {
      day_of_week: parsed.day_of_week,
      session_index: parsed.session_index,
      before_part_uid: parsed.part_uid,
    };
  }
  return null;
}

export function newBlockUid(): string {
  return crypto.randomUUID();
}

export function selectionKey(sel: StudioSelection): string {
  if (sel.target === 'part') {
    return `part:${sel.day_of_week}:${sel.session_index}:${sel.part_uid}`;
  }
  return `item:${sel.day_of_week}:${sel.session_index}:${sel.part_uid}:${sel.item_uid}`;
}
