'use client';

// Dónde se montan los overlays (diálogos, menús, tooltips…). Tienen que caer
// DENTRO de `.v2-root`: los tokens --v2-* viven ahí, no en <body>. Se busca el
// `.v2-root` más cercano al elemento que abre el overlay (así un overlay dentro
// de la guía, que fuerza claro, sale en claro) y, si no hay ancla, el primero
// del documento.

import { useCallback, useRef } from 'react';

const ROOT = '.v2-root';

export function findPanelRoot(from?: Element | null): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return from?.closest<HTMLElement>(ROOT) ?? document.querySelector<HTMLElement>(ROOT);
}

/**
 * `anchor` va como ref del elemento que abre (o de un marcador invisible);
 * `container` se pasa al `Portal` de Base UI.
 */
export function usePanelPortal() {
  const container = useRef<HTMLElement | null>(null);
  const anchor = useCallback((el: Element | null) => {
    if (el) container.current = findPanelRoot(el);
  }, []);
  return { anchor, container };
}

/** Escalón único de apilado para todo lo que flota (por encima de los modales
 *  heredados, que llegan a z-80). Mismo z → gana el orden de apertura. */
export const OVERLAY_Z = 'z-[90]';
