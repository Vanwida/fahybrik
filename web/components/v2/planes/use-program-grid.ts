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

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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

  // Cuando cambian las semanas (añadir / borrar / duplicar semana) el servidor
  // manda la rejilla nueva: se adopta si no hay nada pendiente de guardar.
  const signature = weekIds.join(',');
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
  const flushing = useRef(false);
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
        queue.current.shift();
      }
      setError(null);
      setStatus('saved');
    } finally {
      flushing.current = false;
    }
  }, [programId]);

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
      if (queue.current.length === 0) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const hasPending = useCallback(() => queue.current.length > 0, []);

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
    retry: flush,
    hasPending,
  };
}
