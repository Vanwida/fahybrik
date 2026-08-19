'use client';

// PERSONALIZAR PLAN (0164, camino principal) — confirmation before forking the
// athlete's CURRENT microciclo (from the week they're living onward) into a
// bespoke plan just for them. This is a real, stated-up-front side effect (the
// athlete stops receiving auto-assigned microciclos by level×días), so the
// coach reads it in plain language before confirming — never a silent flip.

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';
import { SegmentedControl } from '@/components/v2/SegmentedControl';

type StartChoice = 'current_week' | 'next_week';

const startOptions = [
  { value: 'current_week' as const, label: 'Esta semana' },
  { value: 'next_week' as const, label: 'La semana que viene' },
];

export function PersonalizarPlanModal({
  athleteId,
  athleteName,
  currentBlockName,
  currentWeek,
  onClose,
}: {
  athleteId: string;
  athleteName: string;
  /** Name of the CURRENT microciclo being forked (for "a partir de «X»"). */
  currentBlockName: string;
  /** 1-based week within that microciclo the fork starts at. */
  currentWeek: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [start, setStart] = useState<StartChoice>('current_week');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/personalize-plan`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start }),
      });
      const body = (await res.json().catch(() => null)) as
        | { personalize?: { month_template_id: string }; error?: { message?: string } }
        | null;
      if (!res.ok || !body?.personalize) {
        setError(body?.error?.message ?? 'No se pudo personalizar el plan.');
        setSubmitting(false);
        return;
      }
      router.push(`/microciclos/${body.personalize.month_template_id}`);
    } catch {
      setError('No se pudo personalizar el plan. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <ModalPortal onEscape={onClose}>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Personalizar plan"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--v2-scrim)]"
      />
      <div className="relative flex w-full max-w-md flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">Personalizar plan</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="v2-focus inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm text-[color:var(--v2-fg)]">
            Vas a coger el plan de <span className="font-semibold">{athleteName}</span>:{' '}
            «{currentBlockName}»{currentWeek != null ? ` (semana ${currentWeek})` : ''}, y
            convertirlo en un plan solo para {athleteName}.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="v2-micro">Empieza</span>
            <SegmentedControl
              options={startOptions}
              value={start}
              onChange={setStart}
              ariaLabel="Cuándo empieza el plan personal"
            />
          </label>
          <ul className="flex flex-col gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3 text-xs text-[color:var(--v2-muted)]">
            <li className="flex items-start gap-2">
              <MIcon name="check" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-ok)]" />
              {start === 'next_week'
                ? 'Esta semana sigue igual: lo ya hecho nunca cambia.'
                : 'Lo ya hecho no cambia: solo se copia desde la semana en curso.'}
            </li>
            <li className="flex items-start gap-2">
              <MIcon name="check" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-ok)]" />
              La plantilla original de la biblioteca queda intacta: esto es una copia.
            </li>
            <li className="flex items-start gap-2">
              <MIcon name="priority_high" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]" />
              {athleteName} deja de recibir microciclos automáticos por nivel: a partir de
              ahora sigue este plan a medida.
            </li>
          </ul>
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
              onClick={confirm}
              disabled={submitting}
              className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <MIcon name="progress_activity" size={16} className="animate-spin" />
                  Personalizando…
                </>
              ) : (
                <>
                  <MIcon name="auto_fix_high" size={16} />
                  Personalizar y editar
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
