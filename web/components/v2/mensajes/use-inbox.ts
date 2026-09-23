'use client';

// El estado de la bandeja en el navegador: la lista que llegó del servidor, lo
// que cambia al instante (un mensaje en vivo, un «hecho», abrir un hilo) y la
// relectura que después lo confirma. La verdad es siempre la del servidor: cada
// cambio local se reconcilia con `GET /api/coach/messages/threads`.

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import type { MensajesInbox, MensajesThread } from '@/lib/dashboard/v2/mensajes-types';

/** Espera antes de releer tras un mensaje en vivo (se agrupan ráfagas). */
const LIVE_REFRESH_MS = 1500;
/** Espera tras la última tecla antes de buscar. */
const SEARCH_DEBOUNCE_MS = 250;

export type InboxLoad =
  | { status: 'ready'; inbox: MensajesInbox }
  | { status: 'error'; message: string };

export function useInbox(initial: MensajesInbox | null, initialQ: string) {
  const [load, setLoad] = useState<InboxLoad>(() =>
    initial ? { status: 'ready', inbox: initial } : { status: 'error', message: 'No se han podido cargar los mensajes.' },
  );
  const [q, setQ] = useState(initialQ);
  const [search, setSearch] = useState<{ q: string; threads: MensajesThread[] | null; error: string | null } | null>(
    null,
  );
  const [searchNonce, setSearchNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  /** Relee la bandeja entera (sin búsqueda). */
  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    setRefreshing(true);
    try {
      const inbox = await apiJson<MensajesInbox>('/api/coach/messages/threads');
      if (mine === seq.current) setLoad({ status: 'ready', inbox });
    } catch (err) {
      // Un fallo de relectura no borra lo que ya se ve; solo sin nada es error.
      if (mine === seq.current) {
        setLoad((prev) =>
          prev.status === 'ready' ? prev : { status: 'error', message: errorMessage(err, 'No se han podido cargar los mensajes.') },
        );
      }
    } finally {
      if (mine === seq.current) setRefreshing(false);
    }
  }, []);

  // Si el servidor no pudo al pintar la página, se reintenta una vez al montar.
  const triedOnMount = useRef(false);
  useEffect(() => {
    if (initial || triedOnMount.current) return;
    triedOnMount.current = true;
    void (async () => {
      await refresh();
    })();
  }, [initial, refresh]);

  /** Relectura agrupada (mensajes en vivo). */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(), LIVE_REFRESH_MS);
  }, [refresh]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Búsqueda en el servidor (nombres y texto de TODOS los mensajes).
  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setSearch((prev) => ({ q: term, threads: prev?.q === term ? prev.threads : null, error: null }));
      apiJson<MensajesInbox>(`/api/coach/messages/threads?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((res) => setSearch({ q: term, threads: res.threads, error: null }))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setSearch({ q: term, threads: null, error: errorMessage(err, 'No se ha podido buscar.') });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, searchNonce]);

  /** Cambio local inmediato en un hilo (por atleta), en la bandeja y en la búsqueda. */
  const patch = useCallback((athleteId: string, fn: (t: MensajesThread) => MensajesThread) => {
    setLoad((prev) =>
      prev.status === 'ready'
        ? { ...prev, inbox: { ...prev.inbox, threads: prev.inbox.threads.map((t) => (t.athlete_id === athleteId ? fn(t) : t)) } }
        : prev,
    );
    setSearch((prev) =>
      prev?.threads ? { ...prev, threads: prev.threads.map((t) => (t.athlete_id === athleteId ? fn(t) : t)) } : prev,
    );
  }, []);

  const retrySearch = useCallback(() => setSearchNonce((n) => n + 1), []);

  return {
    load,
    refresh,
    refreshSoon,
    refreshing,
    patch,
    q,
    setQ,
    /** La búsqueda en curso (null = no se está buscando). */
    search: q.trim() ? search : null,
    retrySearch,
  };
}
