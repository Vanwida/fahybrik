// Section wrapper — enforces consistent vertical rhythm + max width across the
// landing. Server component. Sections inherit the page --bg (transparent here).
//
// If `label` is set, an aria-labelledby relationship is wired automatically: the
// SectionLabel gets `${id}-label` and the <section> references it, giving each
// section a programmatic accessible name. Pass `labelledById` to point at a custom
// heading id instead (e.g. a KineticHeadline rendered inside `children`).

import { cn } from '@/lib/utils';
import { SectionLabel } from './SectionLabel';

/**
 * The ONE eyebrow(label)->heading bottom margin for the whole landing. Exported so
 * bespoke sections (Hero/Methodology) can reuse the exact value instead of guessing.
 */
export const LABEL_BOTTOM_MARGIN = 'mb-5 md:mb-6';

interface SectionProps {
  id?: string;
  /** Eyebrow text. When set, also names the section via aria-labelledby. */
  label?: string;
  /** Override the aria-labelledby target (e.g. a heading id inside children). */
  labelledById?: string;
  /** Full-bleed: drop the centered max-width container. */
  bleed?: boolean;
  className?: string;
  /** Class for the inner container (ignored when bleed). */
  innerClassName?: string;
  children: React.ReactNode;
}

export function Section({
  id,
  label,
  labelledById,
  bleed = false,
  className,
  innerClassName,
  children,
}: SectionProps) {
  const autoLabelId = label && id ? `${id}-label` : undefined;
  const labelledBy = labelledById ?? autoLabelId;

  const content = (
    <>
      {label ? (
        // SINGLE SOURCE for eyebrow(label)->heading spacing. Any section using the
        // standard eyebrow inherits this; Hero/Methodology bespoke labels must match.
        <SectionLabel id={autoLabelId} className={LABEL_BOTTOM_MARGIN}>
          {label}
        </SectionLabel>
      ) : null}
      {children}
    </>
  );

  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      // scroll-mt clears the fixed 64px header on native anchor jumps (reduced-motion
      // path, no-JS, and the SmoothScroll-disabled case) so a targeted heading isn't
      // hidden under the header.
      className={cn('scroll-mt-20 md:scroll-mt-24 py-24 md:py-36', className)}
    >
      {bleed ? (
        content
      ) : (
        <div className={cn('mx-auto max-w-[1180px] px-6 md:px-10', innerClassName)}>
          {content}
        </div>
      )}
    </section>
  );
}
