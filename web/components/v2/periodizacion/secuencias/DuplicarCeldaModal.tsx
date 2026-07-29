'use client';

// DuplicarCeldaModal — "Duplicar a…" for one matrix cell. The coach picks a TARGET
// nivel (from athlete_levels) + días/semana and we deep-copy the WHOLE source cell
// into it: every microciclo is cloned (independent weeks — editing the copy never
// touches the original), retargeted to the chosen level, in the same order.
//
// The días axis is the matrix band 3-6 (SEQUENCE_DAYS_OPTIONS): the DB CHECK on
// program_sequences forbids anything else, so offering 1-2/7 would only produce a
// guaranteed error. Occupied target cells (level × days already with a plan) are
// disabled inline — the server also guards (409), this just avoids a dead click.

import { useEffect, useMemo, useRef, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import type { V2LevelItem } from '@/lib/dashboard/v2/periodizacion';
import type { V2Sequence } from '@/lib/dashboard/v2/secuencias';
import { SEQUENCE_DAYS_OPTIONS } from './days';

const labelClass =
  'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]';

export function DuplicarCeldaModal({
  source,
  levels,
  cells,
  onClose,
  onDone,
}: {
  source: { levelId: string; levelName: string; days: number };
  levels: V2LevelItem[];
  /** Every cell keyed `${level_id}_${days}` — used to grey out occupied targets. */
  cells: Record<string, V2Sequence>;
  onClose: () => void;
  /** Called after a successful copy so the parent can refetch the matrix. */
  onDone: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const [targetLevelId, setTargetLevelId] = useState(source.levelId);
  // The coach's explicit días pick (null = none yet → falls back to the first free).
  const [pickedDays, setPickedDays] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A cell is occupied when it already holds ≥1 microciclo.
  const occupiedDays = useMemo(() => {
    const set = new Set<number>();
    for (const days of SEQUENCE_DAYS_OPTIONS) {
      const cell = cells[`${targetLevelId}_${days}`];
      if (cell && cell.items.length > 0) set.add(days);
    }
    return set;
  }, [cells, targetLevelId]);

  const freeDays = useMemo(
    () => SEQUENCE_DAYS_OPTIONS.filter((d) => !occupiedDays.has(d)),
    [occupiedDays],
  );

  // Effective selection, DERIVED in render (no state-sync effect): the coach's pick
  // when it's still a free variant of the chosen level, else the first free one.
  const targetDays = pickedDays != null && !occupiedDays.has(pickedDays) ? pickedDays : freeDays[0] ?? null;

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const targetLevel = levels.find((l) => l.id === targetLevelId) ?? null;
  const canSubmit = targetDays != null && !submitting;

  const submit = async () => {
    if (!canSubmit || targetDays == null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/coach/sequences/${source.levelId}/${source.days}/duplicate`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            target_level_id: Number(targetLevelId),
            target_days_per_week: targetDays,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? 'No se pudo duplicar la secuencia. Inténtalo de nuevo.');
        setSubmitting(false);
        return;
      }
      onDone();
    } catch {
      setError('Error de red al duplicar la secuencia.');
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
        aria-label="Duplicar la secuencia a otra celda"
        onClick={(e) => e.stopPropagation()}
        className="v2-focus flex w-full max-w-[480px] flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-elevated)] p-[18px] shadow-[var(--v2-shadow-pop)]"
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="min-w-0">
            <span className="text-sm font-bold text-[color:var(--v2-fg)]">Duplicar a otra celda</span>
            <p className="mt-0.5 text-[12px] text-[color:var(--v2-muted)]">
              Copia entera de <b className="text-[color:var(--v2-fg)]">{source.levelName} · {source.days} días</b> como
              punto de partida. La copia es independiente: edítala sin tocar el original.
            </p>
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
            <label htmlFor="dup-level" className={labelClass}>
              Nivel de destino
            </label>
            <select
              id="dup-level"
              value={targetLevelId}
              onChange={(e) => setTargetLevelId(e.target.value)}
              className="h-[38px] w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 text-[13px] text-[color:var(--v2-fg)] focus:outline-none focus:border-[color:var(--v2-accent)]"
            >
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className={labelClass}>Días/semana de destino</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Días/semana de destino">
              {SEQUENCE_DAYS_OPTIONS.map((d) => {
                const occupied = occupiedDays.has(d);
                const selected = targetDays === d;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={occupied}
                    aria-pressed={selected}
                    onClick={() => setPickedDays(d)}
                    title={occupied ? 'Esta variante ya tiene plan' : undefined}
                    className={cn(
                      'v2-focus inline-flex h-9 min-w-[52px] items-center justify-center gap-1 rounded-[var(--v2-r-s)] border px-2.5 text-[13px] font-semibold transition-colors',
                      selected
                        ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]'
                        : 'border-[color:var(--v2-border)] text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
                      occupied && 'cursor-not-allowed opacity-40 hover:border-[color:var(--v2-border)]',
                    )}
                  >
                    <b className="v2-num">{d}</b>
                    {occupied ? <MIcon name="lock" size={13} aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
            {freeDays.length === 0 ? (
              <p className="mt-1.5 text-[12px] text-[color:var(--v2-muted)]">
                Todas las variantes de{' '}
                <b className="text-[color:var(--v2-fg)]">{targetLevel?.name ?? 'este nivel'}</b> ya tienen plan.
                Elige otro nivel.
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-[12px] font-medium text-[color:var(--v2-danger)]">
              {error}
            </p>
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
                'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3.5 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {submitting ? (
                <>
                  <MIcon name="progress_activity" size={15} className="animate-spin" /> Duplicando…
                </>
              ) : (
                <>
                  <MIcon name="content_copy" size={15} /> Duplicar aquí
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
