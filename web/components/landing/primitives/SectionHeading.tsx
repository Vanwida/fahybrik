'use client';

// SectionHeading — the ONE recipe for every standard section <h2> on the landing.
//
// Wraps KineticHeadline with the standardized display recipe + trigger='scroll', so
// headings are no longer hand-tuned per section file and EVERY section heading gets
// the same scroll-enter kinetic reveal (not just Hero/FinalCta). The Hero h1 and the
// FinalCta heading stay bespoke-big and do NOT use this.
//
// Reduced motion is handled inside KineticHeadline (lines sit visible, no transform).

import { cn } from '@/lib/utils';
import { KineticHeadline } from './KineticHeadline';

interface SectionHeadingProps {
  /** string => single line; array => explicit lines. */
  children: string | string[];
  /** Heading id, e.g. for aria-labelledby. */
  id?: string;
  align?: 'left' | 'center';
  className?: string;
}

export function SectionHeading({
  children,
  id,
  align = 'left',
  className,
}: SectionHeadingProps) {
  const lines = typeof children === 'string' ? [children] : children;

  return (
    <KineticHeadline
      as="h2"
      id={id}
      trigger="scroll"
      lines={lines}
      // The standardized section-heading recipe — single source of truth. Brand-scale
      // display type; still a step below the Hero h1 (which stays bespoke-big).
      className={cn(
        'tracking-tight leading-[0.98] text-[clamp(2.4rem,5vw,4.25rem)]',
        align === 'center' && 'text-center',
        className,
      )}
    />
  );
}
