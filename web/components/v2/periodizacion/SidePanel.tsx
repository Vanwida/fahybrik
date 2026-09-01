'use client';

// SidePanel — the create/edit panel that sits to the right of the list (the list
// stays visible, dimmed, behind it — wired by the parent grid). Used by the Niveles
// create/edit flow. Owns only chrome: header (title + ✕),
// a scrollable body (the fields), and a sticky footer (Cancelar / Guardar). ESC
// closes; focus lands on the panel on open.

import { useEffect, useRef } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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

  // Foco al abrir — UNA vez, deps vacías. `onClose` es una arrow function que
  // el padre recrea en cada render (típicamente `() => setDraft(null)`); si
  // este efecto dependiera de ella, cada tecleo en un campo del panel volvía
  // a disparar `ref.current.focus()` y le robaba el foco al input justo
  // detrás de la primera letra — un clic por carácter (Alex, 8-ago).
  useEffect(() => {
    ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
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
        <span className="text-body font-bold uppercase tracking-[0.07em] text-[color:var(--v2-muted)]">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="v2-focus rounded-full text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
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
      <span className="mb-1.5 block text-label font-bold uppercase tracking-[0.05em] text-[color:var(--v2-muted)]">
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

// Los dos campos de este panel pasan por el sistema compartido. Antes vivían
// sobre `INPUT_CLS`, una de las OCHO constantes de clase rivales que
// `components/ui/input.tsx` documenta y viene a matar: cada una resolvía el
// mismo campo en su fichero y ninguna sabía de las otras.
//
// La envoltura se queda (mismo nombre, mismas props) porque sus dos únicos
// consumidores —`periodizacion/NivelesPanel` y `tests/TestEditorPanel`— están
// fuera del alcance de esta ola. Lo que cambia es quién pinta, no quién llama.

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
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      // El campo se tiñe solo leyendo el `aria-invalid` que ya hacía falta por
      // accesibilidad; antes el rojo se pintaba aparte en la clase.
      aria-invalid={invalid}
      // El átomo es `block min-w-0`, no `w-full`: el ancho lo pone quien llama.
      className="w-full"
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
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      // `rows` gobierna la altura: el `min-h-[56px]` que había era inerte (tres
      // renglones a interlineado de prosa ya miden ~86px).
      rows={3}
    />
  );
}
