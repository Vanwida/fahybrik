import { useCallback, useEffect, useRef, useState } from 'react';
import type { WeekSlots } from '@fahybrid/shared/schema/program-templates';

/** Límite del stack de historial (pasos de deshacer). Evita crecimiento ilimitado
 * en sesiones largas; 50 cubre de sobra una sesión de programación. */
const HISTORY_LIMIT = 50;

export interface EditHistoryState<T> {
  /** Empuja un nuevo estado al historial (tras una mutación). */
  push: (next: T) => void;
  /** Deshace el último cambio y devuelve el estado restaurado (o null si no hay). */
  undo: () => T | null;
  /** Rehace el último deshecho y devuelve el estado restaurado (o null si no hay). */
  redo: () => T | null;
  /** Reinicia el historial a un estado base (p.ej. al cambiar de semana). */
  reset: (base: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export type SlotsHistoryState = EditHistoryState<WeekSlots>;

/**
 * Historial undo/redo genérico de snapshots inmutables (F11).
 *
 * Modela un past/present/future. Cada mutación (`push`) descarta el `future`
 * (rama de redo) y mete el `present` anterior en `past`. `undo`/`redo`
 * devuelven el estado a aplicar; el caller lo aplica en su propio state y lo
 * trata como dirty para que el autosave persista el resultado.
 *
 * No guardamos el present aquí (lo posee el componente), solo el past/future,
 * para no duplicar la fuente de verdad. Lo usan el board del studio
 * (`WeekSlots`) y el drawer de sesión de la biblioteca (`WeekSession`).
 */
export function useEditHistory<T>(initial: T): EditHistoryState<T> {
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const presentRef = useRef<T>(initial);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const sync = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const push = useCallback(
    (next: T) => {
      if (next === presentRef.current) return;
      pastRef.current.push(presentRef.current);
      if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
      futureRef.current = [];
      presentRef.current = next;
      sync();
    },
    [sync],
  );

  const undo = useCallback((): T | null => {
    const prev = pastRef.current.pop();
    if (prev === undefined) return null;
    futureRef.current.push(presentRef.current);
    presentRef.current = prev;
    sync();
    return prev;
  }, [sync]);

  const redo = useCallback((): T | null => {
    const next = futureRef.current.pop();
    if (next === undefined) return null;
    pastRef.current.push(presentRef.current);
    presentRef.current = next;
    sync();
    return next;
  }, [sync]);

  const reset = useCallback(
    (base: T) => {
      pastRef.current = [];
      futureRef.current = [];
      presentRef.current = base;
      sync();
    },
    [sync],
  );

  return { push, undo, redo, reset, canUndo, canRedo };
}

/** Historial del board del studio — alias tipado del genérico. */
export function useSlotsHistory(initial: WeekSlots): SlotsHistoryState {
  return useEditHistory<WeekSlots>(initial);
}

interface UseUndoRedoShortcutsOptions {
  onUndo: () => void;
  onRedo: () => void;
  enabled?: boolean;
}

/**
 * Atajos de teclado del studio: Cmd/Ctrl+Z deshace, Cmd/Ctrl+Shift+Z (o
 * Cmd/Ctrl+Y) rehace. Ignora cuando el foco está en un campo de texto editable
 * para no pisar el undo nativo del input.
 */
export function useUndoRedoShortcuts({
  onUndo,
  onRedo,
  enabled = true,
}: UseUndoRedoShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;

      // No interferir con el undo nativo de inputs/textarea/contentEditable.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
      e.preventDefault();
      if (isRedo) onRedo();
      else onUndo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onUndo, onRedo]);
}
