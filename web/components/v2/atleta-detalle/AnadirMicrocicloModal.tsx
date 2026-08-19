'use client';

// AÑADIR UN MICROCICLO A LA CADENA — nombre + nº de semanas. Sin fecha que
// elegir: se engancha justo el día después de que acabe lo último que este
// atleta ya tiene asignado (personal-plan-chain-mutations.ts lo calcula solo,
// sin hueco ni solape posible).

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';

const MIN_WEEKS = 1;
const MAX_WEEKS = 20;
const DEFAULT_WEEKS = 4;

export function AnadirMicrocicloModal({
  athleteId,
  onClose,
  onAdded,
}: {
  athleteId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && weeks >= MIN_WEEKS && weeks <= MAX_WEEKS && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/plan-chain`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), week_count: weeks }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? 'No se pudo añadir el microciclo.');
        setSubmitting(false);
        return;
      }
      onAdded();
    } catch {
      setError('Error de red al añadir el microciclo.');
      setSubmitting(false);
    }
  }

  return (
    <ModalPortal onEscape={onClose}>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Añadir microciclo a la cadena"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--v2-scrim)]"
      />
      <div className="relative flex w-full max-w-sm flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">Añadir microciclo</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="v2-focus inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </div>
        <div className="flex flex-col gap-3.5">
          <p className="text-xs text-[color:var(--v2-muted)]">
            Se engancha justo detrás del último microciclo que este atleta ya tiene asignado, sin
            hueco ni solape.
          </p>
          <label className="flex flex-col gap-1">
            <span className="v2-micro">Nombre</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="p. ej. Build"
              autoFocus
              className="h-9 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:outline-none focus:border-[color:var(--v2-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="v2-micro">Semanas</span>
            <input
              type="number"
              min={MIN_WEEKS}
              max={MAX_WEEKS}
              value={weeks}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setWeeks(Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.round(n))));
              }}
              className="v2-num h-9 w-24 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 text-sm text-[color:var(--v2-fg)] focus:outline-none focus:border-[color:var(--v2-accent)]"
            />
          </label>
          {error ? <p className="text-xs font-medium text-[color:var(--v2-danger)]">{error}</p> : null}
          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <MIcon name="progress_activity" size={16} className="animate-spin" />
                  Añadiendo…
                </>
              ) : (
                <>
                  <MIcon name="add" size={16} />
                  Añadir
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
