'use client';

// BORRAR UN MICROCICLO DE LA CADENA — misma regla dura de siempre (lo
// pendiente desaparece, lo ejecutado se conserva en el historial; ver
// retirePersonalPlan en personal-plans.ts), dicha con números reales ANTES de
// borrar. La diferencia con "Borrar" del panel de planes personales: aquí
// también se dice qué pasa con los microciclos siguientes de la cadena — se
// recolocan para cerrar el hueco, o se quedan donde están porque este
// microciclo ya tiene historia real que no se puede desplazar.

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';

export function BorrarMicrocicloCadenaModal({
  athleteId,
  athleteName,
  monthTemplateId,
  planName,
  pendingCount,
  completedCount,
  isCurrent,
  hasFollowingTramos,
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
  hasFollowingTramos: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/plan-chain/${monthTemplateId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? 'No se pudo borrar el microciclo.');
        setSubmitting(false);
        return;
      }
      router.refresh();
      onDeleted();
    } catch {
      setError('No se pudo borrar el microciclo. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  }

  const willReflow = completedCount === 0 && hasFollowingTramos;
  const leavesGap = completedCount > 0 && hasFollowingTramos;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Borrar microciclo de la cadena"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--v2-scrim)]"
      />
      <div className="relative flex w-full max-w-md flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">Borrar microciclo</h2>
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
            Vas a borrar «{planName}» de <span className="font-semibold">{athleteName}</span>.
          </p>
          <ul className="flex flex-col gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3 text-xs text-[color:var(--v2-muted)]">
            {pendingCount > 0 ? (
              <li className="flex items-start gap-2">
                <MIcon name="delete" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-danger)]" />
                <span>
                  <span className="v2-num font-semibold text-[color:var(--v2-fg)]">{pendingCount}</span>{' '}
                  {pendingCount === 1 ? 'sesión pendiente se elimina' : 'sesiones pendientes se eliminan'}.
                </span>
              </li>
            ) : null}
            {completedCount > 0 ? (
              <li className="flex items-start gap-2">
                <MIcon name="check" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-ok)]" />
                <span>
                  <span className="v2-num font-semibold text-[color:var(--v2-fg)]">{completedCount}</span>{' '}
                  {completedCount === 1
                    ? 'sesión ya completada se conserva en su historial.'
                    : 'sesiones ya completadas se conservan en su historial.'}
                </span>
              </li>
            ) : null}
            {isCurrent ? (
              <li className="flex items-start gap-2">
                <MIcon name="priority_high" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]" />
                <span>
                  Es el microciclo que{' '}
                  <span className="font-semibold text-[color:var(--v2-fg)]">{athleteName}</span> ve
                  hoy.
                </span>
              </li>
            ) : null}
            {willReflow ? (
              <li className="flex items-start gap-2">
                <MIcon name="sync_alt" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-fg)]" />
                <span>Los microciclos siguientes de la cadena se recolocarán para cerrar el hueco.</span>
              </li>
            ) : null}
            {leavesGap ? (
              <li className="flex items-start gap-2">
                <MIcon name="priority_high" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]" />
                <span>
                  Como ya tiene sesiones hechas, los microciclos siguientes NO se recolocan — quedará
                  un hueco en el calendario.
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
                  Borrar microciclo
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
