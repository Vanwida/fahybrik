// "Por qué FAHYBRID" — the problem→promise section. Server component: motion is the
// staggered scroll-reveal of the items (<Reveal stagger>) plus the heading's kinetic
// scroll reveal, both delegated to client primitives (<Reveal>, <SectionHeading>) —
// no gsap/lenis/ogl runs directly in this file.
//
// Editorial layout: on lg the big heading sticks in the left column while the three
// PROMISE.items scroll past on the right as hairline-separated rows. Each row reads as
// a short argument — a ghost index, the struck-through pain, the bold promise turned by
// an orange arrow, then the supporting body. Mobile: a natural stack.

import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PROMISE } from '@/lib/landing/content';
import { Reveal } from '../primitives/Reveal';
import { Section } from '../primitives/Section';
import { SectionHeading } from '../primitives/SectionHeading';

export function ProblemPromise() {
  return (
    <Section id="por-que" label={PROMISE.label} labelledById="por-que-heading">
      <div className="grid grid-cols-1 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:gap-x-20">
        {/* Left: the heading, sticky on desktop so it holds while the rows scroll. */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SectionHeading id="por-que-heading" className="max-w-[15ch]">
            {PROMISE.heading}
          </SectionHeading>
        </div>

        {/* Right: three stacked rows, hairline-separated. */}
        <Reveal stagger className="flex flex-col">
          {PROMISE.items.map((item, i) => (
            <div
              key={item.promise}
              className={cn(
                'relative pr-16 md:pr-20',
                i > 0 && 'mt-10 border-t border-[color:var(--hairline)] pt-10',
              )}
            >
              {/* Ghost index, top-right. Decorative — the order is carried by the DOM. */}
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute right-0 select-none font-mono tabular-nums leading-none text-[color:var(--fg)] opacity-[0.12]',
                  'text-[clamp(2.25rem,5vw,3.25rem)]',
                  i > 0 ? 'top-10' : 'top-0',
                )}
              >
                {String(i + 1).padStart(2, '0')}
              </span>

              {/* The pain — small, muted, struck through. */}
              <p className="font-mono text-[13px] uppercase tracking-[0.12em] text-[color:var(--muted)] line-through decoration-[color:var(--muted)]/60 decoration-1">
                {item.pain}
              </p>

              {/* The promise — bold display, turned by an orange arrow tick. */}
              <p className="mt-3 flex items-start gap-2.5 font-display text-[clamp(1.6rem,2.4vw,2.1rem)] font-black italic leading-[1.08] text-[color:var(--fg)]">
                <ArrowRight
                  aria-hidden="true"
                  className="mt-1 size-6 shrink-0 text-[color:var(--accent)]"
                  strokeWidth={2.25}
                />
                <span>{item.promise}</span>
              </p>

              {/* Supporting body. */}
              <p className="mt-4 max-w-[520px] text-[15px] leading-relaxed text-[color:var(--muted)]">
                {item.body}
              </p>
            </div>
          ))}
        </Reveal>
      </div>
    </Section>
  );
}
