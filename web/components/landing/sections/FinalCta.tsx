// FinalCta — the closing, full-bleed section (#empieza). A bookend to the hero, now on
// a real photograph: an athlete just past the finish at HYROX Paris, wearing the
// FAHYBRID Program kit. The image is already graded to the brand duotono, so it needs
// no accent overlay — only scrims to seal it into the page and settle the centered copy.
//
// It's below the fold, so the photo is LAZY (no priority) — the opposite of the hero.
//
// Full-bleed by design: it does NOT use the <Section> padding primitive. It owns its own
// near-full-height, centered layout so the close reads dramatic.
//
// Motion: only the KineticHeadline (reduced-motion-safe) and the Reveal wrappers. The
// scrims + grain are static CSS, aria-hidden and pointer-events-none. No orange glow.

import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { FINAL, SECTION_IDS } from '@/lib/landing/content';
import { CHOOSE_PLAN_HREF } from '@/lib/landing/cta';
import { KineticHeadline } from '@/components/landing/primitives/KineticHeadline';
import { Reveal } from '@/components/landing/primitives/Reveal';
import { TrustLine } from '@/components/landing/TrustLine';

const HEADING_ID = `${SECTION_IDS.empieza}-heading`;

export function FinalCta() {
  return (
    <section
      id={SECTION_IDS.empieza}
      aria-labelledby={HEADING_ID}
      className="relative isolate flex min-h-[92svh] w-full flex-col items-center justify-center overflow-hidden bg-[color:var(--bg)] px-6 py-32 text-center md:py-44"
    >
      {/* Closing photograph (lazy — below the fold). object-position frames the face +
          chest so the FAHYBRID Program kit reads. */}
      <Image
        src={FINAL.photo.src}
        alt={FINAL.photo.alt}
        fill
        sizes="100vw"
        className="-z-20 object-cover object-[center_22%]"
      />

      {/* Uniform darken so the centered text holds over any part of the frame. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-black/45" />

      {/* Top + bottom scrims → solid --bg, sealing the bookend into the page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'linear-gradient(180deg, var(--bg) 0%, transparent 24%, transparent 76%, var(--bg) 100%)',
        }}
      />

      {/* Film grain — subtle, above the scrims but below text. */}
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
          className="text-[clamp(2.4rem,7vw,5.5rem)] uppercase text-balance"
        />

        <Reveal delay={0.1} className="mt-7 max-w-[34rem]">
          <p className="text-base leading-relaxed text-[color:var(--fg)]/85 md:text-lg">
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
          <TrustLine
            text={FINAL.trust}
            className="font-mono text-[11px] tracking-[0.14em] text-[color:var(--fg)]/70"
          />
        </Reveal>
      </div>
    </section>
  );
}
