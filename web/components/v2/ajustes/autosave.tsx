'use client';

// El único modelo de guardado de Ajustes: se guarda al salir del campo (o al
// elegir, en un desplegable), sin botón «Guardar». Cada campo lleva su estado
// —guardando, guardado, error con el porqué— al lado de su etiqueta, así que
// nunca hay dos formas de guardar en la misma página.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Resultado de un guardado: ok, o el mensaje que se le enseña al coach. */
export type SaveResult = { ok: true } | { ok: false; message: string };

/** Lee `{ error: { message } }` de una respuesta fallida, o usa el mensaje de reserva. */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string; details?: { issues?: Array<{ message?: string }> } };
    };
    return body?.error?.details?.issues?.[0]?.message ?? body?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** Envía JSON y lo traduce a SaveResult + el cuerpo de la respuesta si fue bien. */
export async function sendJson<T>(
  url: string,
  method: 'PATCH' | 'PUT' | 'POST' | 'DELETE',
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, message: await readApiError(res, 'No se ha podido guardar.') };
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, message: 'Sin conexión. No se ha guardado.' };
  }
}

/**
 * Estado de guardado de UN campo. `run(fn)` ejecuta el guardado y pinta el
 * resultado; «Guardado» se apaga solo a los pocos segundos. Un segundo `run`
 * mientras hay otro en vuelo espera su turno (nunca dos PATCH cruzados).
 */
export function useSaveState() {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const run = useCallback((fn: () => Promise<SaveResult>): Promise<boolean> => {
    const next = chain.current.then(async () => {
      if (timer.current) clearTimeout(timer.current);
      setState('saving');
      setError(null);
      const result = await fn();
      if (result.ok) {
        setState('saved');
        timer.current = setTimeout(() => setState('idle'), 2400);
        return true;
      }
      setState('error');
      setError(result.message);
      return false;
    });
    chain.current = next.catch(() => undefined);
    return next;
  }, []);

  return { state, error, run };
}

/** «Guardando…» / «Guardado» / el error, en una línea de 12 px. */
export function SaveStatus({ state, error, className }: { state: SaveState; error?: string | null; className?: string }) {
  return (
    <span aria-live="polite" className={cn('inline-flex min-h-4 items-center gap-1 t-meta', className)}>
      {state === 'saving' ? (
        <>
          <LoaderCircle aria-hidden className="size-3.5 animate-spin text-v2-faint" strokeWidth={2} />
          <span className="text-v2-faint">Guardando…</span>
        </>
      ) : state === 'saved' ? (
        <>
          <Check aria-hidden className="size-3.5 text-v2-ok" strokeWidth={2.25} />
          <span className="text-v2-ok">Guardado</span>
        </>
      ) : state === 'error' ? (
        <>
          <CircleAlert aria-hidden className="size-3.5 text-v2-danger" strokeWidth={2} />
          <span className="text-v2-danger">{error ?? 'No se ha podido guardar.'}</span>
        </>
      ) : null}
    </span>
  );
}
