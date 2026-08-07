// day-editor-io — el cable del editor de día: serialización a wire + las dos
// llamadas (guardar día, copiar día). Extraído de DayEditor.tsx en el rediseño
// para mantener el orquestador bajo el techo de 500 líneas; la semántica es la
// MISMA de siempre (PUT /api/coach/program-weeks/[id]/day + /day/copy).

import type { EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { RecoverySuggestion } from '@fahybrid/shared/schema/program-templates';

// Estado honesto del guardado — sin temporizadores falsos: el botón refleja el
// estado real de la petición.
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export const SAVE_LABEL: Record<SaveState, string> = {
  idle: 'Guardar día',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'Reintentar',
};

export const SAVE_ICON: Record<SaveState, string> = {
  idle: 'save',
  saving: 'progress_activity',
  saved: 'check_circle',
  error: 'error',
};

// Wire shape de las sesiones de un día — compartida por «Guardar día» y «Copiar
// día a…» para que ambos manden el MISMO payload estructurado. Una sola fuente,
// sin deriva entre las dos llamadas.
export function sessionsToWire(sessions: EditorSession[]) {
  return sessions.map((s) => ({
    uid: s.uid,
    slot: s.slot,
    ...(s.focus && s.focus.trim() ? { focus: s.focus.trim() } : {}),
    blocks: s.blocks.map((b) => ({
      uid: b.uid,
      title: b.title,
      format: b.format,
      methodology_group_id: b.methodology_group_id ?? null,
      source_block_id: b.source_block_id ?? null,
      items: b.items.map((it) => ({
        uid: it.uid,
        exercise_id: it.exercise_id,
        exercise_name: it.exercise_name,
        prescription: it.prescription,
        ...(it.notes ? { notes: it.notes } : {}),
      })),
    })),
  }));
}

// Wire shape de las sugerencias de recuperación de un día de descanso — descarta
// duración/nota vacías (el servidor revalida con Zod).
export function recoveryToWire(recovery: RecoverySuggestion[]) {
  return recovery.map((r) => ({
    activity: r.activity,
    ...(r.duration_min ? { duration_min: r.duration_min } : {}),
    ...(r.note && r.note.trim() ? { note: r.note.trim() } : {}),
  }));
}

/** PUT del día editado. El route carga la semana entera, funde este día y hace
 *  upsert (ver serializeDay en editor-serialize.ts). true = guardado. */
export async function putDay(weekId: string, payload: unknown): Promise<boolean> {
  const res = await fetch(`/api/coach/program-weeks/${weekId}/day`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

/** PUT de la copia de día. 'conflict' = el destino tiene contenido y el coach
 *  aún no confirmó sobrescribir (el modal pregunta). */
export async function putDayCopy(
  weekId: string,
  payload: unknown,
): Promise<'ok' | 'conflict' | 'error'> {
  const res = await fetch(`/api/coach/program-weeks/${weekId}/day/copy`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 409) return 'conflict';
  return res.ok ? 'ok' : 'error';
}
