'use client';

// LifecycleDialog — the centered modal shell shared by the pause / baja / re-alta
// dialogs (#13). Chrome only: scrim, card, header (title + ✕) and a right-aligned
// footer. ESC + scrim close (blocked while `busy`, so a change in flight can't be
// dismissed mid-request). Mirrors the AddAthleteModal chrome for visual consistency.

import { MIcon } from '@/components/ui/MIcon';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';

export function LifecycleDialog({
  title,
  onClose,
  children,
  footer,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <ModalPortal onEscape={onClose} escapeEnabled={!busy}>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => !busy && onClose()}
        className="absolute inset-0 bg-[color:var(--v2-scrim)]"
      />
      <div className="relative w-full max-w-md rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">{title}</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="v2-focus inline-flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)] disabled:opacity-50"
          >
            <MIcon name="close" size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4">{children}</div>

        <div className="mt-5 flex items-center justify-end gap-2">{footer}</div>
      </div>
    </div>
    </ModalPortal>
  );
}
