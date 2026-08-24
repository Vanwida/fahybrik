'use client';

// NuevoMicrocicloModal — "crear microciclo desde cero". AGNOSTIC: nombre + nº de
// semanas. El nivel NO es obligatorio al crear — es una etiqueta opcional que el
// coach puede asignar después o que viene fijado al crear desde una celda de
// Periodización. El tope de semanas es SU `max_microcycle_weeks` (card 135).
//
// Dos modos de uso:
//   · desde la Biblioteca (sin props extra) → nombre + semanas; navega al editor.
//   · desde una celda de Periodización (lockedLevel + daysContext + onCreated) → el
//     nivel viene FIJADO por la celda, se muestra el contexto de días, y el padre
//     decide qué hacer al crear (asociarlo a la secuencia + navegar).

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { cn } from '@/lib/utils';
import { MICROCICLO_DEFAULT_MAX_WEEKS } from '@fahybrid/shared/domain/coach/program-months';
import { readMaxMicrocycleWeeksFromLevelsResponse } from '@/lib/coach/read-max-microcycle-weeks';

const MIN_WEEKS = 1;
const DEFAULT_WEEKS = 4;

const labelClass = 'mb-1 block text-label font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]';

export function NuevoMicrocicloModal({
  onClose,
  lockedLevel,
  daysContext,
  onCreated,
}: {
  onClose: () => void;
  /** When creating from a periodization cell: the level is fixed (no re-pick). */
  lockedLevel?: { id: string; name: string; label: string };
  /** The cell's días/semana — shown as context (days belongs to the cell, not the microciclo). */
  daysContext?: number;
  /** When set, the caller handles post-create (associate with the cell + navigate). */
  onCreated?: (created: { id: string }) => void | Promise<void>;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);
  const [maxWeeks, setMaxWeeks] = useState(MICROCICLO_DEFAULT_MAX_WEEKS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/coach/levels', { credentials: 'include' })
      .then(async (r) => {
        const next = await readMaxMicrocycleWeeksFromLevelsResponse(r);
        if (!alive) return;
        setMaxWeeks(next);
        setWeeks((w) => Math.min(w, next));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSubmit =
    name.trim().length > 0 && weeks >= MIN_WEEKS && weeks <= maxWeeks && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: { name: string; week_count: number; level_id?: number } = {
        name: name.trim(),
        week_count: weeks,
      };
      if (lockedLevel) {
        payload.level_id = Number(lockedLevel.id);
      }

      const res = await fetch('/api/coach/program-months/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? 'No se pudo crear el ciclo.');
        setSubmitting(false);
        return;
      }
      const created = (await res.json()) as { id: string };
      if (onCreated) {
        try {
          await onCreated(created);
        } catch {
          setError(
            'Ciclo creado, pero no se pudo asociarlo a la secuencia. Añádelo desde la biblioteca.',
          );
          setSubmitting(false);
        }
        return;
      }
      router.push(`/microciclos/${created.id}`);
    } catch {
      setError('Error de red al crear el ciclo.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-[color:var(--v2-scrim)] p-4 pt-[8vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-label="Crear ciclo nuevo"
        onClick={(e) => e.stopPropagation()}
        className="v2-focus flex w-full max-w-[480px] flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-elevated)] p-[18px] shadow-[var(--v2-shadow-pop)]"
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="min-w-0">
            <span className="text-sm font-bold text-[color:var(--v2-fg)]">Crear ciclo nuevo</span>
            {lockedLevel ? (
              <p className="mt-0.5 text-xs text-[color:var(--v2-muted)]">
                para <b className="text-[color:var(--v2-fg)]">{lockedLevel.name}</b>
                {daysContext != null ? (
                  <>
                    {' · '}
                    <b className="text-[color:var(--v2-fg)]">{daysContext} días</b>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus rounded text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5">
            <div>
              <label htmlFor="micro-name" className={labelClass}>
                Nombre
              </label>
              <input
                id="micro-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="p. ej. Base aeróbica · bloque 1"
                autoFocus
                className="h-[38px] w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 text-body text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:outline-none focus:border-[color:var(--v2-accent)]"
              />
            </div>

            {lockedLevel ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className={labelClass}>Nivel</span>
                  <div
                    className="flex h-[38px] items-center gap-2 overflow-hidden rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5"
                    title={`${lockedLevel.name} · ${lockedLevel.label}`}
                  >
                    <LevelBadge level={lockedLevel.name} />
                    <span className="truncate text-body text-[color:var(--v2-fg)]">
                      {lockedLevel.label}
                    </span>
                  </div>
                </div>
                <div>
                  <label htmlFor="micro-weeks" className={labelClass}>
                    Semanas
                  </label>
                  <input
                    id="micro-weeks"
                    type="number"
                    min={MIN_WEEKS}
                    max={maxWeeks}
                    value={weeks}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) setWeeks(Math.min(maxWeeks, Math.max(MIN_WEEKS, Math.round(n))));
                    }}
                    className="h-[38px] w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 text-body text-[color:var(--v2-fg)] focus:outline-none focus:border-[color:var(--v2-accent)]"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor="micro-weeks" className={labelClass}>
                  Semanas
                </label>
                <input
                  id="micro-weeks"
                  type="number"
                  min={MIN_WEEKS}
                  max={maxWeeks}
                  value={weeks}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setWeeks(Math.min(maxWeeks, Math.max(MIN_WEEKS, Math.round(n))));
                  }}
                  className="h-[38px] w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 text-body text-[color:var(--v2-fg)] focus:outline-none focus:border-[color:var(--v2-accent)]"
                />
              </div>
            )}

            {error ? (
              <p className="text-xs font-medium text-[color:var(--v2-danger)]">{error}</p>
            ) : null}

            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className={cn(
                  'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {submitting ? (
                  <>
                    <MIcon name="progress_activity" size={15} className="animate-spin" /> Creando…
                  </>
                ) : (
                  <>
                    Crear y editar <MIcon name="arrow_forward" size={15} />
                  </>
                )}
              </button>
            </div>
          </div>
      </div>
    </div>
  );
}
