'use client';

// PONER EN MARCHA UN PLAN PERSONAL (0164, camino secundario — "empezar de
// cero"). A personal plan is already tied to one athlete, so there's no roster
// to pick from — just WHEN it starts. Reuses the EXISTING /assign-month pipeline
// verbatim (the same one the level×días sequence and "Asignar a atleta" use):
// materializes real dated workout_assignments + staggers future weeks as draft.
// Safe to call again later (e.g. to push the start date) — instantiateMonthFrom-
// Template only ever replaces assignments still `scheduled`, never a completed one.

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

function upcomingMondayIso(): string {
  const d = new Date();
  const dow = d.getDay();
  const daysUntilMonday = (1 - dow + 7) % 7;
  d.setDate(d.getDate() + daysUntilMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ActivarPlanPersonalModal({
  athleteId,
  athleteName,
  monthTemplateId,
  onClose,
}: {
  athleteId: string;
  athleteName: string;
  monthTemplateId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [startDate, setStartDate] = useState(upcomingMondayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function activate() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/assign-month`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ month_template_id: Number(monthTemplateId), start_date: startDate }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? 'No se pudo poner en marcha el plan.');
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError('No se pudo poner en marcha el plan. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Poner en marcha el plan personal"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--v2-scrim)]"
      />
      <div className="relative flex w-full max-w-sm flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">
            {done ? 'Plan en marcha' : 'Poner en marcha'}
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="v2-focus inline-flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col gap-3.5">
            <div className="flex items-start gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
              <MIcon name="check_circle" size={18} filled className="mt-0.5 shrink-0 text-[color:var(--v2-ok)]" />
              <p className="text-sm text-[color:var(--v2-muted)]">
                <span className="font-semibold text-[color:var(--v2-fg)]">{athleteName}</span> ya lo
                ve en su plan desde el {startDate}.
              </p>
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <p className="text-xs text-[color:var(--v2-muted)]">
              Este plan es solo de <span className="font-semibold text-[color:var(--v2-fg)]">{athleteName}</span>.
              Elige desde qué lunes lo ve en su plan.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="v2-micro">Fecha de inicio (lunes)</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={cn(
                  'v2-focus v2-num h-10 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm text-[color:var(--v2-fg)]',
                  'focus:border-[color:var(--v2-border-strong)]',
                )}
              />
            </label>
            {error ? <p className="text-xs font-medium text-[color:var(--v2-danger)]">{error}</p> : null}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={activate}
                disabled={submitting || startDate.length !== 10}
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <MIcon name="progress_activity" size={16} className="animate-spin" />
                    Activando…
                  </>
                ) : (
                  <>
                    <MIcon name="play_arrow" size={16} />
                    Poner en marcha
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
