// Lo que «Asignar programa» (AssignSheet.tsx) carga al abrirse — los programas del
// coach y sus días de publicación automática — y las listas de sus dos elecciones.
// Aparte para que el panel quede en su flujo.

import { useEffect, useState } from 'react';
import type { OnConflict, WeekDelivery } from '@fahybrid/shared/schema/assign-many';
import type { AutoPublishSetting } from '@fahybrid/shared/schema/week-publishing';
import { apiJson, errorMessage } from './api';

export interface ProgramRow {
  id: string;
  name: string;
  level: string | null;
  week_count: number;
}

export const MONDAYS_AHEAD = 16;

export const DELIVERY_ITEMS: { value: WeekDelivery; label: string }[] = [
  { value: 'auto', label: 'Semana a semana' },
  { value: 'visible', label: 'Todo visible' },
  { value: 'draft', label: 'Todo oculto' },
];

export const CONFLICT_ITEMS: { value: OnConflict; label: string }[] = [
  { value: 'chain', label: 'Encadenar detrás' },
  { value: 'replace', label: 'Sustituir' },
  { value: 'skip', label: 'Saltar' },
];

export function useProgramsAndSetting(open: boolean) {
  const [programs, setPrograms] = useState<ProgramRow[] | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    Promise.all([
      apiJson<{ months: ProgramRow[] }>('/api/coach/program-months', { signal: ctrl.signal }),
      apiJson<AutoPublishSetting>('/api/coach/weeks/auto-publish', { signal: ctrl.signal }).catch(() => null),
    ])
      .then(([p, s]) => {
        setPrograms(p.months);
        setDays(s?.effective_days ?? null);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(errorMessage(err, 'No se han podido cargar tus programas'));
      });
    return () => ctrl.abort();
  }, [open, attempt]);
  return { programs, days, error, retry: () => setAttempt((a) => a + 1) };
}
