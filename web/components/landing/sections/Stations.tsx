// Stations — a horizontal snap gallery of REAL Fabrik-in-HYROX competition photos,
// closed by one wide banner. Social proof: the coach's club races what it coaches.
//
// Honest framing on purpose: the heading is "competimos lo que entrenamos", NOT "las
// 8 estaciones" — we only show six moments (3 official stations aren't pictured), so
// we never claim the full set. The numbers (01–06) are a gallery sequence, not the
// official HYROX station order.
//
// Server component. The carousel is NATIVE CSS scroll-snap — no scroll-jacking, no
// pinning, no client JS. The shared Reveal / SectionHeading islands own the only
// motion. The track is keyboard-accessible: it's a focusable region (arrow keys
// scroll it) with a focus-visible outline; the scrollbar is hidden and the peeking
// next card is the scroll affordance.

import Image from 'next/image';
import { Section } from '@/components/landing/primitives/Section';
import { Reveal } from '@/components/landing/primitives/Reveal';
import { SectionHeading } from '@/components/landing/primitives/SectionHeading';
import { SECTION_IDS, STATIONS } from '@/lib/landing/content';

export function Stations() {
  return (
    <Section
      id={SECTION_IDS.estaciones}
      label={STATIONS.label}
      labelledById="estaciones-heading"
    >
      <Reveal>
        <SectionHeading id="estaciones-heading">{STATIONS.heading}</SectionHeading>
        <p className="mt-5 max-w-[54ch] text-[15px] leading-relaxed text-[color:var(--muted)] md:text-base">
          {STATIONS.sub}
        </p>
      </Reveal>

      {/* SNAP CAROUSEL. overflow-x-auto + snap-x mandatory; each card snaps to start.
          Focusable region for keyboard scroll; scrollbar hidden for polish. */}
      <Reveal delay={0.05} className="mt-12 md:mt-14">
        <ul
          tabIndex={0}
          aria-label="Galería de estaciones de HYROX que entrenamos"
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto md:gap-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
        >
          {STATIONS.items.map((item) => (
            <li
              key={item.n}
              className="w-[70vw] shrink-0 snap-start sm:w-[280px] lg:w-[300px]"
            >
              <figure className="relative aspect-[3/4] overflow-hidden rounded-[var(--r-xl)] border border-[color:var(--hairline)] bg-[color:var(--surface)]">
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 640px) 70vw, 300px"
                  className="object-cover"
                />
                {/* Top scrim — keeps the accent number readable over any photo. */}
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black/45 to-transparent"
                />
                {/* Gallery index (accent), top-left — the landing's numbering voice. */}
                <span className="absolute left-4 top-3.5 font-mono text-[13px] font-medium tabular-nums tracking-[0.1em] text-[color:var(--accent)]">
                  {item.n}
                </span>
                {/* Bottom scrim + station name. */}
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/30 to-transparent"
                />
                <figcaption className="absolute inset-x-0 bottom-0 p-5">
                  <span className="font-display text-[clamp(1.4rem,4vw,1.7rem)] font-black italic leading-none tracking-tight text-white">
                    {item.name}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Reveal>

      {/* CLOSING BANNER — the epic competition moment (chest tattoo legible). Keeps
          its aspect ratio so nothing important is cropped at any width. */}
      <Reveal delay={0.1} className="mt-6 md:mt-8">
        <figure className="relative aspect-[1200/520] overflow-hidden rounded-[var(--r-xl)] border border-[color:var(--hairline)]">
          <Image
            src={STATIONS.banner.src}
            alt={STATIONS.banner.alt}
            fill
            sizes="(max-width: 1180px) 100vw, 1180px"
            className="object-cover object-[center_35%]"
          />
          {/* Left-weighted scrim so the caption reads over the busy scene. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_srgb,black_82%,transparent),color-mix(in_srgb,black_28%,transparent)_45%,transparent)]"
          />
          <figcaption className="absolute inset-0 flex flex-col justify-end gap-2 p-6 md:p-9">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--accent)]">
              {STATIONS.banner.location}
            </span>
            <span className="max-w-[22ch] font-display text-[clamp(1.4rem,3.6vw,2.3rem)] font-black italic leading-[0.95] tracking-tight text-white">
              {STATIONS.banner.caption}
            </span>
          </figcaption>
        </figure>
      </Reveal>
    </Section>
  );
}
