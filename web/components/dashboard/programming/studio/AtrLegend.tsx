'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import {
  ATR_PHASE_DESCRIPTION,
  ATR_PHASE_LABEL,
  ATR_PHASE_ORDER,
  type AtrBlockType,
} from '@/lib/dashboard/constants/atr-phases';
import { ROLE_HINT } from '@/lib/dashboard/coach/phase-roles';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

interface AtrLegendProps {
  /** Fase activa del microciclo — se resalta en la leyenda. */
  activePhase?: string | null;
  /**
   * Fases de periodización configuradas por el coach (N dinámico). Si se pasan,
   * el glosario las muestra ordenadas por sequence_order con sus nombres/labels
   * libres. Si va vacío (default), cae al set ATR legacy (ACC / TRANS / REAL)
   * → cero regresión visual mientras no exista la migración en prod.
   */
  coachPhases?: ReadonlyArray<MethodologyPhase>;
  className?: string;
}

/** Item normalizado del glosario, agnóstico de la fuente (coach o ATR legacy). */
interface LegendItem {
  code: string;
  label: string;
  description: string | null;
  isActive: boolean;
}

/**
 * Glosario de fases inline (fricción F10). Botón discreto que abre un popover
 * explicando las fases configuradas por el coach (N dinámico); sin fases → cae
 * al set ATR legacy (ACC / TRANS / REAL) con su label pedagógico. La fase activa
 * del microciclo se resalta. Accesible: botón con aria-expanded, cierre con
 * Escape y clic fuera, popover con role="dialog".
 */
export function AtrLegend({ activePhase, coachPhases = [], className }: AtrLegendProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const activeUpper = activePhase ? activePhase.toUpperCase() : null;

  const items: LegendItem[] =
    coachPhases.length > 0
      ? [...coachPhases]
          .sort((a, b) => a.sequence_order - b.sequence_order)
          .map((phase) => {
            const code = phase.code.toUpperCase();
            return {
              code,
              label: phase.label,
              description: phase.description ?? ROLE_HINT[phase.role] ?? null,
              isActive: activeUpper === code,
            };
          })
      : ATR_PHASE_ORDER.map((phase: AtrBlockType) => ({
          code: phase,
          label: ATR_PHASE_LABEL[phase],
          description: ATR_PHASE_DESCRIPTION[phase],
          isActive: activeUpper === phase,
        }));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? popoverId : undefined}
        className="focus-ring inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--accent)]/60 hover:text-[color:var(--fg)]"
      >
        <MIcon name="help" size={12} />
        <span>Fases</span>
      </button>

      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Glosario de fases"
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] p-3 shadow-xl"
        >
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
            Periodización
          </p>
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.code}
                className={cn(
                  'rounded-[var(--r-m)] border p-2',
                  item.isActive
                    ? 'border-[color:var(--accent)]/50 bg-[color:var(--accent)]/8'
                    : 'border-transparent',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-[color:var(--surface-container-high)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                    {item.code}
                  </span>
                  <span className="font-display text-sm font-bold text-[color:var(--fg)]">
                    {item.label}
                  </span>
                  {item.isActive ? (
                    <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-[color:var(--accent)]">
                      Activa
                    </span>
                  ) : null}
                </div>
                {item.description ? (
                  <p className="mt-1 text-[11px] leading-snug text-[color:var(--text-muted)]">
                    {item.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
