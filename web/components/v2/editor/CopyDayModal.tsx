'use client';

// CopyDayModal — target picker for "Copiar día a…". The coach copies the day they
// are editing into one or more days, in the SAME week or in ANOTHER week of the
// microciclo (cross-week). Pick a target WEEK (chips at the top), then check one
// or more target DAYS — each shows its HONEST current state (workout chips +
// counts, "Descanso", or "Vacío"). Copying onto days that already hold content
// asks for explicit confirmation before overwriting — never a silent clobber.

import { useMemo, useState } from 'react';
import { ModalPortal } from './ModalPortal';
import { MIcon } from '@/components/ui/MIcon';
import { MODALITY_META, type V2Modality } from '@/components/v2/constants';
import { DAY_LABELS_FULL, type DayModalityInfo } from '@/lib/dashboard/v2/planes-model';
import type { DayEditorWeekRef } from '@/lib/dashboard/v2/editor-types';
import { cn } from '@/lib/utils';

type CopyResult = 'ok' | 'conflict' | 'error';

function dayStateLabel(day: DayModalityInfo): string {
  if (day.session_count > 0) {
    const bl = `${day.block_count} bl`;
    return day.item_count > 0 ? `${bl} · ${day.item_count} ej` : bl;
  }
  return day.is_rest ? 'Descanso' : 'Vacío';
}

