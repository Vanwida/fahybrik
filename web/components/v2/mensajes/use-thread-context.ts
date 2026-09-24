'use client';

// El contexto del hilo abierto: el vistazo del atleta (`fetchAthletePeek`, el
// mismo que Hoy y Atletas — mismo estado, misma adherencia, misma base de
// readiness). Se pide SOLO para el atleta del hilo abierto; nada de roster.

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAthletePeek } from '@/components/v2/shared/peek-action';
import type { AthletePeekData } from '@/lib/coach/athlete-peek';

export type ThreadContextLoad =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; data: AthletePeekData }
  | { state: 'error'; message: string; notFound: boolean };

export function useThreadContext(athleteId: string | null) {
  const [load, setLoad] = useState<ThreadContextLoad>({ state: 'idle' });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  const shownId = useRef<string | null>(null);

  useEffect(() => {
    if (!athleteId) return;
    const mine = ++seq.current;
    const sameAthlete = shownId.current === athleteId;
    void (async () => {
      // Otro atleta → esqueleto; el mismo (recarga tras una acción) → se queda lo que hay.
      if (!sameAthlete) setLoad({ state: 'loading' });
      try {
        const res = await fetchAthletePeek(athleteId);
        if (mine !== seq.current) return;
        shownId.current = athleteId;
        setLoad(
          res.ok
            ? { state: 'ready', data: res.data }
            : { state: 'error', message: res.message, notFound: res.code === 'not_found' },
        );
      } catch {
        if (mine !== seq.current) return;
        setLoad({ state: 'error', message: 'No se ha podido cargar el atleta.', notFound: false });
      }
    })();
  }, [athleteId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { load: athleteId ? load : ({ state: 'idle' } as const), reload };
}
