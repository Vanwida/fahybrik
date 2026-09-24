'use client';

// Atajos globales del panel:
//   ⌘K / Ctrl+K   buscar (también dentro de un campo)
//   [             plegar / desplegar el menú lateral
//   C             «+ Nuevo»
//   G H · G A · G M · G P · G N   ir a Hoy, Atletas, Mensajes, Programar, Negocio
// Las letras solas no actúan mientras se escribe, con un modificador pulsado ni
// con un diálogo abierto (ahí mandan las teclas de ese diálogo).

import { useEffect, useRef } from 'react';
import { useRouter } from '@/i18n/navigation';
import { navForGoKey } from '@/components/v2/nav';

const GO_WINDOW_MS = 1200;

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(type);
  }
  return target.getAttribute('role') === 'combobox' || target.getAttribute('role') === 'textbox';
}

function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"][data-open], [role="menu"][data-open], [role="alertdialog"][data-open]') !== null;
}

export function useShellShortcuts({
  negocio,
  onPalette,
  onToggleRail,
  onNew,
}: {
  negocio: boolean;
  onPalette: () => void;
  onToggleRail: () => void;
  onNew: () => void;
}) {
  const router = useRouter();
  const goArmedAt = useRef(0);
  // Los manejadores se leen del ref: el listener se registra una sola vez.
  const handlers = useRef({ onPalette, onToggleRail, onNew, negocio, router });
  useEffect(() => {
    handlers.current = { onPalette, onToggleRail, onNew, negocio, router };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = handlers.current;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        h.onPalette();
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target) || overlayOpen()) return;

      const key = e.key.toLowerCase();
      const armed = Date.now() - goArmedAt.current < GO_WINDOW_MS;
      if (armed) {
        goArmedAt.current = 0;
        const item = navForGoKey(key, { negocio: h.negocio });
        if (item) {
          // Captura: la segunda tecla («G H») no llega a los atajos de la pantalla.
          e.preventDefault();
          e.stopPropagation();
          h.router.push(item.href);
        }
        return;
      }
      if (key === 'g' && !e.shiftKey) {
        goArmedAt.current = Date.now();
        return;
      }
      if (e.key === '[') {
        e.preventDefault();
        e.stopPropagation();
        h.onToggleRail();
        return;
      }
      if (key === 'c' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        h.onNew();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
