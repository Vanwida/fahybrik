'use client';

// BulkActionBar — sticky bar that appears when ≥1 triage item is selected
// (SPEC §4 multi-select row: "[ 2 seleccionados ] [Resolver][Posponer 2d ▾]
// [Mensaje al grupo] [Deseleccionar]"). Controlled primitive: the parent owns the
// selection set and passes the count + action handlers. Renders nothing when
// count is 0 so it can stay mounted. Actions are plain configs so /hoy can wire
// Resolver / Posponer / Mensaje (and a snooze submenu) without the bar knowing
// them. An action may carry a `menu` of presets (e.g. Posponer ▾ Hoy / 2d / 1sem)
// rendered as a small keyboard-navigable popover.

import { useEffect, useRef, useState } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

export interface BulkActionMenuItem {
  key: string;
  label: string;
  onClick: () => void;
}

export interface BulkAction {
  key: string;
  label: string;
  icon?: string;
  /** Direct action. Omitted when the action only opens a `menu`. */
  onClick?: () => void;
  /** Preset submenu (e.g. snooze options). When set, the button toggles it. */
  menu?: ReadonlyArray<BulkActionMenuItem>;
  /** Primary actions get the approve/accent treatment; default = secondary. */
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export interface BulkActionBarProps {
  /** Number of selected items; 0 hides the bar. */
  count: number;
  actions: ReadonlyArray<BulkAction>;
  onClearSelection: () => void;
  className?: string;
}

const BTN_BASE =
  'focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-m)] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors disabled:opacity-50';

const SECONDARY_BTN =
  'border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] text-[color:var(--fg)] hover:bg-[color:var(--surface-container-high)]';
const PRIMARY_BTN =
  'border border-[color:color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--ok)_14%,var(--surface-container))] text-[color:var(--ok)] hover:bg-[color:color-mix(in_srgb,var(--ok)_24%,var(--surface-container))]';

export function BulkActionBar({ count, actions, onClearSelection, className }: BulkActionBarProps) {
  if (count <= 0) return null;

  return (
    <div
      role="toolbar"
      aria-label={`${count} seleccionados`}
      className={cn(
        'sticky bottom-4 z-40 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2',
        'card-elevated px-3 py-2',
        'animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none',
        className,
      )}
    >
      <span className="inline-flex items-center gap-2 px-2 text-[12.5px] font-semibold text-[color:var(--fg)]">
        <span className="metric-num rounded-[var(--r-s)] bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] px-1.5 py-0.5 text-[color:var(--accent)]">
          {count}
        </span>
        seleccionado{count === 1 ? '' : 's'}
      </span>

      <span aria-hidden className="h-5 w-px bg-[color:var(--border-subtle)]" />

      {actions.map((action) =>
        action.menu ? (
          <MenuAction key={action.key} action={action} />
        ) : (
          <button
            key={action.key}
            type="button"
            disabled={action.disabled}
            onClick={action.onClick}
            className={cn(BTN_BASE, action.variant === 'primary' ? PRIMARY_BTN : SECONDARY_BTN)}
          >
            {action.icon ? <MIcon name={action.icon} size={15} /> : null}
            {action.label}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={onClearSelection}
        className={cn(
          BTN_BASE,
          'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container)] hover:text-[color:var(--fg)]',
        )}
      >
        Deseleccionar
      </button>
    </div>
  );
}

/** An action whose button toggles a small preset popover (e.g. Posponer ▾). */
function MenuAction({ action }: { action: BulkAction }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Esc (the popover is small + non-modal).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={action.disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(BTN_BASE, action.variant === 'primary' ? PRIMARY_BTN : SECONDARY_BTN)}
      >
        {action.icon ? <MIcon name={action.icon} size={15} /> : null}
        {action.label}
        <MIcon name={open ? 'expand_less' : 'expand_more'} size={14} />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={action.label}
          className="absolute bottom-full left-0 z-10 mb-1.5 min-w-[10rem] overflow-hidden rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] py-1 shadow-[var(--shadow-modal)]"
        >
          {action.menu!.map((m) => (
            <button
              key={m.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                m.onClick();
              }}
              className="focus-ring flex w-full items-center px-3 py-2 text-left text-[12.5px] text-[color:var(--fg)] hover:bg-[color:var(--surface-container)]"
            >
              {m.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
