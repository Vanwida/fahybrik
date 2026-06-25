'use client';

// AthleteQuickview — lightweight, NON-blocking hover/focus card that surfaces a
// few status dimensions + deep-links for one athlete (SPEC §9 AthleteQuickview:
// "Mensaje / Plan / Tendencias"). It is NOT a modal: it never traps focus and
// dismisses on blur or Esc so the triage queue stays usable. Open/close is
// controlled by the trigger (hover + focus-within), which keeps it composable.
//
// Presentational/controlled: the page supplies the resolved dimensions and the
// hrefs. The quickview neither fetches nor ranks.

import { useEffect, useRef } from 'react';
import { Link } from '@/i18n/navigation';
import type { SemanticTier } from '@/lib/dashboard/constants/status-semantics';
import { SEMANTIC_TIER_META } from '@/lib/dashboard/constants/status-semantics';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

export interface QuickviewDimension {
  /** Short metric name, e.g. "Readiness", "Adherencia". */
  label: string;
  /** Resolved value text, e.g. "28%", "3/5". */
  value: string;
  /** Tier for the value's color/icon (never color alone — value text carries it). */
  tier: SemanticTier;
}

export interface AthleteQuickviewProps {
  athleteName: string;
  /** Up to ~4 status dimensions (SPEC §9). */
  dimensions: ReadonlyArray<QuickviewDimension>;
  /** Deep-links; omit any to hide its action. */
  messageHref?: string;
  planHref?: string;
  trendsHref?: string;
  /** Close request (Esc / outside) — the trigger controls visibility. */
  onClose?: () => void;
  className?: string;
}

export function AthleteQuickview({
  athleteName,
  dimensions,
  messageHref,
  planHref,
  trendsHref,
  onClose,
  className,
}: AthleteQuickviewProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Esc dismisses without trapping focus (non-blocking contract).
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={`Resumen de ${athleteName}`}
      className={cn(
        'card-elevated w-64 p-3 text-left',
        'animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none',
        className,
      )}
    >
      <p className="mb-2 truncate text-sm font-semibold text-[color:var(--fg)]">{athleteName}</p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {dimensions.slice(0, 4).map((dim) => {
          const meta = SEMANTIC_TIER_META[dim.tier];
          return (
            <div key={dim.label} className="min-w-0">
              <dt className="micro-label truncate">{dim.label}</dt>
              <dd
                className="metric-num mt-0.5 flex items-center gap-1 text-[13px] font-semibold"
                style={{ color: meta.token }}
              >
                <MIcon name={meta.icon} size={13} weight={600} />
                <span className="truncate">{dim.value}</span>
              </dd>
            </div>
          );
        })}
      </dl>

      {messageHref || planHref || trendsHref ? (
        <div className="mt-3 flex items-center gap-1 border-t border-[color:var(--border-subtle)] pt-2">
          {messageHref ? (
            <QuickAction href={messageHref} icon="forum" label="Mensaje" />
          ) : null}
          {planHref ? <QuickAction href={planHref} icon="calendar_month" label="Plan" /> : null}
          {trendsHref ? (
            <QuickAction href={trendsHref} icon="trending_up" label="Tendencias" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'focus-ring inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r-s)] px-2 py-2',
        'text-[11px] font-semibold text-[color:var(--text-muted)]',
        'hover:bg-[color:var(--surface-container)] hover:text-[color:var(--fg)]',
      )}
    >
      <MIcon name={icon} size={15} />
      {label}
    </Link>
  );
}
