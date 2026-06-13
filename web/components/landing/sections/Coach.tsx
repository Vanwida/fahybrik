// Coach section — editorial split: a deliberate portrait PLATE (no real photo asset
// yet) beside the trust copy. Server component: no client motion of its own; the
// single <Reveal> primitive owns the scroll animation (and already honors
// prefers-reduced-motion + no-JS by keeping content visible). The heading is the one
// 'use client' island, via the shared SectionHeading primitive.
//
// Message to the ATHLETE: there is a real coach behind your plan — not a template.
// Brand-forward (FAHYBRID), no personal name for now.
//
// Portrait: instead of an empty box, a designed graphic plate — orange→black grade,
// a fan of diagonal training-color bars, a large brand glyph, the role in
// display-italic, and a place line. It reads as an intentional brand artifact until
// the real grade-duotono photo lands.

import { Section } from '@/components/landing/primitives/Section';
import { Reveal } from '@/components/landing/primitives/Reveal';
import { SectionHeading } from '@/components/landing/primitives/SectionHeading';
import { FahybridMark } from '@/components/landing/FahybridMark';
import { COACH } from '@/lib/landing/content';

// The methodology, made visible: one diagonal bar per training group, fanned across
// the plate. Group colors are domain data — NEVER the brand accent (orange) here.
const PLATE_GROUP_BARS = [
  'var(--grp-fuerza-base)',
  'var(--grp-series-ergometros)',
  'var(--grp-series-running)',
  'var(--grp-zona2-recuperacion)',
  'var(--grp-wods-metcons)',
  'var(--grp-simulaciones-carrera)',
] as const;

export function Coach() {
  return (
    <Section id="pablo" label={COACH.label} labelledById="pablo-heading">
      <Reveal className="grid grid-cols-1 items-stretch gap-10 md:grid-cols-12 md:gap-14">
        {/* PORTRAIT PLATE — a deliberate brand artifact, not an empty box.
            TODO: foto real de Pablo (grade duotono negro+naranja) — swap this plate
            for the real portrait asset when it lands. */}
        <figure className="md:col-span-5">
          <div className="relative isolate flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-[var(--r-xl)] border border-[color:var(--hairline)] bg-[color:var(--bg)] p-7">
            {/* Orange→black grade — the duotono stand-in. Accent is OK here: it's the
                brand grade of a portrait, not data viz. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_15%_0%,color-mix(in_srgb,var(--accent)_42%,transparent),transparent_55%),linear-gradient(160deg,var(--surface-elevated),var(--bg)_72%)]"
            />
            {/* Diagonal fan of group-color bars — the methodology made visible. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 -z-10 flex w-2/3 -skew-x-12 justify-end gap-1.5 opacity-90"
            >
              {PLATE_GROUP_BARS.map((color) => (
                <span
                  key={color}
                  className="h-full w-2.5 rounded-full"
                  style={{
                    background: `linear-gradient(to bottom, ${color}, transparent 88%)`,
                  }}
                />
              ))}
            </div>
            {/* Film grain — sells the "deliberate plate" texture. */}
            <div aria-hidden="true" className="landing-grain absolute inset-0 -z-10" />

            {/* Top: large brand glyph as the plate's anchor (self-labels "FAHYBRID"). */}
            <FahybridMark
              className="h-12 w-auto opacity-90 md:h-14"
              color="var(--accent-on)"
            />

            {/* Bottom: role + place line (no personal name for now). */}
            <figcaption className="flex flex-col gap-2">
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
            {/* "los dos boxes" phrasing kept — box names unknown. TODO: box names. */}
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
                  {/* TODO: real number */}
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
