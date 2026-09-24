'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TabItem<V extends string> {
  value: V;
  label: string;
  /** Recuento a la derecha (tabular, discreto). */
  count?: number | null;
  icon?: LucideIcon;
  disabled?: boolean;
}

/**
 * Pestañas de página — UN nivel por página. Subrayado de 2 px en TINTA (la
 * selección es neutra; el acento del club no marca pestañas). Flechas ←/→
 * mueven y activan (Base UI). Los paneles van como hijos (`<TabPanel>`).
 */
export function Tabs<V extends string>({
  items,
  value,
  onValueChange,
  children,
  className,
  'aria-label': ariaLabel,
}: {
  items: TabItem<V>[];
  value: V;
  onValueChange: (value: V) => void;
  children?: ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as V)} className={className}>
      <TabsPrimitive.List
        aria-label={ariaLabel}
        className="relative flex gap-5 overflow-x-auto border-b border-v2-border [scrollbar-width:none]"
      >
        {items.map(({ value: v, label, count, icon: Icon, disabled }) => (
          <TabsPrimitive.Tab
            key={v}
            value={v}
            disabled={disabled}
            className={cn(
              'relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-0.5',
              'text-sm font-medium text-v2-muted outline-none transition-colors duration-[var(--v2-dur-fast)]',
              'hover:text-v2-fg data-[active]:border-v2-select-bar data-[active]:text-v2-fg',
              'focus-visible:text-v2-fg focus-visible:[box-shadow:inset_0_-2px_0_var(--v2-accent)]',
              'data-[disabled]:opacity-45',
            )}
          >
            {Icon ? <Icon className="size-4" strokeWidth={1.75} aria-hidden /> : null}
            {label}
            {count != null ? <span className="t-meta text-v2-faint t-tnum">{count}</span> : null}
          </TabsPrimitive.Tab>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Panel value={value} className={cn('outline-none', className)}>
      {children}
    </TabsPrimitive.Panel>
  );
}

export interface SegmentItem<V extends string> {
  value: V;
  label: string;
  icon?: LucideIcon;
}

/**
 * Conmutador de vista (Tabla | Tarjetas, Semana | 3 semanas | Plan). Grupo de
 * radio: Tab entra en el elegido, ←/→ cambian. Para NAVEGAR entre secciones de
 * página se usa Tabs, no esto.
 */
export function SegmentedControl<V extends string>({
  items,
  value,
  onValueChange,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: {
  items: SegmentItem<V>[];
  value: V;
  onValueChange: (value: V) => void;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label': string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, items.findIndex((i) => i.value === value));
  const move = (to: number) => {
    const next = (to + items.length) % items.length;
    onValueChange(items[next].value);
    refs.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      move(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      move(items.length - 1);
    }
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('inline-flex shrink-0 items-center rounded-ctl bg-v2-surface-2 p-0.5', className)}
    >
      {items.map(({ value: v, label, icon: Icon }, i) => {
        const on = v === value;
        return (
          <button
            key={v}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onValueChange(v)}
            className={cn(
              'relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] font-medium outline-none',
              'transition-[background-color,color,box-shadow] duration-[var(--v2-dur-fast)]',
              size === 'sm' ? 'h-6 px-2 text-[12px]' : 'h-7 px-2.5 text-[13px]',
              on
                ? 'bg-v2-surface text-v2-fg shadow-[0_0_0_1px_var(--v2-border),0_1px_2px_rgb(0_0_0/0.12)]'
                : 'text-v2-muted hover:text-v2-fg',
              'focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]',
            )}
          >
            {Icon ? <Icon className="size-3.5" strokeWidth={1.75} aria-hidden /> : null}
            {label}
          </button>
        );
      })}
    </div>
  );
}
