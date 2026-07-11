'use client';

// AppShowcase — "LA APP" section. Split layout: copy on the left, a CSS-built
// premium iPhone mockup on the right showing a stylized "plan semanal" screen.
//
// The phone floats with a gentle scroll-scrubbed parallax (gsap ScrollTrigger).
// Reduced motion → fully static, content visible. No image asset is used; the
// device is built entirely from the design tokens.
//
// TODO: real app screenshots can replace the CSS mock.

import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';
import { EASE, prefersReducedMotion } from '@/lib/landing/motion';
import { APP } from '@/lib/landing/content';
import { Section } from '@/components/landing/primitives/Section';
import { SectionHeading } from '@/components/landing/primitives/SectionHeading';
import { Reveal } from '@/components/landing/primitives/Reveal';

// Parallax travel: the phone drifts a few percent of its own height across the
// scroll range. Kept small for premium restraint.
const PHONE_PARALLAX_PERCENT = 6;

// Stylized "plan semanal" screen — one week of sessions. Each day maps to a
// methodology group color so the screen reads like the real training app.
// Illustrative data for the marketing mock only.
interface PlanDay {
  day: string;
  title: string;
  metric: string;
  colorVar: string;
  today?: boolean;
}

const PLAN_DAYS: readonly PlanDay[] = [
  { day: 'LUN', title: 'Fuerza Base', metric: '5×3 · RPE 8', colorVar: '--grp-fuerza-base' },
  { day: 'MAR', title: 'Series de Running', metric: '6×800 · 3:30/km', colorVar: '--grp-series-running' },
  { day: 'MIÉ', title: 'Zona 2', metric: '8 km · Z2', colorVar: '--grp-zona2-recuperacion', today: true },
  { day: 'JUE', title: 'Ergómetros', metric: '5×500m row · RPE 7', colorVar: '--grp-series-ergometros' },
  { day: 'VIE', title: 'Simulación', metric: '4 estaciones · 28′', colorVar: '--grp-simulaciones-carrera' },
] as const;

export function AppShowcase() {
  const phoneRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = phoneRef.current;
    if (!el || typeof window === 'undefined') return;
    // Reduced motion: leave the phone static, exactly as rendered.
    if (prefersReducedMotion()) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { yPercent: PHONE_PARALLAX_PERCENT },
        {
          yPercent: -PHONE_PARALLAX_PERCENT,
          ease: EASE.inOut,
          scrollTrigger: {
            trigger: el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        },
      );
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <Section id="app" label={APP.label} labelledById="app-heading">
      <div className="grid items-center gap-14 lg:grid-cols-[1fr_minmax(0,30rem)] lg:gap-20">
        {/* Left: copy + feature list */}
        <div>
          <SectionHeading id="app-heading">{APP.heading}</SectionHeading>

          {/* Numbered rows — mono accent index + display title + body, hairline
              between. No icon boxes (that read as generic SaaS). */}
          <Reveal as="ul" stagger className="mt-10 border-t border-[color:var(--hairline)]">
            {APP.features.map((feature, i) => (
              <li
                key={feature.title}
                className="flex gap-5 border-b border-[color:var(--hairline)] py-6"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 shrink-0 font-mono text-[13px] tabular-nums tracking-[0.1em] text-[color:var(--accent)]"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-[clamp(1.25rem,2vw,1.375rem)] font-black italic leading-tight text-[color:var(--fg)]">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--muted)]">
                    {feature.body}
                  </p>
                </div>
              </li>
            ))}
          </Reveal>

          <Reveal>
            <p className="mt-9 text-sm text-[color:var(--muted)]">{APP.platformNote}</p>
          </Reveal>
        </div>

        {/* Right: CSS-built iPhone mockup + mono caption. */}
        <Reveal className="flex flex-col items-center gap-5 lg:items-end">
          <div ref={phoneRef} className="will-change-transform">
            <PhoneMock />
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
            {APP.screenCaption}
          </p>
        </Reveal>
      </div>
    </Section>
  );
}

// ── CSS-built device ──────────────────────────────────────────────────────────

function PhoneMock() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative w-[clamp(15rem,72vw,18rem)] shrink-0',
        'rounded-[2.5rem] border border-[color:var(--hairline)]',
        'bg-[color:var(--surface-elevated)] p-2.5',
        'shadow-[var(--shadow-modal)]',
      )}
    >
      {/* subtle top sheen on the bezel */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[2.5rem] bg-gradient-to-b from-[color:var(--outline)] to-transparent opacity-60"
      />

      {/* Screen */}
      <div className="relative overflow-hidden rounded-[2rem] bg-[color:var(--bg)]">
        {/* Dynamic island / notch */}
        <div className="absolute left-1/2 top-2.5 z-10 h-6 w-24 -translate-x-1/2 rounded-[var(--r-pill)] bg-black" />

        <div className="px-5 pb-6 pt-12">
          {/* App header */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[color:var(--muted)]">
                Esta semana
              </p>
              <p className="mt-1 font-display text-xl font-black italic leading-none tracking-tight text-[color:var(--fg)]">
                Más cerca de meta
              </p>
            </div>
            <span className="rounded-[var(--r-pill)] border border-[color:var(--hairline)] px-2 py-1 font-mono text-[10px] tracking-tight text-[color:var(--muted)]">
              S3/5
            </span>
          </div>

          {/* Day rows */}
          <ul className="mt-5 space-y-2">
            {PLAN_DAYS.map((d) => (
              <li
                key={d.day}
                className={cn(
                  'flex items-stretch gap-3 rounded-[var(--r-m)] border p-2.5',
                  d.today
                    ? 'border-[color:var(--accent)] bg-[color:var(--surface-elevated)]'
                    : 'border-[color:var(--hairline)] bg-[color:var(--surface)]',
                )}
              >
                {/* Methodology-group accent bar */}
                <span
                  className="w-1 shrink-0 rounded-[var(--r-s)]"
                  style={{ backgroundColor: `var(${d.colorVar})` }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-medium tracking-tight text-[color:var(--muted)]">
                      {d.day}
                    </span>
                    {d.today ? (
                      <span className="rounded-[var(--r-s)] bg-[color:var(--accent)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[color:var(--accent-on)]">
                        Hoy
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight text-[color:var(--fg)]">
                    {d.title}
                  </p>
                </div>
                <span className="self-center whitespace-nowrap font-mono text-[11px] tracking-tight text-[color:var(--muted)]">
                  {d.metric}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Home indicator */}
        <div className="absolute bottom-2 left-1/2 h-1 w-28 -translate-x-1/2 rounded-[var(--r-pill)] bg-[color:var(--outline)]" />
      </div>
    </div>
  );
}
