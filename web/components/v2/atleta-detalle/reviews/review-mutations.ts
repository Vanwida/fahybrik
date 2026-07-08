'use client';

// Client mutations for the 1:1 reviews panel (#21). Three coach actions on the ficha,
// each surfacing the backend's honest error message and router.refresh()ing on success
// so the server re-renders the panel with the new state. Mirrors useLifecycleMutation.
//   • setCadence → PATCH /api/coach/athletes/[id]/review-cadence
//   • propose    → POST  /api/coach/athletes/[id]/propose-review
//   • cancel     → POST  /api/coach/athletes/[id]/review/cancel

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ReviewCadence } from '@fahybrid/shared/domain/coach/reviews';

/** Reasons proposeReview declines to send (already booked / proposed too recently). */
export type ProposeReason = 'already_booked' | 'recent_proposal';

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function useReviewMutations(athleteId: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = fetching || isPending;

  /** Fetch + inline-error shell shared by the three actions. Returns the ok Response or
   *  null (error already set). The caller refreshes on success. */
  async function run(input: string, init: RequestInit, fallback: string): Promise<Response | null> {
    if (busy) return null;
    setError(null);
    setFetching(true);
    try {
      const res = await fetch(input, init);
      if (!res.ok) {
        setError(await readError(res, fallback));
        setFetching(false);
        return null;
      }
      setFetching(false);
      return res;
    } catch {
      setError('Error de red. Reintenta.');
      setFetching(false);
      return null;
    }
  }

  async function setCadence(cadence: ReviewCadence): Promise<boolean> {
    const res = await run(
      `/api/coach/athletes/${athleteId}/review-cadence`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cadence }),
      },
      'No se pudo fijar la cadencia. Reintenta.',
    );
    if (!res) return false;
    startTransition(() => router.refresh());
    return true;
  }

  async function propose(): Promise<{ proposed: boolean; reason?: ProposeReason } | null> {
    const res = await run(
      `/api/coach/athletes/${athleteId}/propose-review`,
      { method: 'POST' },
      'No se pudo proponer la revisión. Reintenta.',
    );
    if (!res) return null;
    const data = (await res.json().catch(() => ({}))) as {
      proposed?: boolean;
      reason?: ProposeReason;
    };
    startTransition(() => router.refresh());
    return { proposed: Boolean(data.proposed), reason: data.reason };
  }

  async function cancel(): Promise<boolean> {
    const res = await run(
      `/api/coach/athletes/${athleteId}/review/cancel`,
      { method: 'POST' },
      'No se pudo cancelar la revisión. Reintenta.',
    );
    if (!res) return false;
    startTransition(() => router.refresh());
    return true;
  }

  return { setCadence, propose, cancel, busy, error, setError };
}
