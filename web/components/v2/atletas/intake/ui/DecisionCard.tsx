// Decision-card chrome for the V2 coach intake-review screen. A numbered, titled
// panel built on the shared V2 <Card> base — the numbered badge + display title
// is what visually marks a DECISION card (left column) apart from a read-only
// rail card (right column). Pure presentation; the body is the caller's content.
//
// The optional danger left-stripe (used by the A-event card while its gate is
// open) reads from the V2 danger token. Tokens only, no hex.

import type { ReactNode } from 'react';
import { Card } from '@/components/v2/Card';
import { cn } from '@/lib/utils';

export function DecisionCard({
  step,
  title,
  eyebrow,
  subline,
  stripe = false,
  children,
  'aria-label': ariaLabel,
}: {
  /** 1..6 — the priority order of the decision. */
  step: number;
  title: string;
  /** Right-aligned chrome: micro-label string and/or a chip node. */
  eyebrow?: ReactNode;
  /** Optional sub-line under the header, aligned to the title text. */
  subline?: ReactNode;
  /** Danger left-stripe while a gate on this card is open. */
  stripe?: boolean;
  children: ReactNode;
  'aria-label'?: string;
}) {
  return (
    <Card className={cn('relative p-5', stripe && 'overflow-hidden')}>
      <section aria-label={ariaLabel ?? title}>
        {stripe ? (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] bg-[color:var(--v2-danger)]"
          />
        ) : null}
        <header className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-[26px] shrink-0 items-center justify-center rounded-full border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] text-[13px] font-bold text-[color:var(--v2-fg)]"
          >
            {step}
          </span>
          <h2 className="v2-display text-lg uppercase leading-tight text-[color:var(--v2-fg)]">
            {title}
          </h2>
          {eyebrow ? (
            <div className="ml-auto flex items-center gap-2 text-right">{eyebrow}</div>
          ) : null}
        </header>
        {subline ? (
          <p className="ml-[38px] mt-1 text-[12.5px] text-[color:var(--v2-muted)]">
            {subline}
          </p>
        ) : null}
        {/* Body indents under the title (aligned past the number badge) on ≥sm;
            full-bleed on narrow screens so controls keep their hit area. */}
        <div className="mt-3.5 sm:ml-[38px]">{children}</div>
      </section>
    </Card>
  );
}
