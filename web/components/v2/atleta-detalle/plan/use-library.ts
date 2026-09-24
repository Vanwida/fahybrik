'use client';

// Los entrenos de la biblioteca del coach para elegir uno (añadir a un día,
// reemplazar un entreno). Se piden al abrir y se guardan mientras dura la página.

import { useEffect, useState } from 'react';
import { apiJson } from '@/components/v2/shared/api';

export interface LibraryRow {
  id: string;
  name: string;
  format: string | null;
  segment_count: number;
  is_draft: boolean;
}

let cache: LibraryRow[] | null = null;

export function useLibrary(open: boolean) {
  const [rows, setRows] = useState<LibraryRow[] | null>(cache);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open || rows) return;
    const ctrl = new AbortController();
    apiJson<{ templates: LibraryRow[] }>('/api/coach/templates', { signal: ctrl.signal })
      .then((res) => {
        cache = res.templates;
        setRows(res.templates);
        setError(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(true);
      });
    return () => ctrl.abort();
  }, [open, rows, attempt]);
  const options = (rows ?? []).map((r) => ({
    value: r.id,
    label: r.name,
    hint: r.segment_count === 0 ? 'sin ejercicios' : r.is_draft ? 'borrador' : undefined,
  }));
  return { rows, options, error, retry: () => setAttempt((a) => a + 1) };
}
