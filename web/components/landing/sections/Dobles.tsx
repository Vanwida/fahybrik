// Dobles section — the social hook of HYROX. A full-bleed editorial split that MIRRORS
// Coach: same device (photo + duotono/scrim/grain + plate, numbered content), but flipped
// — photo on the RIGHT, content on the LEFT — so the two big photo sections alternate
// sides and give the page rhythm. Server component: the single <Reveal> owns the scroll-in
// and the heading is the client island via SectionHeading.
//
// Photo (dobles.webp, already brand-graded) gets the same accent-duotono + scrim + grain
// treatment as Coach for a consistent look, anchored from the right, with a GENERIC athlete
// plate (project rule: no named athletes in captions).
//
// DOM order is photo → content so that on mobile (single column) the photo sits on TOP and
// the content below; on lg the order is swapped (content left, photo right) via `order`.

import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { ArrowRight } from 'lucide-react';

import { Section, LABEL_BOTTOM_MARGIN } from '@/components/landing/primitives/Section';
import { SectionLabel } from '@/components/landing/primitives/SectionLabel';
import { Reveal } from '@/components/landing/primitives/Reveal';
import { SectionHeading } from '@/components/landing/primitives/SectionHeading';
import { DOBLES, SECTION_IDS } from '@/lib/landing/content';
import { CHOOSE_PLAN_HREF } from '@/lib/landing/cta';
import { cn } from '@/lib/utils';

const HEADING_ID = 'dobles-heading';

export function Dobles() {
  return (
    <Section id={SECTION_IDS.dobles} labelledById={HEADING_ID} bleed>
      <Reveal className="grid grid-cols-1 items-stretch lg:grid-cols-[55fr_45fr]">
        {/* PHOTO — DOM-first (mobile TOP); on lg it sits RIGHT (order-2). 4:5 on mobile,
            tall on desktop — mirrors Coach, flipped. */}
        <figure className="relative isolate aspect-[4/5] max-h-[600px] overflow-hidden bg-[color:var(--bg)] lg:order-2 lg:aspect-auto lg:max-h-none lg:min-h-[78vh]">
          <Image
            src={DOBLES.photo.src}
            alt={DOBLES.photo.alt}
            fill
            sizes="(max-width: 1024px) 100vw, 45vw"
            className="object-cover object-center"
          />
          {/* Brand orange tint — duotono; anchored from the RIGHT (photo sits right). */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(120%_85%_at_85%_0%,color-mix(in_srgb,var(--accent)_42%,transparent),transparent_55%)] mix-blend-soft-light"
          />
          {/* Bottom scrim so the plate stays legible over the photo. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-3/5 bg-[linear-gradient(to_top,var(--bg),color-mix(in_srgb,var(--bg)_55%,transparent)_45%,transparent)]"
          />
          {/* Film grain. */}
          <div aria-hidden="true" className="landing-grain absolute inset-0" />

          {/* Generic athlete plate, bottom-right. */}
          <figcaption className="absolute inset-x-0 bottom-0 flex justify-end p-7 md:p-9">
            <span className="font-mono text-[11px] uppercase leading-relaxed tracking-[0.18em] text-[color:var(--muted)]">
              {DOBLES.plateCaption}
            </span>
          </figcaption>
        </figure>

        {/* CONTENT — DOM-second (mobile below); on lg it sits LEFT (order-1). Mirror of
            Coach's copy padding: breathing room toward the photo (pr-16), page margin on
            the outer edge (pl-10). */}
        <div className="flex flex-col justify-center px-6 py-14 md:px-10 md:py-16 lg:order-1 lg:py-20 lg:pl-10 lg:pr-16">
          <div className="max-w-[640px]">
            <SectionLabel className={LABEL_BOTTOM_MARGIN}>{DOBLES.label}</SectionLabel>
            <SectionHeading id={HEADING_ID}>{[...DOBLES.heading]}</SectionHeading>

            <p className="mt-6 max-w-[52ch] leading-relaxed text-[color:var(--muted)]">
              {DOBLES.body}
            </p>

            {/* Numbered rows — mono accent index + display title + body, hairline between.
                Same device as AppShowcase. */}
            <ul className="mt-10 border-t border-[color:var(--hairline)]">
              {DOBLES.items.map((item) => (
                <li
                  key={item.n}
                  className="flex gap-5 border-b border-[color:var(--hairline)] py-6"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 shrink-0 font-mono text-[13px] tabular-nums tracking-[0.1em] text-[color:var(--accent)]"
                  >
                    {item.n}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-[clamp(1.25rem,2vw,1.375rem)] font-black italic leading-tight text-[color:var(--fg)]">
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--muted)]">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {/* CTA (same primary pill) + note. */}
            <div className="mt-10">
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
                {DOBLES.cta}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
                />
              </Link>
              <p className="mt-4 font-mono text-[12px] tracking-[0.04em] text-[color:var(--muted)]">
                {DOBLES.note}
              </p>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
