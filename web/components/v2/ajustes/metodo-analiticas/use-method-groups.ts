'use client';
import { useState, useSyncExternalStore, type SetStateAction } from 'react';
import type { CoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { GRUPOS, type GrupoId } from './descriptores';
import { gruposAbiertosAlInicio } from './modelo';

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

/** Un enlace a un grupo abre sus campos; después el coach puede plegarlo. */
export function useMethodGroups(method: CoachAnalyticsMethod, defaults: CoachAnalyticsMethod): [Set<GrupoId>, (action: SetStateAction<Set<GrupoId>>) => void] {
  const [manual, setManual] = useState(() => gruposAbiertosAlInicio(method, defaults));
  const [closedHash, setClosedHash] = useState<string | null>(null);
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  const group = GRUPOS.find((g) => `#am-grupo-${g.id}` === hash)?.id;
  const expanded = new Set(manual);
  if (group && hash !== closedHash) expanded.add(group);
  const change = (action: SetStateAction<Set<GrupoId>>) => {
    const next = typeof action === 'function' ? action(expanded) : action;
    if (group && !next.has(group)) setClosedHash(hash);
    setManual(next);
  };
  return [expanded, change];
}
