'use client';

import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OVERLAY_Z, usePanelPortal } from './portal';
import { TRIGGER_SIZE } from './Select';
import { OPTION_ROW, POPUP_SURFACE } from './styles';

export interface ComboboxOption<V> {
  value: V;
  label: string;
  /** Texto secundario (nivel, email…) — también cuenta para buscar. */
  hint?: string;
  disabled?: boolean;
}

export interface ComboboxProps<V> {
  options: ComboboxOption<V>[];
  value: V | null;
  onValueChange: (value: V | null) => void;
  placeholder?: string;
  emptyText?: string;
  size?: keyof typeof TRIGGER_SIZE;
  'aria-label'?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/** Quita acentos y mayúsculas: «Martí» encuentra «marti». */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Selector con búsqueda (atleta, ejercicio, grupo…). Escribir filtra sin
 * importar acentos; flechas + Enter eligen; Escape cierra.
 */
export function Combobox<V>({
  options,
  value,
  onValueChange,
  placeholder = 'Buscar…',
  emptyText = 'Nada coincide',
  size = 'md',
  disabled,
  className,
  id,
  ...aria
}: ComboboxProps<V>) {
  const { anchor, container } = usePanelPortal();
  const selected = options.find((o) => Object.is(o.value, value)) ?? null;
  return (
    <ComboboxPrimitive.Root
      items={options}
      value={selected}
      onValueChange={(next) => onValueChange(next ? (next as ComboboxOption<V>).value : null)}
      itemToStringLabel={(o: ComboboxOption<V>) => o.label}
      isItemEqualToValue={(a: ComboboxOption<V>, b: ComboboxOption<V>) => Object.is(a.value, b.value)}
      filter={(o: ComboboxOption<V>, query: string) =>
        fold(`${o.label} ${o.hint ?? ''}`).includes(fold(query.trim()))
      }
      disabled={disabled}
    >
      <div ref={anchor} className={cn('relative flex min-w-0 items-center', className)}>
        <Search aria-hidden strokeWidth={1.75} className="pointer-events-none absolute left-2.5 size-3.5 text-v2-faint" />
        <ComboboxPrimitive.Input
          id={id}
          aria-label={aria['aria-label']}
          placeholder={placeholder}
          className={cn(
            'w-full min-w-0 rounded-ctl border border-v2-border bg-v2-surface pl-8 pr-8 text-v2-fg outline-none',
            'placeholder:text-v2-faint hover:border-v2-border-strong',
            'focus-visible:border-v2-border-strong focus-visible:shadow-[0_0_0_3px_var(--v2-accent-soft)]',
            TRIGGER_SIZE[size],
            'pl-8',
          )}
        />
        <ComboboxPrimitive.Trigger
          aria-label="Abrir lista"
          className="absolute right-1 flex size-6 items-center justify-center rounded-[4px] text-v2-faint hover:text-v2-fg"
        >
          <ChevronDown className="size-3.5" strokeWidth={2} aria-hidden />
        </ComboboxPrimitive.Trigger>
      </div>
      <ComboboxPrimitive.Portal container={container}>
        <ComboboxPrimitive.Positioner sideOffset={4} className={OVERLAY_Z}>
          <ComboboxPrimitive.Popup
            className={cn(
              POPUP_SURFACE,
              'w-[var(--anchor-width)] min-w-56 max-h-[min(var(--available-height),20rem)] overflow-y-auto overscroll-contain p-1',
            )}
          >
            <ComboboxPrimitive.Empty className="px-2 py-2 t-body-sm text-v2-faint empty:hidden">
              {emptyText}
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List>
              {(o: ComboboxOption<V>) => (
                <ComboboxPrimitive.Item key={String(o.value)} value={o} disabled={o.disabled} className={cn(OPTION_ROW, 'pl-7')}>
                  <ComboboxPrimitive.ItemIndicator className="absolute left-2 flex items-center">
                    <Check className="size-3.5" strokeWidth={2} aria-hidden />
                  </ComboboxPrimitive.ItemIndicator>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint ? <span className="t-meta text-v2-faint">{o.hint}</span> : null}
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}
