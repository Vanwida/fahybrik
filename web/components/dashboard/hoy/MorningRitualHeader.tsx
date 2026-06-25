'use client';

// MorningRitualHeader — zone 0 of /hoy (SPEC §4): the date, the bounded
// "N te necesitan hoy", the team-readiness ring, and the ⌘K hint. Sticky and
// collapses to a slim bar on scroll so the queue owns the viewport. When N=0 it
// shows the calm "Sin pendientes" line (the tend-to-zero win is celebrated by
// the queue's EmptyState, not here).

import { useEffect, useState } from 'react';
import { ReadinessRing } from '@/components/dashboard/ui';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

const HEADER_DATE = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function headerDateLabel(now: Date): string {
  // "lunes, 9 jun 2026" → "LUNES · 9 JUN 2026"
  const raw = HEADER_DATE.format(now).replace(/\./g, '').replace(', ', ' · ');
  return raw.toUpperCase();
}

/** Scroll past this many px → collapse the header. */
const COLLAPSE_AT = 64;

export interface MorningRitualHeaderProps {
  /** Bounded count of athletes needing the coach today (excludes snoozed/auto-resolved). */
  needCount: number;
  /** Team readiness 0–100, or null. */
  teamReadiness: number | null;
}

export function MorningRitualHeader({ needCount, teamReadiness }: MorningRitualHeaderProps) {
  const [collapsed, setCollapsed] = useState(false);

  // The ⌘K palette is owned by TriageQueue (client orchestrator); the header
  // dispatches a window event so the server page doesn't need to wire a callback
  // across the server/client boundary.
  const openPalette = () => window.dispatchEvent(new CustomEvent('hoy:open-palette'));

  useEffect(() => {
    const onScroll = () => setCollapsed(window.scrollY > COLLAPSE_AT);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const today = new Date();

  return (
    <header
      className={cn(
        'sticky top-0 z-30 -mx-4 border-b border-transparent bg-[color:var(--bg)] px-4 transition-all duration-200 motion-reduce:transition-none sm:-mx-6 sm:px-6',
        collapsed
          ? 'border-[color:var(--border-subtle)] py-3'
          : 'pb-5 pt-2',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {!collapsed ? (
            <span className="micro-label mb-2 block">{headerDateLabel(today)}</span>
          ) : null}
          <div className="flex items-baseline gap-3">
            <h1
              className={cn(
                'font-display font-black uppercase italic leading-none tracking-tight text-[color:var(--fg)] transition-all',
                collapsed ? 'text-[24px]' : 'text-[40px] md:text-[52px]',
              )}
            >
              Hoy<span className="text-[color:var(--accent)]">.</span>
            </h1>
            <p
              aria-live="polite"
              className={cn(
                'flex items-center gap-1.5 text-[color:var(--text-muted)]',
                collapsed ? 'text-[13px]' : 'text-[15px]',
              )}
            >
              <span aria-hidden className="text-[color:var(--surface-variant)]">
                ▸
              </span>
              {needCount === 0 ? (
                <span>Sin pendientes</span>
              ) : (
                <span>
                  <strong className="metric-num font-bold text-[color:var(--fg)]">
                    {needCount}
                  </strong>{' '}
                  te {needCount === 1 ? 'necesita' : 'necesitan'} hoy
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <ReadinessRing score={teamReadiness} size="sm" />
            <span className="micro-label leading-tight">
              Readiness
              <br />
              equipo
            </span>
          </div>
          <button
            type="button"
            onClick={openPalette}
            aria-label="Buscar atleta o ejecutar acción"
            aria-keyshortcuts="Meta+K Control+K"
            className={cn(
              'focus-ring inline-flex items-center gap-2 rounded-[var(--r-m)] border px-3 py-2',
              'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-muted)]',
              'hover:border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))] hover:text-[color:var(--fg)]',
            )}
          >
            <MIcon name="search" size={16} />
            <span className="hidden text-[12.5px] font-medium sm:inline">Buscar</span>
            <kbd className="metric-num hidden rounded-[var(--r-s)] border border-[color:var(--border-subtle)] px-1.5 py-0.5 text-[10px] sm:inline-block">
              ⌘K
            </kbd>
          </button>
        </div>
      </div>
    </header>
  );
}
