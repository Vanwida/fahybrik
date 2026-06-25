'use client';

// CopyWeekModal — the key cross-week op: stamp ONE week's content onto OTHER weeks
// already in the microciclo ("monto la semana 1 y la copio a la 2/3/4"). The coach
// picks a source week (fixed: the one in focus) and one or more TARGET weeks via
// checkboxes + quick shortcuts ("la siguiente", "todas las siguientes"). Each
// target shows its HONEST current state (N sesiones / vacía). It OVERWRITES the
// target's content with a deep clone of the source — distinct from "Duplicar
// semana" which INSERTS a new one. Targets with content require explicit
// confirmation before overwriting. Pure clone — no progression bump, no dates.

import { useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import type { MicroWeek } from '@/components/v2/planes/MicrocicloEditor';
import { cn } from '@/lib/utils';

export function CopyWeekModal({
  microcycleId,
  sourceWeek,
  weeks,
  onClose,
}: {
  microcycleId: string;
  sourceWeek: MicroWeek;
  weeks: MicroWeek[];
  onClose: () => void;
}) {
  const router = useRouter();
  const candidates = useMemo(
    () => weeks.filter((w) => w.id !== sourceWeek.id),
    [weeks, sourceWeek.id],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errored, setErrored] = useState(false);

  const toggle = (id: string) => {
    if (busy) return;
    setConfirming(false);
    setErrored(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setMany = (ids: string[]) => {
    if (busy) return;
    setConfirming(false);
    setErrored(false);
    setSelected(new Set(ids));
  };

  const nextWeek = candidates.find((w) => w.index === sourceWeek.index + 1) ?? null;
  const followingWeeks = candidates.filter((w) => w.index > sourceWeek.index);

  const selectedIds = useMemo(() => [...selected], [selected]);
  const conflictCount = useMemo(
    () => candidates.filter((w) => selected.has(w.id) && w.session_count > 0).length,
    [candidates, selected],
  );

  const run = async (overwrite: boolean) => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    setErrored(false);
    try {
      const res = await fetch(
        `/api/coach/program-months/${microcycleId}/weeks/${sourceWeek.id}/copy-into`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            target_week_ids: selectedIds.map((id) => Number(id)),
            overwrite,
          }),
        },
      );
      if (res.status === 409) {
        setConfirming(true);
        return;
      }
      if (!res.ok) {
        setErrored(true);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setErrored(true);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = () => {
    if (selectedIds.length === 0) return;
    if (conflictCount > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    void run(conflictCount > 0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Copiar el contenido de la semana a otras semanas"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
      >
        <header className="flex items-center justify-between border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="flex min-w-0 flex-col">
            <h2 className="v2-display text-xl">Copiar a…</h2>
            <p className="text-xs text-[color:var(--v2-muted)]">
              Estampa S{sourceWeek.index + 1} sobre otras semanas · copia idéntica
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        {/* Quick shortcuts */}
        {candidates.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[color:var(--v2-border)] px-4 py-3">
            {nextWeek ? (
              <button
                type="button"
                onClick={() => setMany([nextWeek.id])}
                className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] px-2.5 text-[11px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
              >
                La siguiente
              </button>
            ) : null}
            {followingWeeks.length > 1 ? (
              <button
                type="button"
                onClick={() => setMany(followingWeeks.map((w) => w.id))}
                className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] px-2.5 text-[11px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
              >
                Todas las siguientes
              </button>
            ) : null}
            {candidates.length > 1 ? (
              <button
                type="button"
                onClick={() => setMany(candidates.map((w) => w.id))}
                className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] px-2.5 text-[11px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
              >
                Todas
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex max-h-[52vh] flex-col gap-1.5 overflow-y-auto p-4">
          {candidates.length === 0 ? (
            <p className="px-1 py-6 text-center text-[13px] text-[color:var(--v2-muted)]">
              No hay otras semanas en este microciclo.
            </p>
          ) : (
            candidates.map((w) => {
              const checked = selected.has(w.id);
              const hasContent = w.session_count > 0;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggle(w.id)}
                  disabled={busy}
                  aria-pressed={checked}
                  className={cn(
                    'v2-focus flex items-center justify-between gap-2 rounded-[var(--v2-r-s)] border px-3 py-2.5 text-left transition-colors disabled:opacity-50',
                    checked
                      ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft,rgba(255,122,26,.08))]'
                      : 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] hover:border-[color:var(--v2-border-strong)]',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <MIcon
                      name={checked ? 'check_box' : 'check_box_outline_blank'}
                      size={18}
                      className={checked ? 'text-[color:var(--v2-accent)]' : 'text-[color:var(--v2-faint)]'}
                    />
                    <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
                      S{w.index + 1}
                    </span>
                    {w.label ? (
                      <span className="truncate text-[11px] text-[color:var(--v2-muted)]">
                        {w.label}
                      </span>
                    ) : null}
                  </span>
                  <span className="v2-num shrink-0 text-[11px] text-[color:var(--v2-faint)]">
                    {hasContent ? `${w.session_count} ses` : 'vacía'}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <footer className="flex flex-col gap-2 border-t border-[color:var(--v2-border)] px-4 py-3">
          {confirming && conflictCount > 0 ? (
            <p className="text-[12px] text-[color:var(--v2-danger)]">
              {conflictCount === 1
                ? '1 semana destino ya tiene contenido y se sobrescribirá.'
                : `${conflictCount} semanas destino ya tienen contenido y se sobrescribirán.`}
            </p>
          ) : errored ? (
            <p className="text-[12px] text-[color:var(--v2-danger)]">
              No se pudo copiar. Inténtalo de nuevo.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-[color:var(--v2-muted)]">
              {selectedIds.length === 0
                ? 'Elige una o más semanas'
                : `${selectedIds.length} semana${selectedIds.length === 1 ? '' : 's'}`}
            </span>
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy || selectedIds.length === 0}
              className={cn(
                'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] px-4 text-sm font-bold transition-colors disabled:opacity-50',
                confirming && conflictCount > 0
                  ? 'bg-[color:var(--v2-danger,#c0362c)] text-white'
                  : 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]',
              )}
            >
              {busy ? (
                <MIcon name="progress_activity" size={16} />
              ) : (
                <MIcon name="content_copy" size={16} />
              )}
              {confirming && conflictCount > 0 ? 'Sobrescribir' : 'Copiar'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
