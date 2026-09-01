'use client';

// BORRAR UN PLAN PERSONAL (0166) — dice, en números reales, qué se pierde y qué
// se conserva ANTES de borrar. La regla dura (nunca se toca lo ejecutado) vive
// en el servidor (retirePersonalPlan, lib/dashboard/coach/personal-plans.ts);
// este modal solo la explica con los conteos que YA vinieron con la lista
// (PlanesPersonalesPanel), sin una llamada extra.

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';

export function BorrarPlanPersonalModal({
  athleteId,
  athleteName,
  monthTemplateId,
  planName,
  pendingCount,
  completedCount,
  isCurrent,
  onClose,
  onDeleted,
}: {
  athleteId: string;
  athleteName: string;
  monthTemplateId: string;
  planName: string;
  pendingCount: number;
  completedCount: number;
  isCurrent: boolean;
  onClose: () => void;
  /** Called after a successful delete so the list can drop the row. */
  onDeleted: (monthTemplateId: string) => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/microciclo/${monthTemplateId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? 'No se pudo borrar el plan.');
        setSubmitting(false);
        return;
      }
      onDeleted(monthTemplateId);
      router.refresh();
      onClose();
    } catch {
      setError('No se pudo borrar el plan. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <ModalPortal onEscape={onClose}>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Borrar plan personal"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--v2-scrim)]"
      />
      <div className="relative flex w-full max-w-md flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">Borrar plan personal</h2>
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
            Vas a borrar «{planName}» de <span className="font-semibold">{athleteName}</span>.
          </p>
          <ul className="flex flex-col gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3 text-xs text-[color:var(--v2-muted)]">
            {pendingCount > 0 ? (
              <li className="flex items-start gap-2">
                <MIcon
                  name="delete"
                  size={14}
                  className="mt-0.5 shrink-0 text-[color:var(--v2-danger)]"
                />
                <span>
                  <span className="v2-num font-semibold text-[color:var(--v2-fg)]">
                    {pendingCount}
                  </span>{' '}
                  {pendingCount === 1 ? 'sesión pendiente se elimina' : 'sesiones pendientes se eliminan'}.
                </span>
              </li>
            ) : null}
            {completedCount > 0 ? (
              <li className="flex items-start gap-2">
                <MIcon name="check" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-ok)]" />
                <span>
                  <span className="v2-num font-semibold text-[color:var(--v2-fg)]">
                    {completedCount}
                  </span>{' '}
                  {completedCount === 1
                    ? 'sesión ya completada se conserva en su historial.'
                    : 'sesiones ya completadas se conservan en su historial.'}
                </span>
              </li>
            ) : null}
            {isCurrent ? (
              <li className="flex items-start gap-2">
                <MIcon
                  name="priority_high"
                  size={14}
                  className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]"
                />
                <span>
                  Es el plan que <span className="font-semibold text-[color:var(--v2-fg)]">
                    {athleteName}
                  </span>{' '}
                  ve hoy. Se quedará sin plan asignado hasta que le asignes otro.
                </span>
              </li>
            ) : null}
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
              className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-danger)] px-4 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <MIcon name="progress_activity" size={16} className="animate-spin" />
                  Borrando…
                </>
              ) : (
                <>
                  <MIcon name="delete" size={16} />
                  Borrar plan
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
