'use client';

// La tecla de los atajos según el sistema: «⌘C» en Mac, «Ctrl C» en el resto —
// como ya hace el buscador de la barra superior. En servidor, ⌘ (se corrige al
// hidratar sin parpadeo de layout: mismo ancho de Kbd).

import { useCallback, useSyncExternalStore } from 'react';

const subscribeNothing = () => () => {};

export function isMacPlatform(platform: string): boolean {
  return /Mac|iPhone|iPad/.test(platform);
}

/** Etiqueta de un atajo con modificador: modKey('C', true) → «⌘C»; (…, false) → «Ctrl C». */
export function modKey(key: string, mac: boolean): string {
  return mac ? `⌘${key}` : `Ctrl ${key}`;
}

export function useModKey(): (key: string) => string {
  const mac = useSyncExternalStore(
    subscribeNothing,
    () => isMacPlatform(navigator.platform || navigator.userAgent),
    () => true,
  );
  return useCallback((key: string) => modKey(key, mac), [mac]);
}
