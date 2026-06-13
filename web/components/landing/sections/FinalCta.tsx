'use client';

// FinalCta — the closing, full-bleed section (#empieza). A bookend to the hero:
// near-black bg with a faint warm orange glow + subtle film grain, a giant FAHYBRID
// watermark behind, and a centered kinetic headline → big primary CTA.
//
// Full-bleed by design: it does NOT use the <Section> padding primitive (which caps
// width + sets its own vertical rhythm). It owns its own near-full-height layout so
// the close reads dramatic. Width-capped inner is handled locally.
//
// Motion: only the KineticHeadline (already reduced-motion-safe — it no-ops the
// transform when prefers-reduced-motion is set) and the Reveal wrappers (same). The
// orange glow, grain and watermark are static CSS — nothing bespoke to guard. No
// top-level gsap/lenis/ogl; the only animated children are the client primitives.
//
// COLOR CONTRACT: orange (--accent) appears ONLY as the brand watermark tint, the
// ambient glow, the CTA fill and the focus ring — never as data. The glow + grain
// sit behind content with aria-hidden and pointer-events-none.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { FINAL, SECTION_IDS } from '@/lib/landing/content';
import { CHOOSE_PLAN_HREF } from '@/lib/landing/cta';
import { KineticHeadline } from '@/components/landing/primitives/KineticHeadline';
import { Reveal } from '@/components/landing/primitives/Reveal';
import { FahybridMark } from '@/components/landing/FahybridMark';

const HEADING_ID = `${SECTION_IDS.empieza}-heading`;

export function FinalCta() {
  return (
    <section
      id={SECTION_IDS.empieza}
      aria-labelledby={HEADING_ID}
      className="relative isolate flex min-h-[88vh] w-full flex-col items-center justify-center overflow-hidden bg-[color:var(--bg)] px-6 py-32 text-center md:py-44"
    >
      {/* Ambient warm glow — radial orange bloom rising from the lower-centre. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 55% at 50% 78%, color-mix(in oklab, var(--accent) 22%, transparent) 0%, transparent 70%)',
        }}
      />

      {/* Hairline-thin top edge so the bookend visually seals off the page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-[color:var(--hairline)]"
      />

      {/* Giant FAHYBRID watermark, very low opacity, behind everything. The mark
          carries its own role="img"+aria-label, so it's wrapped in an aria-hidden,
          presentational span to keep it out of the accessibility tree here. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2"
      >
        <FahybridMark
          color="var(--accent)"
          className="h-[clamp(7rem,28vw,18rem)] opacity-[0.04]"
        />
      </span>

      {/* Film grain overlay — subtle, above the glow but below text. */}
      <div
        aria-hidden="true"
        className="landing-grain pointer-events-none absolute inset-0 -z-10 opacity-50"
      />

      <div className="mx-auto flex max-w-[900px] flex-col items-center">
        <KineticHeadline
          as="h2"
          trigger="scroll"
          id={HEADING_ID}
          lines={[...FINAL.headlineLines]}
          className="text-[clamp(2.2rem,7vw,5.5rem)] text-balance"
        />

        <Reveal delay={0.1} className="mt-7 max-w-[34rem]">
          <p className="text-base leading-relaxed text-[color:var(--muted)] md:text-lg">
            {FINAL.sub}
          </p>
        </Reveal>

        <Reveal delay={0.18} className="mt-11">
          <Link
            href={CHOOSE_PLAN_HREF}
            className={cn(
              'group inline-flex items-center justify-center gap-2 rounded-[var(--r-pill)] px-9 py-4 text-base font-semibold transition-colors',
              'bg-[color:var(--accent)] text-[color:var(--accent-on)] hover:bg-[color:var(--accent-press)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]',
            )}
          >
            {FINAL.cta}
            <ArrowRight
              aria-hidden="true"
              strokeWidth={2}
              className="size-[1.125rem] transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </Reveal>

        <Reveal delay={0.24} className="mt-6">
          <p className="text-xs text-[color:var(--muted)]">{FINAL.trust}</p>
        </Reveal>
      </div>
    </section>
  );
}
