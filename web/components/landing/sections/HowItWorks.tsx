'use client';

// HOW IT WORKS — four connected steps with a scroll-drawn accent line tying them
// together. The line is the single moving "thread": it fills from 0→1 as the section
// scrolls through the viewport (ScrollTrigger scrub on scaleX/scaleY).
//
// Layout: a vertical timeline on mobile (line runs down the left gutter), a
// horizontal 4-up on desktop (line runs across the top of the row).
//
// a11y / no-JS / reduced motion:
//   - steps are an ordered <ol> in the DOM, always visible (Reveal only lifts them in).
//   - reduced motion / no-JS → the line sits FULLY drawn (CSS scale-100) and steps are
//     visible with no transforms. The scrub effect only ever sets the from-state on the
//     client when motion is allowed.
//   - the line is decorative (aria-hidden); the ordered list carries the real sequence.

import { Fragment, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/lib/landing/motion';
import { HOW } from '@/lib/landing/content';
import { Section } from '@/components/landing/primitives/Section';
import { SectionHeading } from '@/components/landing/primitives/SectionHeading';
import { Reveal } from '@/components/landing/primitives/Reveal';

// The one timeframe we lift into accent wherever a step body mentions it — the "under
// 72h" promise. Data-driven (highlight the token wherever it appears) rather than
// hard-coding which step index carries it.
const HIGHLIGHT_TOKEN = '72h';

/** Render a step body, lifting HIGHLIGHT_TOKEN into brand accent where it occurs. */
function StepBody({ text }: { text: string }) {
  const parts = text.split(HIGHLIGHT_TOKEN);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 ? (
            <span className="font-medium text-[color:var(--accent)]">{HIGHLIGHT_TOKEN}</span>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

export function HowItWorks() {
  const scopeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = scopeRef.current;
    if (!root || typeof window === 'undefined') return;
    // Reduced motion: lines are rendered fully drawn (scale-100) by default. Skip.
    if (prefersReducedMotion()) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // Two orientation-specific draw lines exist (mobile vertical / desktop
      // horizontal); only one is visible at a time. We scrub both — the hidden one
      // is a no-op visually. Each fills along its own axis as the section scrolls.
      const lines = gsap.utils.toArray<HTMLElement>('[data-draw-line]');
      lines.forEach((line) => {
        const axis = line.dataset.drawAxis === 'y' ? 'scaleY' : 'scaleX';
        gsap.fromTo(
          line,
          { [axis]: 0 },
          {
            [axis]: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: root,
              start: 'top 70%',
              end: 'bottom 70%',
              scrub: true,
            },
          },
        );
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <Section id="como-funciona" label={HOW.label} labelledById="how-heading">
      <div ref={scopeRef}>
        <SectionHeading id="how-heading" className="max-w-[22ch]">
          {HOW.heading}
        </SectionHeading>

        {/*
          Timeline grid. The connecting line lives in its own positioned layers so it
          can span the full track behind the steps:
            - mobile: a vertical rail in a fixed-width left gutter.
            - desktop: a horizontal rail across the top of the 4-up row.
        */}
        <div className="relative mt-14 md:mt-20">
          {/* ── MOBILE: vertical rail (left gutter) ───────────────────────── */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-[15px] top-2 bottom-2 w-px md:hidden"
          >
            {/* static hairline track */}
            <div className="absolute inset-0 bg-[color:var(--hairline)]" />
            {/* drawn accent fill (origin top → grows down) */}
            <div
              data-draw-line
              data-draw-axis="y"
              className="absolute inset-0 origin-top scale-y-100 bg-[color:var(--accent)]"
            />
          </div>

          {/* ── DESKTOP: horizontal rail (top of row) ─────────────────────── */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 top-[15px] hidden h-px md:block"
          >
            <div className="absolute inset-0 bg-[color:var(--hairline)]" />
            <div
              data-draw-line
              data-draw-axis="x"
              className="absolute inset-0 origin-left scale-x-100 bg-[color:var(--accent)]"
            />
          </div>

          <Reveal
            as="ol"
            stagger
            className="relative grid gap-12 md:grid-cols-4 md:gap-8"
          >
            {HOW.steps.map((step) => (
              <li key={step.n} className="relative pl-12 md:pl-0 md:pt-12">
                {/* Node marker sitting ON the rail. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute z-10 grid place-items-center rounded-full',
                    'h-[31px] w-[31px] border border-[color:var(--accent)] bg-[color:var(--bg)]',
                    // mobile: centered on the left rail; desktop: on the top rail.
                    'left-0 top-[2px] md:left-0 md:top-0',
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                </span>

                {/* Ghost step numeral — decorative texture; the <ol> carries the real
                    sequence, so it's aria-hidden. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 top-0 z-0 select-none font-display text-[clamp(3.5rem,7vw,6rem)] font-black italic leading-none text-[color:var(--fg)] opacity-[0.07] md:top-8"
                >
                  {step.n}
                </span>

                <h3 className="relative z-10 mt-2 font-display italic font-black tracking-tight text-[color:var(--fg)] text-[clamp(1.375rem,2.4vw,1.75rem)] md:mt-0">
                  {step.title}
                </h3>

                <p className="relative z-10 mt-3 text-[15px] leading-relaxed text-[color:var(--muted)] md:max-w-[26ch]">
                  <StepBody text={step.body} />
                </p>
              </li>
            ))}
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
