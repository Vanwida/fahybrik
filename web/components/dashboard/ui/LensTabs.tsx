'use client';

// LensTabs — the saved-view "lens" strip for /hoy (SPEC §4 zone 1: "[ Todo 7 ]
// [ Sesiones perdidas 2 ][ Microciclo acaba 1 ]…"). Each lens shows a per-lens
// count and an active state; the active lens lives in the URL (`?lens=`). This
// primitive is CONTROLLED and presentational: the parent reads/writes the URL
// param and passes `activeLens` + `onLensChange`, so the component stays pure
// and testable. Implemented as a proper ARIA tablist with roving-tabindex
// arrow-key navigation (SPEC §9 "100% teclado").

import { useId, useRef } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

export interface Lens<K extends string = string> {
  key: K;
  label: string;
  /** Per-lens item count (rendered as a tabular badge). Omit to hide. */
  count?: number;
  /** Optional leading icon. */
  icon?: string;
}

export interface LensTabsProps<K extends string> {
  lenses: ReadonlyArray<Lens<K>>;
  activeLens: K;
  onLensChange: (key: K) => void;
  /** Accessible name for the tablist. */
  label?: string;
  className?: string;
}

export function LensTabs<K extends string>({
  lenses,
  activeLens,
  onLensChange,
  label = 'Lentes',
  className,
}: LensTabsProps<K>) {
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = Math.max(
    0,
    lenses.findIndex((l) => l.key === activeLens),
  );

  const focusTab = (index: number) => {
    const n = lenses.length;
    const wrapped = ((index % n) + n) % n;
    tabRefs.current[wrapped]?.focus();
    onLensChange(lenses[wrapped]!.key);
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusTab(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusTab(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusTab(0);
        break;
      case 'End':
        e.preventDefault();
        focusTab(lenses.length - 1);
        break;
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {lenses.map((lens, index) => {
        const active = lens.key === activeLens;
        return (
          <button
            key={lens.key}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            role="tab"
            id={`${baseId}-tab-${lens.key}`}
            aria-selected={active}
            // Roving tabindex: only the active tab is in the tab order.
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => onLensChange(lens.key)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'focus-ring inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border px-3.5 py-1.5 text-xs font-semibold transition',
              'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-muted)]',
              'hover:border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))] hover:text-[color:var(--fg)]',
              active &&
                'border-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--surface-card))] text-[color:var(--accent)]',
            )}
          >
            {lens.icon ? <MIcon name={lens.icon} size={14} /> : null}
            {lens.label}
            {lens.count != null ? (
              <span
                className={cn(
                  'metric-num rounded-[var(--r-s)] px-1.5 text-[10px] font-bold',
                  active
                    ? 'bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] text-[color:var(--accent)]'
                    : 'bg-[color:var(--surface-container)] text-[color:var(--text-muted)]',
                )}
              >
                {lens.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
