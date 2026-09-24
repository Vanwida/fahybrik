'use client';

// Comodidades por espectador (este navegador): el menú plegado y los recientes
// del ⌘K. localStorage puede faltar o lanzar (ventana privada, datos borrados):
// toda lectura y escritura va envuelta y el shell funciona igual sin él.

import { useCallback, useSyncExternalStore } from 'react';
import { RAIL_STORAGE_KEY } from './rail-config';

export const RECENTS_STORAGE_KEY = 'fahybrid:v2-recents';
const RECENTS_MAX = 6;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: vale para esta pestaña.
  }
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/** Menú lateral plegado a la tira de iconos. En servidor, desplegado. */
export function useRailCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(
    subscribe,
    () => read(RAIL_STORAGE_KEY) === 'collapsed',
    () => false,
  );
  const toggle = useCallback(() => {
    write(RAIL_STORAGE_KEY, read(RAIL_STORAGE_KEY) === 'collapsed' ? 'expanded' : 'collapsed');
  }, []);
  return [collapsed, toggle];
}

export type RecentKind = 'athlete' | 'program' | 'group' | 'library' | 'screen';

export interface RecentItem {
  kind: RecentKind;
  id: string;
  label: string;
  /** Línea corta a la derecha (nivel, «Programar»…). */
  meta: string | null;
  href: string;
  avatar_url?: string | null;
}

function parseRecents(raw: string | null): RecentItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is RecentItem =>
          !!r && typeof r === 'object' && typeof r.id === 'string' && typeof r.label === 'string' && typeof r.href === 'string',
      )
      .slice(0, RECENTS_MAX);
  } catch {
    return [];
  }
}

export function readRecents(): RecentItem[] {
  return parseRecents(read(RECENTS_STORAGE_KEY));
}

/** Lo último que se abrió va primero; sin duplicados. */
export function pushRecent(item: RecentItem): void {
  const next = [item, ...readRecents().filter((r) => !(r.kind === item.kind && r.id === item.id))].slice(0, RECENTS_MAX);
  write(RECENTS_STORAGE_KEY, JSON.stringify(next));
}
