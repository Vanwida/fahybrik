'use client';

// Teclado de Hoy (plan §6):
//   J / K        bajar / subir (el vistazo, si está abierto, sigue a la fila)
//   Shift+J / K  seleccionar en rango mientras se mueve
//   X            seleccionar la fila
//   E            hecho · H posponer (hasta nueva señal) · R responder
//   Enter        abrir el vistazo · ?  ver los atajos
// Las letras no actúan mientras se escribe, con un modificador, ni con un diálogo
// MODAL o un menú abierto. El vistazo (panel no modal) sí deja: J/K siguen.

import { useEffect, useRef } from 'react';
import { isTypingTarget } from '@/components/v2/shell/use-shell-shortcuts';

export interface HoyKeyHandlers {
  move: (delta: 1 | -1, extend: boolean) => void;
  toggle: () => void;
  done: () => void;
  snooze: () => void;
  reply: () => void;
  open: () => void;
  help: () => void;
}

/** ¿Hay algo encima que se lleva el teclado? (diálogo modal, menú, lista de opciones). */
function blockingOverlay(): boolean {
  return (
    document.querySelector(
      '[role="dialog"][data-open][aria-modal="true"], [role="alertdialog"][data-open], [role="menu"][data-open], [role="listbox"][data-open]',
    ) !== null
  );
}

/** Enter se lo queda el control enfocado (un botón, un enlace), salvo el cuerpo de una fila. */
function enterBelongsToControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target === document.body || target.id === 'contenido') return false;
  return target.closest('button, a, [role="button"], [role="menuitem"]') !== null;
}

export function useHoyKeys(handlers: HoyKeyHandlers, enabled = true): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target) || blockingOverlay()) return;
      const h = ref.current;
      if (e.key === '?') {
        e.preventDefault();
        h.help();
        return;
      }
      if (e.key === 'Enter') {
        if (enterBelongsToControl(e.target)) return;
        e.preventDefault();
        h.open();
        return;
      }
      if (e.repeat && !['j', 'k'].includes(e.key.toLowerCase())) return;
      switch (e.key.toLowerCase()) {
        case 'j':
          e.preventDefault();
          h.move(1, e.shiftKey);
          return;
        case 'k':
          e.preventDefault();
          h.move(-1, e.shiftKey);
          return;
        case 'x':
          if (e.shiftKey) return;
          e.preventDefault();
          h.toggle();
          return;
        case 'e':
          if (e.shiftKey) return;
          e.preventDefault();
          h.done();
          return;
        case 'h':
          if (e.shiftKey) return;
          e.preventDefault();
          h.snooze();
          return;
        case 'r':
          if (e.shiftKey) return;
          e.preventDefault();
          h.reply();
          return;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
