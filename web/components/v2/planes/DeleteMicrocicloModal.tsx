'use client';

// Confirmación destructiva de «Borrar microciclo» — DELETE real, error honesto,
// y al borrar deja el lienzo (ya inexistente) rumbo a la biblioteca. Escape y
// click en el scrim cierran. Extraído de MicrocicloV2 en el rediseño ago-2026
// (mismo comportamiento, fichero propio para mantener el orquestador <500 líneas).

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';

export function DeleteMicrocicloModal({
  microcycleId,
  name,
  onClose,
}: {
  microcycleId: string;
  name: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/program-months/${microcycleId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message || 'No se pudo borrar. Inténtalo de nuevo.');
        setBusy(false);
        return;
      }
      router.push('/biblioteca');
    } catch {
      setError('No se pudo borrar. Inténtalo de nuevo.');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Borrar microciclo"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--v2-r-m)] bg-[color:var(--v2-danger-soft)] text-[color:var(--v2-danger)]">
            <MIcon name="delete" size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="v2-display text-xl">Borrar microciclo</h2>
            <p className="mt-1 text-sm text-[color:var(--v2-muted)]">
              Vas a borrar «{name}» y todas sus semanas. Esta acción no se puede deshacer.
            </p>
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-body font-semibold text-[color:var(--v2-danger)]">{error}</p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-4 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-danger)] px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <MIcon name={busy ? 'progress_activity' : 'delete'} size={16} />
            {busy ? 'Borrando…' : 'Borrar microciclo'}
          </button>
        </div>
      </div>
    </div>
  );
}
