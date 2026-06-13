// FAQ — accessible accordion built on native <details>/<summary>. Keyboard-operable
// out of the box (Enter/Space toggles, focus moves natively), and degrades gracefully
// (closed items still expose their answer to find-in-page via the native disclosure).
// The <Reveal> + the SectionHeading kinetic reveal own the only motion, and both
// already honor prefers-reduced-motion. SectionHeading wraps KineticHeadline, which is
// a client component, so this file is 'use client'.
//
// Refinement over a default accordion: hairline-separated rows, no native ▸ marker
// (list-none + ::-webkit-details-marker:hidden), a thin lucide Plus that morphs to a
// minus by rotating 45° when open (group-open), and the answer in --muted with a soft
// open-state fade. Comfortable padding, ~56rem centered column.

'use client';

import { Plus } from 'lucide-react';

import { FAQ } from '@/lib/landing/content';
import { Reveal } from '../primitives/Reveal';
import { Section } from '../primitives/Section';
import { SectionHeading } from '../primitives/SectionHeading';

export function Faq() {
  return (
    <Section id="faq" label={FAQ.label} labelledById="faq-heading">
      <SectionHeading id="faq-heading" className="max-w-[18ch]">
        {FAQ.heading}
      </SectionHeading>

      <Reveal className="mx-auto mt-12 max-w-[56rem] md:mt-16">
        <ul className="border-t border-[color:var(--hairline)]">
          {FAQ.items.map((item) => (
            <li key={item.q} className="border-b border-[color:var(--hairline)]">
              <details className="group">
                <summary
                  className="flex cursor-pointer list-none items-center justify-between gap-6 rounded py-6 outline-none transition-colors [&::-webkit-details-marker]:hidden hover:text-[color:var(--accent)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)] md:py-7"
                >
                  <span className="font-display text-[clamp(1.05rem,2vw,1.3rem)] font-black italic leading-snug text-[color:var(--fg)]">
                    {item.q}
                  </span>
                  <Plus
                    aria-hidden="true"
                    strokeWidth={2}
                    className="size-5 shrink-0 text-[color:var(--muted)] transition-[transform,color] duration-300 ease-out group-open:rotate-45 group-open:text-[color:var(--accent)]"
                  />
                </summary>
                <p className="max-w-[52ch] pb-7 text-[15px] leading-relaxed text-[color:var(--muted)] md:pb-8">
                  {item.a}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </Reveal>
    </Section>
  );
}
