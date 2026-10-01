'use client';

// Estado de la rejilla del programa: las celdas, el deshacer/rehacer y el
// guardado automático por lotes. Toda escritura (tecleo, pegado, progresar,
// arrastre, deshacer) pasa por `commit`: se pinta al momento, se apila para
// deshacer y se encola para guardar. Los lotes salen de uno en uno y en orden;
// si uno falla se queda en la cola y el indicador dice «No se pudo guardar ·
// Reintentar» — nada se pierde, y cerrar la página con algo pendiente avisa.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import {
  applyWrites,
  effectiveWrites,
  gridFromWeeks,
  inverseWrites,
  type CellWrite,
} from '@/lib/dashboard/programming/grid-model';
import { emptyHistory, record, redo as redoHistory, undo as undoHistory, type GridHistory } from '@/lib/dashboard/programming/grid-history';
import type { ProgramDelivery } from '@/lib/dashboard/programming/program-delivery';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'delivery';

export interface GridWeek {
  id: string;
  focus: string | null;
  days: WeekDay[];
}

interface Pending {
  cells: Array<{ week_id: string; day_of_week: number; day: WeekDay }>;
}

export function useProgramGrid(programId: string, weeks: GridWeek[]) {
  const weekIds = useMemo(() => weeks.map((w) => w.id), [weeks]);
  const [grid, setGrid] = useState<WeekDay[][]>(() => gridFromWeeks(weeks));
  // Las refs son la verdad para los manejadores (varias escrituras seguidas en
  // el mismo tick); el estado, para pintar. Se actualizan juntas, siempre.
  const gridRef = useRef(grid);
  const [history, setHistory] = useState<GridHistory>(emptyHistory);
  const historyRef = useRef(history);
  const setHistoryBoth = useCallback((h: GridHistory) => {
    historyRef.current = h;
    setHistory(h);
  }, []);

  // Cuando el servidor manda otra rejilla (añadir / quitar semana, una
  // importación) se adopta si no hay nada pendiente de guardar. Las ediciones
  // propias no recargan la página, así que no llegan por aquí.
  const signature = useMemo(() => JSON.stringify(weeks), [weeks]);
  const lastSignature = useRef(signature);
  const queue = useRef<Pending[]>([]);
  useEffect(() => {
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    if (queue.current.length === 0) {
      const fresh = gridFromWeeks(weeks);
      gridRef.current = fresh;
      setGrid(fresh);
      setHistoryBoth(emptyHistory);
    }
  }, [signature, weeks, setHistoryBoth]);

  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<ProgramDelivery | null>(null);
  const pendingWeeks = useRef(new Set<string>());
  const incompleteWeeks = useRef(new Set<string>());
  const storageKey = `fahybrid:program-delivery:${programId}`;
  useEffect(() => {
    // El regreso al editor también recupera una entrega pendiente; el contenido
    // de la plantilla ya está guardado y no hay que volver a escribirlo.
    let mounted = true;
    void Promise.resolve().then(() => {
      if (!mounted) return;
      try {
        const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
        if (!Array.isArray(saved)) return;
        const ids = saved.filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id));
        ids.forEach((id) => pendingWeeks.current.add(id));
        if (pendingWeeks.current.size === 0) return;
        setDelivery({ status: 'partial', updated_athletes: 0, failed_athlete_ids: [], pending_week_ids: [...pendingWeeks.current], incomplete_week_ids: [] });
        setStatus('delivery');
      } catch { /* El navegador puede desactivar el almacenamiento local. */ }
    });
    return () => { mounted = false; };
  }, [storageKey]);
  const rememberDelivery = useCallback((result: ProgramDelivery, retried?: string[]) => {
    retried?.forEach((id) => pendingWeeks.current.delete(id));
    retried?.forEach((id) => incompleteWeeks.current.delete(id));
    result.pending_week_ids.forEach((id) => pendingWeeks.current.add(id));
    result.incomplete_week_ids.forEach((id) => incompleteWeeks.current.add(id));
    setDelivery({ ...result, status: pendingWeeks.current.size ? 'partial' : 'complete', pending_week_ids: [...pendingWeeks.current], incomplete_week_ids: [...incompleteWeeks.current] });
    try {
      if (pendingWeeks.current.size) window.localStorage.setItem(storageKey, JSON.stringify([...pendingWeeks.current]));
      else window.localStorage.removeItem(storageKey);
    } catch { /* El aviso y el reintento siguen funcionando sin almacenamiento. */ }
  }, [storageKey]);
  const flushing = useRef(false);
  const waiters = useRef<Array<() => void>>([]);
  const awaitIdle = useCallback(async () => {
    while (flushing.current) await new Promise<void>((resolve) => waiters.current.push(resolve));
  }, []);
  const releaseWaiters = useCallback(() => {
    flushing.current = false;
    const waiting = waiters.current.splice(0);
    waiting.forEach((resolve) => resolve());
  }, []);
  const idsRef = useRef(weekIds);
  useEffect(() => {
    idsRef.current = weekIds;
  }, [weekIds]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    setStatus('saving');
    try {
      while (queue.current.length > 0) {
        const batch = queue.current[0]!;
        const res = await fetch(`/api/coach/program-months/${programId}/cells`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(batch),
        }).catch(() => null);
        if (!res || !res.ok) {
          const body = res ? ((await res.json().catch(() => null)) as { error?: { message?: string } } | null) : null;
          setError(body?.error?.message ?? 'Sin conexión.');
          setStatus('error');
          return;
        }
        const saved = (await res.json()) as { delivery: ProgramDelivery };
        rememberDelivery(saved.delivery, batch.cells.map((cell) => cell.week_id));
        queue.current.shift();
      }
      setError(null);
      setStatus(pendingWeeks.current.size ? 'delivery' : 'saved');
    } catch {
      setError('No se ha podido confirmar el guardado. Reintenta antes de salir.');
      setStatus('error');
    } finally {
      releaseWaiters();
    }
  }, [programId, rememberDelivery, releaseWaiters]);

  const retry = useCallback(async () => {
    if (queue.current.length > 0) return flush();
    if (flushing.current || pendingWeeks.current.size === 0) return;
    const ids = [...pendingWeeks.current];
    flushing.current = true;
    setStatus('saving');
    try {
      const res = await fetch(`/api/coach/program-months/${programId}/delivery`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ week_ids: ids }),
      });
      const body = await res.json().catch(() => null) as { delivery?: ProgramDelivery; error?: { message?: string } } | null;
      if (!res.ok || !body?.delivery) throw new Error(body?.error?.message ?? 'No se pudo actualizar el plan del atleta.');
      rememberDelivery(body.delivery, ids);
      setError(null);
      setStatus(pendingWeeks.current.size ? 'delivery' : 'saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sin conexión.');
      setStatus('delivery');
    } finally {
      releaseWaiters();
      if (queue.current.length) void flush();
    }
  }, [flush, programId, rememberDelivery, releaseWaiters]);

  const settle = useCallback(async (): Promise<boolean> => {
    await awaitIdle();
    if (queue.current.length) await flush();
    await awaitIdle();
    if (queue.current.length) return false;
    if (pendingWeeks.current.size) await retry();
    await awaitIdle();
    return queue.current.length === 0 && pendingWeeks.current.size === 0;
  }, [awaitIdle, flush, retry]);

  const enqueue = useCallback(
    (writes: CellWrite[]) => {
      const cells = writes
        .filter((w) => idsRef.current[w.row] != null)
        .map((w) => ({ week_id: idsRef.current[w.row]!, day_of_week: w.col + 1, day: w.day }));
      if (cells.length === 0) return;
      // Lotes grandes (pegar 12 semanas) en trozos que el servidor acepta.
      for (let i = 0; i < cells.length; i += 7 * 26) queue.current.push({ cells: cells.slice(i, i + 7 * 26) });
      void flush();
    },
    [flush],
  );

  /** Aplica, apila para deshacer y guarda. Devuelve cuántas celdas cambiaron. */
  const commit = useCallback(
    (writes: CellWrite[], label: string): number => {
      const eff = effectiveWrites(gridRef.current, writes);
      if (eff.length === 0) return 0;
      const before = inverseWrites(gridRef.current, eff);
      const next = applyWrites(gridRef.current, eff);
      gridRef.current = next;
      setGrid(next);
      setHistoryBoth(record(historyRef.current, { label, before, after: eff }));
      enqueue(eff);
      return eff.length;
    },
    [enqueue, setHistoryBoth],
  );

  const replay = useCallback(
    (writes: CellWrite[]) => {
      const next = applyWrites(gridRef.current, writes);
      gridRef.current = next;
      setGrid(next);
      enqueue(writes);
    },
    [enqueue],
  );

  const undo = useCallback((): string | null => {
    const r = undoHistory(historyRef.current);
    if (!r) return null;
    setHistoryBoth(r.history);
    replay(r.writes);
    return r.entry.label;
  }, [replay, setHistoryBoth]);

  const redo = useCallback((): string | null => {
    const r = redoHistory(historyRef.current);
    if (!r) return null;
    setHistoryBoth(r.history);
    replay(r.writes);
    return r.entry.label;
  }, [replay, setHistoryBoth]);

  // Nada se pierde al irse: con algo pendiente, el navegador pregunta.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (queue.current.length === 0 && pendingWeeks.current.size === 0) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const hasPending = useCallback(() => queue.current.length > 0 || pendingWeeks.current.size > 0, []);

  return {
    grid,
    gridRef,
    commit,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    status,
    error,
    delivery,
    retry,
    settle,
    hasPending,
  };
}