export function CopyDayModal({
  currentWeekId,
  currentDayOfWeek,
  weeks,
  onCopy,
  onClose,
}: {
  /** Week the source day lives in (its own day is not a valid target). */
  currentWeekId: string;
  currentDayOfWeek: number;
  /** All weeks of the microciclo (incl. the current one), summarised. */
  weeks: DayEditorWeekRef[];
  onCopy: (toWeekId: string, toDays: number[], overwrite: boolean) => Promise<CopyResult>;
  onClose: () => void;
}) {
  const [targetWeekId, setTargetWeekId] = useState(currentWeekId);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // null = not asking; true = awaiting overwrite confirmation.
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errored, setErrored] = useState(false);

  const targetWeek = useMemo(
    () => weeks.find((w) => w.id === targetWeekId) ?? weeks[0] ?? null,
    [weeks, targetWeekId],
  );
  const isSameWeek = targetWeek?.id === currentWeekId;

  // A target day is the source itself only when we're on the source's own week.
  const isSource = (dow: number) => isSameWeek && dow === currentDayOfWeek;

  const toggleDay = (dow: number) => {
    if (isSource(dow) || busy) return;
    setConfirming(false);
    setErrored(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dow)) next.delete(dow);
      else next.add(dow);
      return next;
    });
  };

  const pickWeek = (id: string) => {
    if (busy) return;
    setTargetWeekId(id);
    setSelected(new Set());
    setConfirming(false);
    setErrored(false);
  };

  const selectedDays = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);

  // Which selected target days already hold content (would be overwritten).
  const conflictCount = useMemo(() => {
    if (!targetWeek) return 0;
    return selectedDays.filter((dow) => {
      const d = targetWeek.days.find((x) => x.day_of_week === dow);
      return !!d && d.session_count > 0;
    }).length;
  }, [targetWeek, selectedDays]);

  const run = async (overwrite: boolean) => {
    if (!targetWeek || selectedDays.length === 0) return;
    setBusy(true);
    setErrored(false);
    const result = await onCopy(targetWeek.id, selectedDays, overwrite);
    setBusy(false);
    if (result === 'ok') return; // parent navigates + closes
    if (result === 'conflict') setConfirming(true);
    else setErrored(true);
  };

  const onSubmit = () => {
    if (selectedDays.length === 0) return;
    if (conflictCount > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    void run(conflictCount > 0);
  };

  const days = targetWeek?.days ?? [];

  return (
    // A media copia, Escape se traga: no se cierra el modal con la petición en vuelo.
    <ModalPortal onEscape={onClose} escapeEnabled={!busy}>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Copiar día a otro día o semana"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
      >
        <header className="flex items-center justify-between border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="flex min-w-0 flex-col">
            <h2 className="v2-display text-xl">Copiar día a…</h2>
            <p className="text-xs text-[color:var(--v2-muted)]">
              Copia idéntica · sin cambiar cargas
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

        {/* Target-week chips (only when the microciclo has >1 week). */}
        {weeks.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[color:var(--v2-border)] px-4 py-3">
            <span className="mr-1 text-label font-semibold uppercase tracking-wide text-[color:var(--v2-faint)]">
              Semana
            </span>
            {weeks.map((w) => {
              const active = w.id === targetWeekId;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => pickWeek(w.id)}
                  aria-pressed={active}
                  className={cn(
                    'v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-pill)] border px-2.5 text-label font-semibold transition-colors',
                    active
                      ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                      : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
                  )}
                >
                  S{w.week_index + 1}
                  {w.id === currentWeekId ? ' · esta' : ''}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex max-h-[52vh] flex-col gap-1.5 overflow-y-auto p-4">
          {days.map((day, i) => {
            const dow = day.day_of_week;
            const fullLabel = DAY_LABELS_FULL[i] ?? `Día ${dow}`;
            const hasContent = day.session_count > 0;
            const checked = selected.has(dow);

            if (isSource(dow)) {
              return (
                <div
                  key={dow}
                  className="flex items-center justify-between rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)] px-3 py-2.5 opacity-60"
                >
                  <span className="text-sm font-semibold text-[color:var(--v2-muted)]">
                    {fullLabel}
                  </span>
                  <span className="text-label font-medium text-[color:var(--v2-faint)]">
                    este día
                  </span>
                </div>
              );
            }

            return (
              <button
                key={dow}
                type="button"
                onClick={() => toggleDay(dow)}
                disabled={busy}
                aria-pressed={checked}
                className={cn(
                  'v2-focus group flex items-center justify-between gap-2 rounded-[var(--v2-r-s)] border px-3 py-2.5 text-left transition-colors disabled:opacity-50',
                  checked
                    ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)]'
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
                    {fullLabel}
                  </span>
                  {hasContent ? (
                    <span className="flex flex-wrap gap-1">
                      {day.modalities.map((m: V2Modality) => (
                        <span
                          key={m}
                          className="rounded-[var(--v2-r-pill)] px-1.5 py-0.5 text-nano font-semibold leading-none"
                          style={{
                            background: `var(${MODALITY_META[m].softVar})`,
                            color: `var(${MODALITY_META[m].colorVar})`,
                          }}
                        >
                          {MODALITY_META[m].label}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <span className="v2-num shrink-0 text-label text-[color:var(--v2-faint)]">
                  {dayStateLabel(day)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer — overwrite confirmation + copy action. */}
        <footer className="flex flex-col gap-2 border-t border-[color:var(--v2-border)] px-4 py-3">
          {confirming && conflictCount > 0 ? (
            <p className="text-xs text-[color:var(--v2-danger)]">
              {conflictCount === 1
                ? '1 día destino ya tiene contenido y se sobrescribirá.'
                : `${conflictCount} días destino ya tienen contenido y se sobrescribirán.`}
            </p>
          ) : errored ? (
            <p className="text-xs text-[color:var(--v2-danger)]">
              No se pudo copiar. Inténtalo de nuevo.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-label text-[color:var(--v2-muted)]">
              {selectedDays.length === 0
                ? 'Elige uno o más días'
                : `${selectedDays.length} día${selectedDays.length === 1 ? '' : 's'} seleccionado${selectedDays.length === 1 ? '' : 's'}`}
            </span>
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy || selectedDays.length === 0}
              className={cn(
                'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-pill)] px-4 text-sm font-bold transition-colors disabled:opacity-50',
                confirming && conflictCount > 0
                  ? 'bg-[color:var(--v2-danger)] text-[color:var(--v2-bg)]'
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
    </ModalPortal>
  );
}
