'use client';

// v2 · ORIENTACIÓN · PRIMITIVE 4 — ContextHint.
//
// One faint line next to a control that needs local context (e.g. the Secuencias
// matrix: "cada celda = la periodización para ese nivel y días"). Optional ⓘ
// affordance reveals exactly ONE more line. Color faint, never competes with the
// data. It's the last resort, not the first.
//
// DENSITY (hard rules): 1 visible line; the ⓘ reveals at most 1 more line. No
// "leer más", no nested accordions.

import { useState, type ReactNode } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export function ContextHint({
  /** The single visible hint line. ReactNode for inline <b>. */
  children,
  /** Optional second line, revealed by the ⓘ. One line only. */
  more,
  className,
}: {
  children: ReactNode;
  more?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('text-[11.5px] leading-snug text-[color:var(--v2-faint)]', className)}>
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[color:var(--v2-accent)] opacity-80" aria-hidden>
          <MIcon name="info" size={13} />
        </span>
        <span className="[&_b]:font-bold [&_b]:text-[color:var(--v2-muted)]">{children}</span>
        {more ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Ocultar detalle' : 'Más detalle'}
            className="v2-focus inline-flex shrink-0 rounded-[var(--v2-r-xs)] text-[color:var(--v2-faint)] hover:text-[color:var(--v2-accent)]"
          >
            <MIcon name={open ? 'expand_less' : 'expand_more'} size={14} />
          </button>
        ) : null}
      </div>
      {more && open ? (
        <p className="mt-1 pl-[19px] text-[11px] leading-relaxed text-[color:var(--v2-faint)] [&_b]:font-bold [&_b]:text-[color:var(--v2-muted)]">
          {more}
        </p>
      ) : null}
    </div>
  );
}
