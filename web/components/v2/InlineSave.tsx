'use client';

// Shared inline-save primitive for athlete-facing metadata fields the coach edits
// in place (week focus, microciclo name…). It owns ONLY the idle→saving→saved/error
// state-machine + the no-op guard for unchanged values — NOT the draft value or the
// rendering, because those genuinely differ (an always-editable input vs a click-to-
// edit display title). Each consumer keeps its own value state and renders its own
// field; both share this save logic and the status badge so there is one source of
// truth for "how an inline save behaves and looks".

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';

export type InlineSaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * `persist` returns true on success, false on a handled failure (a thrown error is
 * also treated as failure). `save(next, baseline)` is a no-op when `next` equals the
 * baseline, so re-blurring an untouched field never hits the network.
 */
export function useInlineSave(persist: (value: string) => Promise<boolean>) {
  const [status, setStatus] = useState<InlineSaveState>('idle');

  const save = async (next: string, baseline: string) => {
    if (next === baseline) {
      setStatus('idle');
      return;
    }
    setStatus('saving');
    try {
      setStatus((await persist(next)) ? 'saved' : 'error');
    } catch {
      setStatus('error');
    }
  };

  return { status, setStatus, save };
}

/** The saving / saved / error indicator shared by every inline-save field. */
export function InlineSaveBadge({ status }: { status: InlineSaveState }) {
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-label font-semibold text-[color:var(--v2-muted)]">
        <MIcon name="progress_activity" size={14} /> Guardando…
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-label font-semibold text-[color:var(--v2-ok)]">
        <MIcon name="check" size={14} /> Guardado
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-label font-semibold text-[color:var(--v2-danger)]">
        <MIcon name="error" size={14} /> No se pudo guardar
      </span>
    );
  }
  return null;
}
