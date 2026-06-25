'use client';

// v2 · ORIENTACIÓN · PRIMITIVE 1 — IntroStrip + InfoDot (recall).
//
// One quiet line at the top of a section: "qué es + dónde encaja". An orange
// left rail marks it as orientation (never a status color). A "Cómo funciona"
// toggle expands ≤3 micro-steps. The ✕ dismisses it, leaving a recall ⓘ that the
// section places by its title; pressing it brings the strip back EXPANDED.
//
// Dismissal/expansion persist per coach + per section (useOrientationState).
//
// DENSITY (hard rules from the approved pass, enforced by the data shape, not by
// hope): `line` ≤ 1 sentence, `steps` ≤ 3 items, each step title ≤ 4 words / body
// ≤ 14 words. The dev-time guard below flags violations loudly in non-prod.
//
// Render contract: this is ONE primitive used by every section. The section owns
// the lifecycle via `useOrientationState` and renders <IntroStrip> when visible,
// or places <InfoDot> by its title when dismissed.

import type { ReactNode } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export interface IntroMicroStep {
  /** ≤ 4 words. */
  title: string;
  /** ≤ 14 words. May contain inline <b> via ReactNode. */
  body: ReactNode;
}

// ── Dev-time density guard ────────────────────────────────────────────────────
// Density is a HARD rule; surface violations in dev so they never reach prod.
function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function assertDensity(line: string, steps: IntroMicroStep[] | undefined): void {
  if (process.env.NODE_ENV === 'production') return;
  const warn = (msg: string) => console.warn(`[IntroStrip density] ${msg}`);
  if (wordCount(line) > 22) warn(`line is ${wordCount(line)} words (max 22): "${line}"`);
  if (steps && steps.length > 3) warn(`${steps.length} micro-steps (max 3)`);
  for (const s of steps ?? []) {
    if (wordCount(s.title) > 4) warn(`step title >4 words: "${s.title}"`);
    if (typeof s.body === 'string' && wordCount(s.body) > 14) {
      warn(`step body >14 words: "${s.body}"`);
    }
  }
}

export function IntroStrip({
  /** Leading glyph (Material Symbol name) — section identity, not a status. */
  icon,
  /** The single orientation line. ReactNode for inline <b>. ≤ 22 words. */
  line,
  /** ≤ 3 micro-steps shown under the "Cómo funciona" toggle. */
  steps,
  /** Whether the micro-steps are open. */
  expanded,
  onToggle,
  onDismiss,
}: {
  icon: string;
  line: ReactNode;
  steps?: IntroMicroStep[];
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
}) {
  if (typeof line === 'string') assertDensity(line, steps);
  const hasSteps = Boolean(steps && steps.length > 0);
  const open = expanded && hasSteps;

  return (
    <div className="relative mb-4 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] border-l-[3px] border-l-[color:var(--v2-accent)] bg-[color:var(--v2-surface)] py-3 pl-4 pr-3.5">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[color:var(--v2-accent)]" aria-hidden>
          <MIcon name={icon} size={18} />
        </span>
        <div className="flex-1 text-[13px] leading-relaxed text-[color:var(--v2-muted)] [&_b]:font-bold [&_b]:text-[color:var(--v2-fg)]">
          {line}
        </div>
        {hasSteps ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="v2-focus inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--v2-r-xs)] text-[11.5px] font-bold text-[color:var(--v2-accent)]"
          >
            <MIcon name={open ? 'expand_less' : 'expand_more'} size={15} />
            Cómo funciona
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Ocultar la orientación de esta sección"
          className="v2-focus -mr-0.5 ml-0.5 inline-flex shrink-0 rounded-[var(--v2-r-xs)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-muted)]"
        >
          <MIcon name="close" size={16} />
        </button>
      </div>

      {open ? (
        <div className="mt-3 flex flex-wrap gap-3 border-t border-[color:var(--v2-border)] pt-3">
          {steps!.map((s, i) => (
            <div key={i} className="flex min-w-[150px] flex-1 items-start gap-2.5">
              <span
                className="v2-num inline-flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold"
                style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
              >
                {i + 1}
              </span>
              <div>
                <div className="text-[12px] font-bold leading-snug text-[color:var(--v2-fg)]">
                  {s.title}
                </div>
                <div className="mt-0.5 text-[11.5px] leading-relaxed text-[color:var(--v2-muted)] [&_b]:font-bold [&_b]:text-[color:var(--v2-fg)]">
                  {s.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * InfoDot — the recall affordance shown by the section title once the IntroStrip
 * is dismissed. Pressing it brings the strip back (expanded). One tiny circle.
 */
export function InfoDot({
  onClick,
  label = 'Cómo funciona esta sección',
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'v2-focus inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[color:var(--v2-border-strong)] align-middle text-[11px] font-bold leading-none text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent)]',
        className,
      )}
    >
      <MIcon name="info" size={12} />
    </button>
  );
}
