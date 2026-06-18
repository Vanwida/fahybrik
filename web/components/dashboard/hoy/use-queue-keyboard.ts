'use client';

// use-queue-keyboard — the power-user keyboard layer for the triage queue
// (SPEC §4/§9 "100% teclado"): J/K move focus, Shift+J/K extend a selection
// range as you move, Enter/O open the side panel, R resolve/approve, H snooze
// (preset menu), E/Backspace dismiss, X toggle select, ⌘A select all visible,
// Esc clear selection. It is deliberately decoupled from rendering: the queue
// passes the ordered item ids + a set of action callbacks, and the hook owns
// only the focused index + global key handling. Typing in inputs is ignored so
// the ⌘K palette and snooze menus keep working.

import { useCallback, useEffect, useState } from 'react';

export interface QueueKeyboardActions {
  /** Open the side panel for the focused item. */
  onOpen: (id: string) => void;
  /** Resolve / approve the focused item (with its own undo window). */
  onResolve: (id: string) => void;
  /** Snooze the focused item (opens its preset menu). */
  onSnooze: (id: string) => void;
  /** Dismiss the focused item. */
  onDismiss: (id: string) => void;
  /** Toggle the focused item's selection. */
  onToggleSelect: (id: string) => void;
  /** Add an id to the selection (range extend with Shift+J/K — idempotent). */
  onSelectId: (id: string) => void;
  /** Select every currently-visible id (⌘A). */
  onSelectAll: () => void;
  /** Clear the whole selection (Esc). */
  onClearSelection: () => void;
}

export interface QueueKeyboard {
  /** Id of the currently focused item, or null. */
  focusedId: string | null;
  /** Set focus programmatically (e.g. on hover / click). */
  setFocusedId: (id: string | null) => void;
}

/** True when the event target is an editable field — we must not hijack keys. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function useQueueKeyboard(
  /** Ordered item ids as currently rendered (CRÍTICO then VIGILAR). */
  orderedIds: ReadonlyArray<string>,
  actions: QueueKeyboardActions,
  /** Disable while a modal (⌘K) owns the keyboard. */
  enabled: boolean,
): QueueKeyboard {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const move = useCallback(
    (delta: number) => {
      setFocusedId((current) => {
        if (orderedIds.length === 0) return null;
        const idx = current ? orderedIds.indexOf(current) : -1;
        const next = Math.max(0, Math.min(orderedIds.length - 1, idx + delta));
        // From "nothing focused", J focuses the first, K the last.
        if (idx === -1) return delta > 0 ? orderedIds[0]! : orderedIds[orderedIds.length - 1]!;
        return orderedIds[next]!;
      });
    },
    [orderedIds],
  );

  // Move focus by `delta` AND add both the origin + destination to the
  // selection (Shift+J/K range select). Computed from the closure's focusedId so
  // the selection side-effects run OUTSIDE the setFocusedId updater (no setState
  // during another updater); selection grows by the ids the sweep crosses.
  const moveSelecting = useCallback(
    (delta: number) => {
      if (orderedIds.length === 0) return;
      const idx = focusedId ? orderedIds.indexOf(focusedId) : -1;
      const startId =
        idx === -1 ? (delta > 0 ? orderedIds[0]! : orderedIds[orderedIds.length - 1]!) : focusedId!;
      const nextIdx =
        idx === -1
          ? orderedIds.indexOf(startId)
          : Math.max(0, Math.min(orderedIds.length - 1, idx + delta));
      const nextId = orderedIds[nextIdx]!;
      actions.onSelectId(startId);
      actions.onSelectId(nextId);
      setFocusedId(nextId);
    },
    [orderedIds, focusedId, actions],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || e.altKey) return;

      const key = e.key;

      // ⌘A / Ctrl+A → select every visible id (don't select the page's text).
      if ((e.metaKey || e.ctrlKey) && (key === 'a' || key === 'A')) {
        e.preventDefault();
        actions.onSelectAll();
        return;
      }
      // No other meta/ctrl combos belong to the queue (⌘K is handled by the page).
      if (e.metaKey || e.ctrlKey) return;

      // Selection-clear works even with nothing focused.
      if (key === 'Escape') {
        actions.onClearSelection();
        return;
      }
      // Shift+J/K extend a selection range as focus moves.
      if (e.shiftKey && (key === 'J' || key === 'ArrowDown')) {
        e.preventDefault();
        moveSelecting(1);
        return;
      }
      if (e.shiftKey && (key === 'K' || key === 'ArrowUp')) {
        e.preventDefault();
        moveSelecting(-1);
        return;
      }
      if (key === 'j' || key === 'J' || key === 'ArrowDown') {
        e.preventDefault();
        move(1);
        return;
      }
      if (key === 'k' || key === 'K' || key === 'ArrowUp') {
        e.preventDefault();
        move(-1);
        return;
      }
      if (!focusedId) return;
      switch (key) {
        case 'Enter':
        case 'o':
        case 'O':
          e.preventDefault();
          actions.onOpen(focusedId);
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          actions.onResolve(focusedId);
          break;
        case 'h':
        case 'H':
          e.preventDefault();
          actions.onSnooze(focusedId);
          break;
        case 'e':
        case 'E':
        case 'Backspace':
          e.preventDefault();
          actions.onDismiss(focusedId);
          break;
        case 'x':
        case 'X':
          e.preventDefault();
          actions.onToggleSelect(focusedId);
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, focusedId, move, moveSelecting, actions]);

  // Keep focus valid as the list shrinks (resolved/snoozed items leave).
  // Derived during render (not via setState-in-effect) so the corrected focus is
  // used on the SAME render the list changes — avoids the cascading-render the
  // effect form triggers (react-hooks/set-state-in-effect).
  const effectiveFocusedId =
    focusedId && orderedIds.includes(focusedId) ? focusedId : (orderedIds[0] ?? null);

  return { focusedId: effectiveFocusedId, setFocusedId };
}
