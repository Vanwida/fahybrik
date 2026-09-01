'use client';

// Chrome local de /cuestionarios — mismo patrón que Tests (PanelButton,
// DialogScrim, ErrorBanner). Cada sección v2 es dueña de su cromo.

import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="mb-3 flex items-center gap-2.5 rounded-[var(--v2-r-s)] px-3 py-2.5 text-xs"
      style={{
        background: 'var(--v2-danger-soft)',
        color: 'var(--v2-danger)',
        border: '1px solid color-mix(in srgb, var(--v2-danger) 30%, transparent)',
      }}
    >
      <MIcon name="error" size={16} />
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Descartar" className="v2-focus rounded">
        <MIcon name="close" size={15} />
      </button>
    </div>
  );
}

export function DialogScrim({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-[color:var(--v2-scrim)] p-4"
      onClick={onClose}
      role="presentation"
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function PanelButton({
  variant,
  onClick,
  disabled = false,
  children,
}: {
  variant: 'primary' | 'ghost' | 'outline' | 'danger';
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const base =
    'v2-focus inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[var(--v2-r-pill)] px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const cls = cn(
    base,
    variant === 'primary' &&
      'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]',
    variant === 'ghost' &&
      'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
    variant === 'outline' &&
      'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
    variant === 'danger' &&
      'border border-[color:var(--v2-danger)] text-[color:var(--v2-danger)] hover:bg-[color:var(--v2-danger-soft)]',
  );
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}
