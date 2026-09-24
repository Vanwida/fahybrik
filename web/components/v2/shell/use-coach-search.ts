'use client';

// La parte con datos del ⌘K: GET /api/coach/search con espera corta entre
// teclas, cancelando la petición anterior. Estados distintos para «buscando»,
// «falló» y «sin nada»; mientras llega lo nuevo se queda lo anterior a la vista.

import { useCallback, useEffect, useState } from 'react';
import type { CoachSearchResults } from '@/lib/coach/search';

// Copia local: el módulo de búsqueda es de servidor (importa la base de datos).
const EMPTY_SEARCH: CoachSearchResults = { athletes: [], programs: [], groups: [], library: [] };

const DEBOUNCE_MS = 140;

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CoachSearchState {
  status: SearchStatus;
  /** Lo último que llegó (puede ser de una consulta anterior mientras carga). */
  data: CoachSearchResults;
  /** La consulta a la que corresponde `data`. */
  dataQuery: string;
  retry: () => void;
}

export function useCoachSearch(query: string, enabled: boolean): CoachSearchState {
  const q = query.trim();
  const [debounced, setDebounced] = useState(q);
  const [result, setResult] = useState<{ q: string; data: CoachSearchResults }>({ q: '', data: EMPTY_SEARCH });
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), q === '' ? 0 : DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!enabled || debounced === '') return;
    const ctrl = new AbortController();
    fetch(`/api/coach/search?q=${encodeURIComponent(debounced)}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as CoachSearchResults;
        setResult({ q: debounced, data });
        setFailed(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setFailed(debounced);
      });
    return () => ctrl.abort();
  }, [debounced, enabled, attempt]);

  const retry = useCallback(() => {
    setFailed(null);
    setAttempt((n) => n + 1);
  }, []);

  if (q === '') return { status: 'idle', data: EMPTY_SEARCH, dataQuery: '', retry };
  if (failed === q) return { status: 'error', data: EMPTY_SEARCH, dataQuery: '', retry };
  if (result.q === q) return { status: 'ready', data: result.data, dataQuery: q, retry };
  return { status: 'loading', data: result.data, dataQuery: result.q, retry };
}
