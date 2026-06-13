// "Por qué FAHYBRID" — the problem→promise section. Server component: motion is the
// staggered scroll-reveal of the items (<Reveal stagger>) plus the heading's kinetic
// scroll reveal, both delegated to client primitives (<Reveal>, <SectionHeading>) —
// no gsap/lenis/ogl runs directly in this file.
//
// Editorial (not generic cards): each of the three PROMISE.items reads as a short
// argument — the struck-through pain, then the bold promise turned by an orange
// arrow tick, then the supporting body. Three columns on desktop separated by
// hairlines; stacked with hairlines between on mobile.

import { ArrowRight } from 'lucide-react';

import { PROMISE } from '@/lib/landing/content';
import { Reveal } from '../primitives/Reveal';
import { Section } from '../primitives/Section';
import { SectionHeading } from '../primitives/SectionHeading';

export function ProblemPromise() {
  return (
    <Section id="por-que" label={PROMISE.label} labelledById="por-que-heading">
      <SectionHeading id="por-que-heading" className="max-w-[20ch]">
        {PROMISE.heading}
      </SectionHeading>

      <Reveal
        stagger
        className="mt-14 grid grid-cols-1 gap-y-12 md:mt-20 md:grid-cols-3 md:gap-x-12 md:gap-y-0"
      >
        {PROMISE.items.map((item, i) => (
          <div
            key={item.promise}
            className={[
              'flex flex-col',
              // Hairline dividers: top border on stacked mobile (skip first),
              // left border between desktop columns (skip first).
              i > 0 ? 'border-t border-[color:var(--hairline)] pt-12 md:border-t-0 md:pt-0' : '',
              i > 0 ? 'md:border-l md:border-[color:var(--hairline)] md:pl-12' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {/* The pain — small, muted, struck through. */}
            <p className="text-sm text-[color:var(--muted)] line-through decoration-[color:var(--muted)]/60 decoration-1">
              {item.pain}
            </p>

            {/* The promise — bold display, turned by an orange arrow tick. */}
            <p className="mt-3 flex items-start gap-2.5 font-display text-[clamp(1.25rem,2.4vw,1.6rem)] font-black italic leading-[1.1] text-[color:var(--fg)]">
              <ArrowRight
                aria-hidden="true"
                className="mt-1 size-5 shrink-0 text-[color:var(--accent)]"
                strokeWidth={2.25}
              />
              <span>{item.promise}</span>
            </p>

            {/* Supporting body. */}
            <p className="mt-4 text-[15px] leading-relaxed text-[color:var(--muted)]">
              {item.body}
            </p>
          </div>
        ))}
      </Reveal>
    </Section>
  );
}
