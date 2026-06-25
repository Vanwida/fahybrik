'use client';

// SidePanel — the create/edit panel that sits to the right of the list (the list
// stays visible, dimmed, behind it — wired by the parent grid). Shared by Niveles
// and Fases so both editors look identical. Owns only chrome: header (title + ✕),
// a scrollable body (the fields), and a sticky footer (Cancelar / Guardar). ESC
// closes; focus lands on the panel on open.

import { useEffect, useRef } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export function SidePanel({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={title}
      className="v2-focus flex flex-col rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-[18px] shadow-[var(--v2-shadow-pop)]"
    >
      <div className="mb-3.5 flex items-center justify-between">
        <span className="text-[13px] font-bold uppercase tracking-[0.07em] text-[color:var(--v2-muted)]">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="v2-focus rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="close" size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-3.5">{children}</div>

      <div className="mt-[18px] flex gap-2 border-t border-[color:var(--v2-border)] pt-3.5">
        {footer}
      </div>
    </div>
  );
}

// ── Field primitives shared by both panels ───────────────────────────────────

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.05em] text-[color:var(--v2-muted)]">
        {label}
        {hint ? (
          <span className="ml-1.5 font-semibold normal-case tracking-normal text-[color:var(--v2-faint)]">
            {hint}
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

const INPUT_CLS = cn(
  'v2-focus w-full rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface-2)] px-3 text-[13px] text-[color:var(--v2-fg)]',
  'placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]',
);

export function TextInput({
  value,
  onChange,
  placeholder,
  invalid = false,
  maxLength,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      aria-invalid={invalid}
      className={cn(
        INPUT_CLS,
        'h-[34px]',
        invalid ? 'border-[color:var(--v2-danger)]' : 'border-[color:var(--v2-border)]',
      )}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={3}
      className={cn(
        INPUT_CLS,
        'min-h-[56px] resize-y border-[color:var(--v2-border)] py-2.5 leading-relaxed',
      )}
    />
  );
}
