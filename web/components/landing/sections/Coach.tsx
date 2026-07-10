// Coach section — editorial split: a real portrait of the coach beside the trust
// copy. Server component: no client motion of its own; the single <Reveal> primitive
// owns the scroll animation (and already honors prefers-reduced-motion + no-JS by
// keeping content visible). The heading is the one 'use client' island, via the
// shared SectionHeading primitive.
//
// Message to the ATHLETE: there is a real coach behind your plan — not a template.
//
// Portrait: the real photo (warm black&white grade, `/landing/pablo.webp`, 4:5) sits
// inside the branded frame. The orange overlay composes the b&w photo into a
// black+orange DUOTONO (the brand grade of a portrait — accent-as-brand, not data
// viz). A bottom scrim keeps the role + place caption legible over the image.

import Image from 'next/image';
import { Section } from '@/components/landing/primitives/Section';
import { Reveal } from '@/components/landing/primitives/Reveal';
import { SectionHeading } from '@/components/landing/primitives/SectionHeading';
import { COACH } from '@/lib/landing/content';

export function Coach() {
  return (
    <Section id="pablo" label={COACH.label} labelledById="pablo-heading">
      <Reveal className="grid grid-cols-1 items-stretch gap-10 md:grid-cols-12 md:gap-14">
        {/* PORTRAIT — real photo in the branded duotono frame. */}
        <figure className="md:col-span-5">
          <div className="relative isolate aspect-[4/5] overflow-hidden rounded-[var(--r-xl)] border border-[color:var(--hairline)] bg-[color:var(--bg)]">
            {/* The portrait itself: warm b&w. object-top keeps his face in frame as
                the plate narrows on smaller columns. */}
            <Image
              src={COACH.photo.src}
              alt={COACH.photo.alt}
              fill
              sizes="(max-width: 768px) 100vw, 40vw"
              className="object-cover object-top"
            />
            {/* Brand orange tint — composes the b&w photo into a black+orange duotono.
                soft-light warms the plate toward brand while keeping his face natural.
                Accent is OK here: it's the brand grade of a portrait, not data viz. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(120%_85%_at_15%_0%,color-mix(in_srgb,var(--accent)_42%,transparent),transparent_55%)] mix-blend-soft-light"
            />
            {/* Bottom scrim so the caption stays legible over the photo. */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-3/5 bg-[linear-gradient(to_top,var(--bg),color-mix(in_srgb,var(--bg)_55%,transparent)_45%,transparent)]"
            />
            {/* Film grain — keeps the texture of the deliberate plate. */}
            <div aria-hidden="true" className="landing-grain absolute inset-0" />

            {/* Role + place line over the photo (no personal surname for now). */}
            <figcaption className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-7">
              <span className="font-display text-[clamp(2.4rem,8vw,3.6rem)] font-black italic leading-[0.9] tracking-tight text-[color:var(--fg)]">
                {COACH.plate.title}
              </span>
              <span className="max-w-[26ch] font-mono text-[11px] uppercase leading-relaxed tracking-[0.18em] text-[color:var(--muted)]">
                {COACH.plate.place}
              </span>
            </figcaption>
          </div>
        </figure>

        {/* COPY SIDE */}
        <div className="flex flex-col justify-center md:col-span-7">
          <SectionHeading id="pablo-heading">{COACH.heading}</SectionHeading>

          <p className="mt-6 max-w-[52ch] text-[color:var(--muted)] leading-relaxed">
            {COACH.body}
          </p>

          {/* Stat chips — big display value + small muted unit, hairline-separated. */}
          <dl className="mt-10 flex flex-col gap-px overflow-hidden rounded-[var(--r-l)] border border-[color:var(--hairline)] bg-[color:var(--hairline)] sm:flex-row">
            {COACH.stats.map((stat) => (
              <div
                key={stat.unit}
                className="flex flex-1 flex-col gap-1 bg-[color:var(--bg)] px-5 py-5"
              >
                <dt className="sr-only">{stat.unit}</dt>
                <dd className="font-display text-[clamp(1.8rem,3.2vw,2.6rem)] font-black italic leading-none tracking-tight text-[color:var(--fg)]">
                  {stat.value}
                </dd>
                <span className="text-[13px] leading-snug text-[color:var(--muted)]">
                  {stat.unit}
                </span>
              </div>
            ))}
          </dl>
        </div>
      </Reveal>
    </Section>
  );
}
