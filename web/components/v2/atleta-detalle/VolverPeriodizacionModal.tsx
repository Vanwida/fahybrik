'use client';

// VOLVER A LA PERIODIZACIÓN (0166) — la inversa de "Personalizar plan": reactiva
// la secuencia (nivel×días) donde el atleta se quedó y retira el plan personal.
// Solo se ofrece cuando hay adónde volver (can_revert_to_sequence en el payload
// del plan) — un plan personal creado desde cero no tiene secuencia detrás, y
// ese caso no llega a ver este modal (usa "Borrar" en su lugar).

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';

export function VolverPeriodizacionModal({
  athleteId,
  athleteName,
  personalPlanName,
  onClose,
}: {
  athleteId: string;
  athleteName: string;
  /** Name of the personal plan being retired (for "dejar «X»"). */
  personalPlanName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/revert-to-sequence`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? 'No se pudo volver a la periodización.');
        setSubmitting(false);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError('No se pudo volver a la periodización. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <ModalPortal onEscape={onClose}>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Volver a la periodización"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--v2-scrim)]"
      />
      <div className="relative flex w-full max-w-md flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">Volver a la periodización</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="v2-focus inline-flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm text-[color:var(--v2-fg)]">
            <span className="font-semibold">{athleteName}</span> deja «{personalPlanName}» y vuelve
            a recibir sus microciclos automáticos por nivel, justo donde se quedó antes de
            personalizar.
          </p>
          <ul className="flex flex-col gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3 text-xs text-[color:var(--v2-muted)]">
            <li className="flex items-start gap-2">
              <MIcon name="check" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-ok)]" />
              Lo ya ejecutado en «{personalPlanName}» no se borra: queda en su historial.
            </li>
            <li className="flex items-start gap-2">
              <MIcon name="priority_high" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]" />
              Las sesiones pendientes de «{personalPlanName}» se sustituyen por las de la
              periodización, empezando esta semana.
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
                  Volviendo…
                </>
              ) : (
                <>
                  <MIcon name="history" size={16} />
                  Volver a la periodización
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
