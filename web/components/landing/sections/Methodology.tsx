'use client';

// SECOND SIGNATURE — horizontal pinned-scroll showcase of what an athlete's
// training covers: the pillars of a complete HYROX/DEKA plan (running, fuerza,
// ergómetros, estaciones, simulaciones...). Framed as benefits for the athlete,
// never as an internal library of "blocks" or "sessions".
//
// On a wide, non-touch, motion-OK viewport the strip PINS: while the user scrolls
// vertically, a horizontal track of the pillar cards translates right→left, and a
// thin bottom bar reflects horizontal progress. The vertical scroll distance the pin
// consumes equals the track's horizontal overflow, so motion feels 1:1.
//
// Everywhere else — reduced-motion, touch, or a narrow viewport — there is NO pin.
// The exact same cards render in a native horizontal scroll-snap strip that is fully
// swipe-, wheel- and keyboard-reachable. Content is always in the DOM and visible.
//
// gsap.matchMedia() owns the desktop branch: it builds the pin only when the media
// query matches and tears it down on resize across the breakpoint (re-measuring so we
// never hold a stale width). Coexists with Lenis via the SmoothScroll provider.

import Image from 'next/image';
import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';
import { METHODOLOGY } from '@/lib/landing/content';
import { Section, LABEL_BOTTOM_MARGIN } from '@/components/landing/primitives/Section';
import { SectionLabel } from '@/components/landing/primitives/SectionLabel';
import { SectionHeading } from '@/components/landing/primitives/SectionHeading';
import { Reveal } from '@/components/landing/primitives/Reveal';

const HEADING_ID = 'metodologia-heading';

// Below this width (or on coarse pointers) we never pin — the native scroll-snap
// strip is the better, fully-usable experience on small / touch screens.
const PIN_MIN_WIDTH = 1024; // px — matches Tailwind `lg`

const { label, heading, sub, closingLabel, pillars } = METHODOLOGY;

type Pillar = (typeof pillars)[number];

function PillarCard({ pillar, index }: { pillar: Pillar; index: number }) {
  const colorVar = `var(${pillar.colorVar})`;
  const tintVar = `var(${pillar.colorVar}-tint)`;
  const number = String(index + 1).padStart(2, '0');
  const total = String(pillars.length).padStart(2, '0');
  const hasPhoto = Boolean(pillar.image);

  return (
    <article
      className={cn(
        // min-w drives the horizontal track width; snap-start makes the fallback
        // strip land cleanly on each card. `isolate` contains the photo blend layers
        // so they never bleed onto the page behind the card.
        // Mobile/tablet (snap mode): FIXED width so the body wraps inside the card
        // instead of stretching the card to the text's intrinsic width (which
        // overflowed the viewport). At lg the pin takes over → reset to min-w-[360px].
        'group/card relative isolate flex w-[80vw] max-w-[420px] snap-start flex-col justify-between overflow-hidden',
        'min-h-[19rem] rounded-[var(--r-l)] border border-[color:var(--hairline)]',
        'p-7 sm:w-[62vw] md:min-h-[21rem] md:p-8 lg:w-auto lg:max-w-none lg:min-w-[360px]',
      )}
      style={{
        // The pillar's tint washed over --surface gives each card its own quiet
        // identity while staying dark-theme-correct (tint is the color at ~0.14 alpha).
        // On photo cards this is the dark base the low-opacity image sits on; on the
        // taper card (no photo) it stays the full flat tint.
        backgroundColor: `color-mix(in oklab, ${tintVar} 60%, var(--surface))`,
      }}
    >
      {/* PHOTO BACKGROUND — a real Fabrik-in-HYROX moment for this capacity, held at low
          opacity over the dark card so it reads as a moody texture and never fights the
          text. Three layers below the content keep it legible (WCAG AA): the photo, a
          pillar-color wash mixed INTO it (soft-light — identity, not a flat block), and a
          scrim that darkens the top (index) and goes solid --surface at the bottom (name
          + body), leaving the middle band for the photo. */}
      {pillar.image && (
        <>
          <Image
            src={pillar.image}
            alt=""
            aria-hidden="true"
            fill
            sizes="(max-width: 640px) 78vw, (max-width: 1024px) 64vw, 360px"
            className="pointer-events-none absolute inset-0 -z-10 select-none object-cover opacity-[0.36]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 mix-blend-soft-light"
            style={{ backgroundColor: `color-mix(in oklab, ${colorVar} 45%, transparent)` }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                'linear-gradient(to bottom, color-mix(in oklab, var(--surface) 58%, transparent) 0%, transparent 24%, transparent 48%, color-mix(in oklab, var(--surface) 74%, transparent) 68%, var(--surface) 86%)',
            }}
          />
        </>
      )}

      {/* Top hairline in the pillar color — a thin signature stripe. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 z-0 h-px opacity-60"
        style={{ backgroundColor: colorVar }}
      />
      {/* Left accent bar — color is reinforcement, never the only signal. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 z-0 w-[3px]"
        style={{ backgroundColor: colorVar }}
      />
      {/* Large ghosted numeral, set well back — color identity, decorative. Over a photo
          it embosses a touch stronger so it still reads through the darker zones. */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -right-2 -bottom-6 z-0 select-none font-display text-[9rem] leading-none font-black italic tabular-nums md:text-[11rem]',
          hasPhoto ? 'opacity-[0.12]' : 'opacity-[0.08]',
        )}
        style={{ color: colorVar }}
      >
        {number}
      </span>

      {/* Top row: a color dot + the readable index. Over a photo the index goes white and
          picks up a soft shadow so it stays crisp against the (lighter) top of the image;
          flat cards keep the muted counter. */}
      <div className="relative z-10 flex items-center justify-between gap-4">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: colorVar }}
        />
        <span
          className={cn(
            'font-mono text-[11px] tracking-[0.18em]',
            hasPhoto
              ? 'text-[color:var(--fg)] [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]'
              : 'text-[color:var(--muted)]',
          )}
        >
          {number} / {total}
        </span>
      </div>

      {/* Bottom: the pillar name leads, benefit below. Both sit over the solid bottom of
          the scrim, so contrast holds (name ~white on --surface, body --muted on --surface). */}
      <div className="relative z-10">
        <h3 className="font-display text-[clamp(1.6rem,3vw,2.1rem)] leading-[1.05] font-black italic text-[color:var(--fg)]">
          {pillar.name}
        </h3>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-[color:var(--muted)]">
          {pillar.body}
        </p>
      </div>
    </article>
  );
}

