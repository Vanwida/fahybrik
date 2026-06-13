// Pricing — three plans, the highlighted "Dobles" tier visually elevated. Server
// component: it only renders links and wraps the cards in <Reveal>, whose motion is
// client-side and already reduced-motion-safe. No bespoke animation here. CTAs point
// at appHref() (the app download) — the plan tier is chosen later, inside the app.
//
// COLOR CONTRACT: orange (--accent) is reserved for the brand + the highlighted CTA
// + focus rings only. Feature check icons use --ok (success green), never orange —
// that keeps orange from drifting into "data/meaning" territory.

import Link from 'next/link';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PRICING, SECTION_IDS } from '@/lib/landing/content';
import { tierStartHref, boxContactHref } from '@/lib/landing/cta';
import { Section } from '@/components/landing/primitives/Section';
import { SectionHeading } from '@/components/landing/primitives/SectionHeading';
import { Reveal } from '@/components/landing/primitives/Reveal';

const HEADING_ID = `${SECTION_IDS.precios}-heading`;

export function Pricing() {
  return (
    <Section id={SECTION_IDS.precios} label={PRICING.label} labelledById={HEADING_ID}>
      <SectionHeading id={HEADING_ID}>{PRICING.heading}</SectionHeading>

      <Reveal
        stagger
        className="mt-12 grid items-stretch gap-5 md:mt-16 md:grid-cols-3 md:gap-6"
      >
        {PRICING.plans.map((plan) => (
          <PlanCard key={plan.key} plan={plan} />
        ))}
      </Reveal>

      <Reveal className="mt-7">
        <p className="flex items-center justify-center gap-2 text-center text-sm font-medium text-[color:var(--fg)]">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
          {PRICING.guarantee}
        </p>
      </Reveal>

      <Reveal className="mt-6">
        <div className="flex flex-col items-start justify-between gap-4 rounded-[var(--r-l)] border border-[color:var(--hairline)] bg-[color:var(--surface)] px-6 py-5 sm:flex-row sm:items-center">
          <p className="text-sm text-[color:var(--muted)]">{PRICING.boxNote.text}</p>
          <Link
            href={boxContactHref()}
            className={cn(
              'group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-[color:var(--fg)] underline-offset-4 transition-colors hover:text-[color:var(--accent)] hover:underline',
              'rounded-[var(--r-s)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]',
            )}
          >
            {PRICING.boxNote.cta}
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </Reveal>

      <p className="mt-8 text-center text-xs text-[color:var(--muted)]">{PRICING.microcopy}</p>
    </Section>
  );
}

type Plan = (typeof PRICING.plans)[number];

function PlanCard({ plan }: { plan: Plan }) {
  const highlight = plan.highlight;

  return (
    <div
      className={cn(
        'relative flex h-full flex-col rounded-[var(--r-xl)] p-7 transition-colors md:p-8',
        highlight
          ? 'border-2 border-[color:var(--accent)] bg-[color:var(--surface-elevated)] md:-translate-y-2 md:scale-[1.015] md:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]'
          : 'border border-[color:var(--hairline)] bg-[color:var(--surface)]',
      )}
    >
      {highlight && plan.badge ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-[var(--r-pill)] bg-[color:var(--accent)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--accent-on)]">
          {plan.badge}
        </span>
      ) : null}

      <h3 className="font-display text-xl font-black italic tracking-tight">{plan.name}</h3>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="font-display text-[clamp(2.6rem,6vw,3.6rem)] font-black italic leading-none tracking-tight">
          {plan.price}
        </span>
        <span className="text-sm text-[color:var(--muted)]">{plan.period}</span>
      </div>

      <p className="mt-3 min-h-[2.5rem] text-sm leading-snug text-[color:var(--muted)]">
        {plan.tagline}
      </p>

      <ul className="mt-7 flex flex-1 flex-col gap-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm leading-snug">
            <Check
              aria-hidden="true"
              strokeWidth={2}
              className="mt-0.5 size-4 shrink-0 text-[color:var(--ok)]"
            />
            <span className="text-[color:var(--fg)]">{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href={tierStartHref(plan.key)}
        className={cn(
          'mt-8 inline-flex h-11 w-full items-center justify-center rounded-[var(--r-m)] px-5 text-sm font-semibold transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]',
          highlight
            ? 'bg-[color:var(--accent)] text-[color:var(--accent-on)] hover:bg-[color:var(--accent-press)]'
            : 'border border-[color:var(--outline)] bg-transparent text-[color:var(--fg)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]',
        )}
      >
        {plan.cta}
      </Link>
    </div>
  );
}
