'use client';

// CopyDayModal — target-day picker for "Copiar día a…". The coach copies the day
// they're editing into ANOTHER day of the SAME week. Each target shows its HONEST
// current state (the same week summary the strip uses): a workout day lists its
// modality chips + counts, a rest day reads "Descanso", an empty day "Vacío".
// Copying onto a day that already has content asks for explicit confirmation
// before overwriting — never a silent clobber.

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { MODALITY_META, type V2Modality } from '@/components/v2/constants';
import { DAY_LABELS_FULL, type DayModalityInfo } from '@/lib/dashboard/v2/planes-model';

type CopyResult = 'ok' | 'conflict' | 'error';

function dayStateLabel(day: DayModalityInfo): string {
  if (day.session_count > 0) {
    const bl = `${day.block_count} bl`;
    return day.item_count > 0 ? `${bl} · ${day.item_count} ej` : bl;
  }
  return day.is_rest ? 'Descanso' : 'Vacío';
}

export function CopyDayModal({
  currentDayOfWeek,
  weekDays,
  onCopy,
  onClose,
}: {
  currentDayOfWeek: number;
  /** The focused week's 7 days, Mon→Sun (index i → day_of_week i+1). */
  weekDays: DayModalityInfo[];
  onCopy: (targetDayOfWeek: number, overwrite: boolean) => Promise<CopyResult>;
  onClose: () => void;
}) {
  // Target awaiting overwrite confirmation (has content), and transient states.
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [errored, setErrored] = useState<number | null>(null);

  const run = async (targetDow: number, overwrite: boolean) => {
    setBusy(targetDow);
    setErrored(null);
    const result = await onCopy(targetDow, overwrite);
    setBusy(null);
    if (result === 'ok') return; // parent navigates + closes
    if (result === 'conflict') setConfirming(targetDow);
    else setErrored(targetDow);
  };

  const onPick = (day: DayModalityInfo) => {
    if (busy != null) return;
    const hasContent = day.session_count > 0;
    if (hasContent) setConfirming(day.day_of_week);
    else void run(day.day_of_week, false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Copiar día a otro día de la semana"
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

        <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto p-4">
          {weekDays.map((day, i) => {
            const dow = day.day_of_week;
            const isCurrent = dow === currentDayOfWeek;
            const fullLabel = DAY_LABELS_FULL[i] ?? `Día ${dow}`;
            const hasContent = day.session_count > 0;
            const isConfirming = confirming === dow;
            const isBusy = busy === dow;

            if (isCurrent) {
              return (
                <div
                  key={dow}
                  className="flex items-center justify-between rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)] px-3 py-2.5 opacity-60"
                >
                  <span className="text-sm font-semibold text-[color:var(--v2-muted)]">
                    {fullLabel}
                  </span>
                  <span className="text-[11px] font-medium text-[color:var(--v2-faint)]">
                    este día
                  </span>
                </div>
              );
            }

            if (isConfirming) {
              return (
                <div
                  key={dow}
                  className="flex items-center justify-between gap-2 rounded-[var(--v2-r-s)] border border-[color:rgba(242,80,79,.3)] bg-[color:var(--v2-danger-soft)] px-3 py-2.5"
                >
                  <span className="min-w-0 truncate text-[13px] text-[color:var(--v2-danger)]">
                    {fullLabel} ya tiene contenido. ¿Sobrescribir?
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 text-[11px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void run(dow, true)}
                      disabled={isBusy}
                      className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] bg-[color:var(--v2-danger,#c0362c)] px-2.5 text-[11px] font-bold text-white transition-colors disabled:opacity-60"
                    >
                      {isBusy ? <MIcon name="progress_activity" size={13} /> : null}
                      Sobrescribir
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <button
                key={dow}
                type="button"
                onClick={() => onPick(day)}
                disabled={busy != null}
                className="v2-focus group flex items-center justify-between gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2.5 text-left transition-colors hover:border-[color:var(--v2-border-strong)] disabled:opacity-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
                    {fullLabel}
                  </span>
                  {hasContent ? (
                    <span className="flex flex-wrap gap-1">
                      {day.modalities.map((m: V2Modality) => (
                        <span
                          key={m}
                          className="rounded-[var(--v2-r-pill)] px-1.5 py-0.5 text-[9px] font-semibold leading-none"
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
                <span className="flex shrink-0 items-center gap-2">
                  <span className="v2-num text-[11px] text-[color:var(--v2-faint)]">
                    {dayStateLabel(day)}
                  </span>
                  {isBusy ? (
                    <MIcon name="progress_activity" size={15} className="text-[color:var(--v2-muted)]" />
                  ) : errored === dow ? (
                    <MIcon name="error" size={15} className="text-[color:var(--v2-danger)]" />
                  ) : (
                    <MIcon
                      name="content_copy"
                      size={15}
                      className="text-[color:var(--v2-faint)] group-hover:text-[color:var(--v2-fg)]"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