export function Methodology() {
  // The pinned frame ScrollTrigger pins.
  const pinRef = useRef<HTMLDivElement>(null);
  // The viewport that clips the moving track.
  const viewportRef = useRef<HTMLDivElement>(null);
  // The horizontal track that translates on x.
  const trackRef = useRef<HTMLDivElement>(null);
  // The progress fill (width driven imperatively by ScrollTrigger progress).
  const progressRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const pin = pinRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const progress = progressRef.current;
    if (!pin || !viewport || !track || !progress) return;

    gsap.registerPlugin(ScrollTrigger);

    const mm = gsap.matchMedia();

    mm.add(
      `(min-width: ${PIN_MIN_WIDTH}px) and (pointer: fine) and (prefers-reduced-motion: no-preference)`,
      () => {
        const ctx = gsap.context(() => {
          const getDistance = () => Math.max(0, track.scrollWidth - viewport.clientWidth);

          const tween = gsap.to(track, {
            x: () => -getDistance(),
            ease: 'none',
          });

          ScrollTrigger.create({
            animation: tween,
            trigger: pin,
            start: 'top top',
            end: () => `+=${getDistance()}`,
            pin: true,
            anticipatePin: 1,
            scrub: true,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              progress.style.transform = `scaleX(${self.progress})`;
            },
          });
        }, pin);

        return () => ctx.revert();
      },
    );

    return () => mm.revert();
  }, []);

  return (
    <Section id="metodologia" labelledById={HEADING_ID} bleed className="overflow-hidden">
      {/* Top block — normal centered container. */}
      <div className="mx-auto max-w-[1180px] px-6 md:px-10">
        <SectionLabel className={LABEL_BOTTOM_MARGIN}>{label}</SectionLabel>
        <SectionHeading id={HEADING_ID} className="max-w-[18ch]">
          {heading}
        </SectionHeading>
        <Reveal
          as="div"
          className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
        >
          <p className="max-w-[52ch] text-base leading-relaxed text-[color:var(--muted)]">
            {sub}
          </p>
          <p className="shrink-0 font-display text-[clamp(1.75rem,4.5vw,2.75rem)] leading-none font-black italic text-[color:var(--accent)]">
            {closingLabel}
          </p>
        </Reveal>
      </div>

      {/* Pinned horizontal track. Labelled by the section heading via the outer Section. */}
      <div
        ref={pinRef}
        className="relative mt-14 md:mt-20 lg:flex lg:min-h-screen lg:flex-col lg:justify-center"
      >
        <div
          ref={viewportRef}
          className={cn(
            'overflow-x-auto overscroll-x-contain scroll-smooth',
            'snap-x snap-mandatory lg:overflow-hidden',
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            // Focus ring when keyboard users land on the scrollable region.
            'rounded-[var(--r-m)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]',
          )}
          tabIndex={0}
          role="group"
          aria-label="Pilares de tu entrenamiento, desliza para verlos todos"
        >
          <div
            ref={trackRef}
            className="flex w-max gap-5 px-6 pb-2 md:gap-6 md:px-10 lg:will-change-transform"
          >
            {pillars.map((pillar, i) => (
              <PillarCard key={pillar.id} pillar={pillar} index={i} />
            ))}
          </div>
        </div>

        {/* Horizontal progress — neutral track, accent fill. Decorative. */}
        <div
          aria-hidden="true"
          className="mx-6 mt-8 h-px overflow-hidden bg-[color:var(--hairline)] md:mx-10 lg:mt-12"
        >
          <div
            ref={progressRef}
            className="h-full origin-left bg-[color:var(--accent)]"
            style={{ transform: 'scaleX(0)' }}
          />
        </div>
      </div>
    </Section>
  );
}
