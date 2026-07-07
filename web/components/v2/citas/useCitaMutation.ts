'use client';

// useCitaMutation — the single write path for the coach cita controls (lead detail
// block + the /leads pending card). One instance owns: the in-flight guard (`busy`),
// which button is spinning (`activeKey`), and the last error. On success it
// router.refresh()es so the server re-renders with the new appointment state; the
// caller passes a stable `key` per button so only the acted button shows the spinner.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CoachAppointmentAction } from '@fahybrid/shared/domain/citas/status';

type CitaRequest =
  | { kind: 'action'; id: string; action: CoachAppointmentAction }
  | { kind: 'meet-link'; id: string; meetLink: string };

const FALLBACK_ERROR = 'No se pudo completar la acción. Reintenta.';

export function useCitaMutation() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fetching, setFetching] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Busy spans the fetch AND the subsequent server refresh, so buttons stay disabled
  // (and the spinner keeps turning) until the new server state has painted.
  const busy = isPending || fetching;

  async function mutate(req: CitaRequest, key: string, onSuccess?: () => void): Promise<void> {
    if (busy) return;
    setError(null);
    setActiveKey(key);
    setFetching(true);

    const url =
      req.kind === 'action'
        ? `/api/coach/appointments/${req.id}`
        : `/api/coach/appointments/${req.id}/meet-link`;
    const method = req.kind === 'action' ? 'PATCH' : 'POST';
    const body = req.kind === 'action' ? { action: req.action } : { meet_link: req.meetLink };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let message = FALLBACK_ERROR;
        try {
          const parsed = (await res.json()) as { error?: { message?: string } };
          if (parsed?.error?.message) message = parsed.error.message;
        } catch {
          /* keep the fallback message */
        }
        setError(message);
        setFetching(false);
        setActiveKey(null);
        return;
      }
      onSuccess?.();
      // Keep `activeKey` set across the refresh — the button stays spinning + disabled
      // until the re-rendered server component replaces it (or removes the row).
      setFetching(false);
      startTransition(() => router.refresh());
    } catch {
      setError('Error de red. Reintenta.');
      setFetching(false);
      setActiveKey(null);
    }
  }

  return { mutate, busy, activeKey, error };
}
