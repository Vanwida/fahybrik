'use client';

// Estado del calendario de la ficha en el cliente: el zoom, la recarga tras cada
// cambio del plan (calendarVersion) y los cambios optimistas con su «Deshacer».
// Mover usa el endpoint de reprogramar que ya existía (0 llamadas desde la UI
// hasta ahora, P2); añadir usa el de crear entreno de un día (P3).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/v2/ui';
import { apiJson, errorMessage, PanelApiError } from '@/components/v2/shared/api';
import type { CalZoom, FichaCalendar } from '@/lib/dashboard/v2/atleta-detalle-types';
import { findSession, moveSession, removeSession } from '@/lib/dashboard/v2/ficha-calendar-model';
import { dayLabel } from '@/lib/dashboard/v2/ficha-dates';
import { useFicha } from '../FichaContext';

/** El mensaje del servidor para «ese día no tiene programa» habla de microciclos. */
export function planErrorMessage(err: unknown, fallback?: string): string {
  if (err instanceof PanelApiError && err.code === 'no_microcycle') {
    return 'Ese día no tiene programa asignado. Asigna un programa que lo cubra.';
  }
  if (err instanceof PanelApiError && err.code === 'no_templates') {
    return 'Tu biblioteca no tiene entrenos todavía.';
  }
  return errorMessage(err, fallback);
}

export function useCalendar(initial: FichaCalendar | null) {
  const { shell, calendarVersion, refresh } = useFicha();
  const { toast } = useToast();
  const search = useSearchParams();
  const [cal, setCal] = useState<FichaCalendar | null>(initial);
  const [zoom, setZoomState] = useState<CalZoom>(initial?.zoom ?? '3sem');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initial ? null : 'No se ha podido cargar el calendario');
  const first = useRef(true);
  const base = `/api/coach/athletes/${shell.athlete_id}`;

  const load = useCallback(
    async (z: CalZoom, signal?: AbortSignal) => {
      setLoading(true);
      try {
        const res = await apiJson<{ calendar: FichaCalendar }>(`${base}/plan/calendar?zoom=${z}`, { signal });
        setCal(res.calendar);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(errorMessage(err, 'No se ha podido cargar el calendario'));
      } finally {
        setLoading(false);
      }
    },
    [base],
  );

  // Recarga tras un cambio del plan hecho en otro sitio (panel, semana, cabecera).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const ctrl = new AbortController();
    void load(zoom, ctrl.signal);
    return () => ctrl.abort();
    // Solo cuando cambia la versión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarVersion]);

  const setZoom = (z: CalZoom) => {
    setZoomState(z);
    const p = new URLSearchParams(search.toString());
    if (z === '3sem') p.delete('zoom');
    else p.set('zoom', z);
    const qs = p.toString();
    // Solo la URL: el calendario se pide aquí mismo, sin repintar la página.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    void load(z);
  };

  const retry = () => void load(zoom);

  /** Mover un entreno a otro día: optimista, con «Deshacer» (lo devuelve a su día). */
  const move = async (id: string, toDate: string) => {
    if (!cal) return;
    const s = findSession(cal, id);
    if (!s || s.date === toDate) return;
    const from = s.date;
    const before = cal;
    setCal(moveSession(cal, id, toDate));
    try {
      await apiJson(`${base}/sessions/${id}/reschedule`, { method: 'POST', body: { to_iso_date: toDate } });
      toast({
        title: `${s.title} → ${dayLabel(toDate)}`,
        undo: async () => {
          setCal((c) => (c ? moveSession(c, id, from) : c));
          try {
            await apiJson(`${base}/sessions/${id}/reschedule`, { method: 'POST', body: { to_iso_date: from } });
            refresh();
          } catch (err) {
            toast({ title: 'No se ha podido deshacer', description: errorMessage(err), tone: 'danger' });
            void load(zoom);
          }
        },
      });
      refresh();
    } catch (err) {
      setCal(before);
      toast({ title: 'No se ha podido mover', description: errorMessage(err), tone: 'danger' });
    }
  };

  /** Quitar un entreno (ya confirmado). No tiene «Deshacer»: borra su copia. */
  const remove = async (id: string) => {
    if (!cal) return false;
    const s = findSession(cal, id);
    if (!s) return false;
    const before = cal;
    setCal(removeSession(cal, id));
    try {
      await apiJson(`${base}/plan/day/${s.date}`, { method: 'PATCH', body: { kind: 'rest', assignment_id: Number(id) } });
      toast({ title: `${s.title} quitado del ${dayLabel(s.date)}`, tone: 'neutral' });
      refresh();
      return true;
    } catch (err) {
      setCal(before);
      toast({ title: 'No se ha podido quitar', description: errorMessage(err), tone: 'danger' });
      return false;
    }
  };

  return { cal, zoom, setZoom, loading, error, retry, reload: () => load(zoom), move, remove };
}
