'use client';

// Shared client mutation for the athlete lifecycle (#13). Both the header action
// control and the pending-request banner PATCH /api/coach/athletes/[id]/lifecycle
// (pause | resume | baja | re_alta) or POST …/pause-request/resolve (confirm | decline),
// then router.refresh() so the server re-renders the ficha with the new state. Error
// messages surface the backend's honest reason (LifecycleError.message) when present.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LifecycleActionKind } from '@/lib/dashboard/v2/lifecycle-actions';

export interface LifecycleMutationBody {
  action: LifecycleActionKind;
  reason?: string;
  note?: string;
  end_date?: string;
}

export interface LifecycleMutationResult {
  status: string;
  /** re_alta only: true when reactivating pushed the roster over the coach's cap. */
  over_capacity?: boolean;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function useLifecycleMutation(athleteId: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = fetching || isPending;

  /** Run a lifecycle transition. On success returns the result and refreshes the ficha;
   *  on failure sets `error` and returns null (the caller keeps its dialog open). */
  async function mutate(body: LifecycleMutationBody): Promise<LifecycleMutationResult | null> {
    if (busy) return null;
    setError(null);
    setFetching(true);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/lifecycle`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await readError(res, 'No se pudo cambiar el estado. Reintenta.'));
        setFetching(false);
        return null;
      }
      const result = (await res.json().catch(() => ({}))) as LifecycleMutationResult;
      setFetching(false);
      startTransition(() => router.refresh());
      return result;
    } catch {
      setError('Error de red. Reintenta.');
      setFetching(false);
      return null;
    }
  }

  /** Resolve a pending athlete-initiated pause request (confirm → pauses; decline → no-op). */
  async function resolveRequest(
    requestId: string,
    decision: 'confirm' | 'decline',
  ): Promise<boolean> {
    if (busy) return false;
    setError(null);
    setFetching(true);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/pause-request/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, decision }),
      });
      if (!res.ok) {
        setError(await readError(res, 'No se pudo resolver la solicitud. Reintenta.'));
        setFetching(false);
        return false;
      }
      setFetching(false);
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError('Error de red. Reintenta.');
      setFetching(false);
      return false;
    }
  }

  return { mutate, resolveRequest, busy, error, setError };
}
