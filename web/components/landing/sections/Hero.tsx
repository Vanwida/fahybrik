// FAHYBRID landing — Hero.
//
// A cinematic, full-viewport hero built on a REAL photograph: two Fabrik athletes
// running at HYROX Berlin. The image is the LCP element, so it ships in the server
// HTML with `priority` (never lazy). Layers, back to front:
//   1. next/image full-bleed race photo (object-cover, priority).
//   2. Left→right scrim (settles the text column) + bottom scrim (melts into --bg for
//      the next section) + film grain. NO orange glow, NO generative shader.
//   3. Foreground content, anchored bottom-left: eyebrow → oversized kinetic h1 (last
//      line in accent) → sub → CTAs → mono trust line.
//   4. A stations marquee band sealing the foot of the hero — the hero→page transition.
//
// Server component: the only motion is the h1's load-in (KineticHeadline, a client
// island) and the CSS marquee (paused under prefers-reduced-motion via landing.css).

import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { ArrowRight, ArrowDown } from 'lucide-react';

import { HERO, STATIONS_STRIP, SECTION_IDS } from '@/lib/landing/content';
import { CHOOSE_PLAN_HREF } from '@/lib/landing/cta';
import { KineticHeadline } from '@/components/landing/primitives/KineticHeadline';
import { SectionLabel } from '@/components/landing/primitives/SectionLabel';
import { TrustLine } from '@/components/landing/TrustLine';
import { cn } from '@/lib/utils';

/** Index of the headline line rendered in brand accent ('TU HYROX.'). */
const HERO_ACCENT_LINE = HERO.headlineLines.length - 1;

/**
 * One pass of the marquee content: every station name with a small orange square
 * separator. Rendered twice inside the track for a seamless -50% loop; the second
 * pass is aria-hidden so screen readers read the list once.
 */
function StationsGroup({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <span className="flex items-center" aria-hidden={duplicate || undefined}>
      {STATIONS_STRIP.map((station) => (
        <span key={station} className="flex items-center">
          <span className="font-mono text-[12px] uppercase tracking-[0.28em] text-[color:var(--muted)]">
            {station}
          </span>
          {/* Brand tick separator (same square as SectionLabel), not a glyph. */}
          <span
            aria-hidden="true"
            className="mx-5 size-[5px] shrink-0 rounded-[1px] bg-[color:var(--accent)]"
          />
        </span>
      ))}
    </span>
  );
}

/** Foot-of-hero marquee band: hairline-bordered, opaque, the transition to the page. */
function StationsMarquee() {
  return (
    <div className="relative z-10 border-y border-[color:var(--hairline)] bg-[color:var(--bg)]">
      <div className="landing-marquee py-3.5">
        <div className="landing-marquee__track">
          <StationsGroup />
          <StationsGroup duplicate />
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section
      id={SECTION_IDS.hero}
      aria-labelledby="hero-headline"
      className="relative flex min-h-[100svh] w-full flex-col overflow-hidden scroll-mt-20 bg-[color:var(--bg)] md:scroll-mt-24"
    >
      {/* LAYER 1 — the race photograph (LCP). On narrow screens the frame biases LEFT
          (object-[25%…]) so the two runners — who sit in the left ~15-48% of the shot —
          stay in view behind the headline instead of being cropped off; desktop recentres. */}
      <Image
        src="/landing/hero-berlin.webp"
        alt="Dos atletas de Fabrik corriendo en HYROX Berlín"
        fill
        priority
        quality={80}
        sizes="100vw"
        className="object-cover object-[25%_30%] lg:object-[center_30%]"
      />

      {/* LAYER 2 — scrims + grain. No orange glow. */}
      {/* (a) left→right scrim so the text column reads over any frame (~62% wide). */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, color-mix(in oklab, var(--bg) 94%, transparent) 0%, color-mix(in oklab, var(--bg) 55%, transparent) 34%, transparent 64%)',
        }}
      />
      {/* (b) bottom scrim → solid --bg, melting the photo into the next section. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 top-1/3"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--bg) 60%, transparent) 62%, var(--bg) 100%)',
        }}
      />
      {/* (c) film grain. */}
      <div aria-hidden="true" className="landing-grain absolute inset-0" />
      {/* (d) top scrim under the (transparent) fixed header, so the nav links keep
          contrast over the brighter top of the photo before the first scroll. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[140px]"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in oklab, var(--bg) 70%, transparent) 0%, transparent 100%)',
        }}
      />

      {/* LAYER 3 — foreground content, anchored bottom-left. */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1180px] flex-1 flex-col justify-end px-6 pt-28 pb-12 md:px-10 md:pb-16">
        <div className="max-w-[720px]">
          <SectionLabel className="mb-6">{HERO.eyebrow}</SectionLabel>

          {/* Film-title h1: oversized, uppercase, last line in accent. */}
          <KineticHeadline
            as="h1"
            trigger="load"
            id="hero-headline"
            accentLineIndex={HERO_ACCENT_LINE}
            lines={[...HERO.headlineLines]}
            className="max-w-[16ch] text-[clamp(3.4rem,9.5vw,8.5rem)] uppercase leading-[0.92]"
          />

          <p className="mt-7 max-w-[460px] text-[clamp(1rem,2.2vw,1.25rem)] leading-relaxed text-[color:var(--muted)]">
            {HERO.sub}
          </p>

          <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {/* Primary CTA — orange pill. */}
            <Link
              href={CHOOSE_PLAN_HREF}
              className={cn(
                'group inline-flex items-center justify-center gap-2 rounded-[var(--r-pill)]',
                'bg-[color:var(--accent)] px-7 py-3.5 text-base font-semibold text-[color:var(--accent-on)]',
                'transition-colors hover:bg-[color:var(--accent-press)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]',
              )}
            >
              {HERO.primaryCta}
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
              />
            </Link>

            {/* Secondary CTA — a down tick + label, scrolling to "cómo funciona". */}
            <a
              href={`#${SECTION_IDS.comoFunciona}`}
              className={cn(
                'group inline-flex items-center gap-2 rounded-[var(--r-s)] px-1 py-2 text-base font-medium text-[color:var(--fg)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]',
              )}
            >
              <ArrowDown
                aria-hidden="true"
                strokeWidth={2.25}
                className="size-4 text-[color:var(--accent)] transition-transform duration-300 group-hover:translate-y-0.5"
              />
              <span>{HERO.secondaryCta}</span>
            </a>
          </div>

          <TrustLine
            text={HERO.trust}
            className="mt-6 font-mono text-[11px] tracking-[0.14em] text-[color:var(--muted)]"
          />
        </div>
      </div>

      {/* LAYER 4 — stations marquee, sealing the foot of the hero. */}
      <StationsMarquee />
    </section>
  );
}
