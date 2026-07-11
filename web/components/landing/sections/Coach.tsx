// Coach section — the star: a full-bleed editorial split. A real portrait of the coach
// runs to the left edge; the trust copy + stats sit on the right with generous padding.
// Server component: no client motion of its own; the single <Reveal> primitive owns the
// scroll animation (and already honors prefers-reduced-motion + no-JS by keeping content
// visible). The heading + label are client islands via the shared primitives.
//
// Message to the ATHLETE: there is a real person behind your plan — not a template.
//
// Portrait: the real photo (warm black&white grade, `/landing/pablo.webp`) is composed
// into a black+orange DUOTONO by the accent soft-light overlay (the brand grade of a
// portrait — accent-as-brand, not data viz). A bottom scrim keeps the name + place
// plate legible over the image.

import Image from 'next/image';
import { Section, LABEL_BOTTOM_MARGIN } from '@/components/landing/primitives/Section';
import { SectionLabel } from '@/components/landing/primitives/SectionLabel';
import { Reveal } from '@/components/landing/primitives/Reveal';
import { SectionHeading } from '@/components/landing/primitives/SectionHeading';
import { CountUp } from '@/components/landing/CountUp';
import { COACH } from '@/lib/landing/content';

const HEADING_ID = 'pablo-heading';

export function Coach() {
  return (
    <Section id="pablo" labelledById={HEADING_ID} bleed>
      <Reveal className="grid grid-cols-1 items-stretch lg:grid-cols-[45fr_55fr]">
        {/* PORTRAIT — full-bleed to the left edge; 4:5 on mobile, tall on desktop. */}
        <figure className="relative isolate aspect-[4/5] max-h-[600px] overflow-hidden bg-[color:var(--bg)] lg:aspect-auto lg:max-h-none lg:min-h-[78vh]">
          <Image
            src={COACH.photo.src}
            alt={COACH.photo.alt}
            fill
            sizes="(max-width: 1024px) 100vw, 45vw"
            className="object-cover object-top"
          />
          {/* Brand orange tint — composes the b&w photo into a black+orange duotono. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(120%_85%_at_15%_0%,color-mix(in_srgb,var(--accent)_42%,transparent),transparent_55%)] mix-blend-soft-light"
          />
          {/* Bottom scrim so the plate stays legible over the photo. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-3/5 bg-[linear-gradient(to_top,var(--bg),color-mix(in_srgb,var(--bg)_55%,transparent)_45%,transparent)]"
          />
          {/* Film grain — keeps the texture of the deliberate plate. */}
          <div aria-hidden="true" className="landing-grain absolute inset-0" />

          {/* Name + place plate, bottom-left. */}
          <figcaption className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-7 md:p-9">
            <span className="font-display text-[clamp(2.6rem,7vw,3.8rem)] font-black italic leading-[0.9] tracking-tight text-[color:var(--fg)]">
              {COACH.plate.title}
            </span>
            <span className="max-w-[26ch] font-mono text-[11px] uppercase leading-relaxed tracking-[0.18em] text-[color:var(--muted)]">
              {COACH.plate.place}
            </span>
          </figcaption>
        </figure>

        {/* COPY SIDE — generous padding; content measure capped for wide screens. */}
        <div className="flex flex-col justify-center px-6 py-14 md:px-10 md:py-16 lg:py-20 lg:pl-16 lg:pr-10">
          <div className="max-w-[640px]">
            <SectionLabel className={LABEL_BOTTOM_MARGIN}>{COACH.label}</SectionLabel>
            <SectionHeading id={HEADING_ID}>{COACH.heading}</SectionHeading>

            <p className="mt-6 max-w-[52ch] leading-relaxed text-[color:var(--muted)]">
              {COACH.body}
            </p>

            {/* Stats — no boxes. A row of three separated by vertical hairlines; on
                mobile they stack with horizontal hairlines so the big numbers never
                overflow a narrow column. flex-col-reverse keeps the value on top while
                DOM order stays term(dt)→description(dd). */}
            <dl className="mt-12 grid grid-cols-1 divide-y divide-[color:var(--hairline)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {COACH.stats.map((stat) => {
                const counts = 'countUp' in stat && stat.countUp;
                return (
                  <div
                    key={stat.unit}
                    className="flex flex-col-reverse gap-2 py-5 sm:py-0 sm:px-6 sm:first:pl-0 sm:last:pr-0"
                  >
                    <dt className="font-mono text-[11px] uppercase leading-snug tracking-[0.16em] text-[color:var(--muted)]">
                      {stat.unit}
                    </dt>
                    <dd className="font-display text-[clamp(3rem,6vw,5.5rem)] font-black italic leading-[0.9] tracking-[-0.02em] tabular-nums text-[color:var(--fg)]">
                      {counts ? <CountUp value={stat.value} /> : stat.value}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
