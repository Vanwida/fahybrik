'use client';

// RaceAnalytics — animated HYROX splits chart.
//
// Each of the 8 stations is a horizontal bar whose width ∝ its current split
// seconds (scaled to the slowest station). On scroll-enter the bars grow from
// 0 → full, staggered.
//
// ENCODING (the legend mirrors this exactly):
//   • Solid neutral bar (--z2)  = current race split for that station.
//   • Solid amber bar (--warning) + "foco IA" chip = a `weak` station the IA turns
//     into the focus of the next block. On those, an improvement delta vs the
//     previous race is shown in --ok (e.g. "−7s").
//   • Dashed ghost bar          = the previous race split, drawn a hair longer
//     behind the current bar to imply race-over-race improvement.
//
// DATA-VIZ COLORS ONLY: neutral bars use --z2, weak bars use --warning, the
// improvement delta uses --ok, the ghost uses --muted. Orange (--accent) is
// reserved for brand/CTA and is never used here.
//
// SSR-safe: gsap only runs inside useLayoutEffect, guarded for no-DOM, inside a
// gsap.context that is reverted on cleanup. Reduced-motion → bars render at their
// final width immediately (the from-state is only applied on the client when motion
// is allowed).
//
// TODO: real athlete data — splits, weak flags and the ghost "previous race" deltas
// are illustrative until live race ingestion lands.

import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { Clock } from 'lucide-react';

import { ANALYTICS } from '@/lib/landing/content';
import { DURATION, EASE, STAGGER, prefersReducedMotion } from '@/lib/landing/motion';
import { Section } from '@/components/landing/primitives/Section';
import { Reveal } from '@/components/landing/primitives/Reveal';
import { SectionHeading } from '@/components/landing/primitives/SectionHeading';

/** Illustrative "previous race" slowdown per station, so each ghost bar reads a hair
 *  longer than the current bar — implying improvement race-over-race. */
const PREV_RACE_FACTOR = 1.09;

/** Format a duration in seconds as m:ss. */
function formatSplit(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Improvement vs the previous race, in whole seconds, as e.g. "−7s". */
function formatImprovement(currentSeconds: number, prevSeconds: number): string {
  const gained = Math.round(prevSeconds - currentSeconds);
  return `−${gained}s`;
}

export function RaceAnalytics() {
  const chartRef = useRef<HTMLUListElement>(null);

  // Scale every bar to the slowest station so the longest split spans the track.
  const maxSeconds = Math.max(...ANALYTICS.stations.map((s) => s.seconds));

  useLayoutEffect(() => {
    const el = chartRef.current;
    if (!el || typeof window === 'undefined') return;
    // Reduced motion: bars stay at their final width (set inline). No tween.
    if (prefersReducedMotion()) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const bars = gsap.utils.toArray<HTMLElement>('[data-bar]');
      const ghosts = gsap.utils.toArray<HTMLElement>('[data-ghost]');

      // Bars + ghosts grow from the left edge.
      gsap.set([...bars, ...ghosts], { transformOrigin: 'left center', scaleX: 0 });

      gsap.to(ghosts, {
        scaleX: 1,
        duration: DURATION.base,
        ease: EASE.out,
        stagger: STAGGER,
        scrollTrigger: { trigger: el, start: 'top 80%', once: true },
      });
      gsap.to(bars, {
        scaleX: 1,
        duration: DURATION.slow,
        ease: EASE.out,
        stagger: STAGGER,
        delay: 0.08,
        scrollTrigger: { trigger: el, start: 'top 80%', once: true },
      });
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <Section id="analitica" label={ANALYTICS.label} labelledById="analitica-heading">
      <Reveal>
        <SectionHeading id="analitica-heading">{ANALYTICS.heading}</SectionHeading>
        <p className="mt-5 max-w-[58ch] text-[15px] leading-relaxed text-[color:var(--muted)] md:text-base">
          {ANALYTICS.sub}
        </p>
      </Reveal>

      <Reveal
        delay={0.05}
        className="mt-12 rounded-[var(--r-xl)] border border-[color:var(--hairline)] bg-[color:var(--surface)] p-5 md:mt-14 md:p-8"
      >
        {/* Chart legend — mirrors the bar encodings exactly. */}
        <div className="mb-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-[color:var(--muted)]">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-4 rounded-[var(--r-s)] bg-[color:var(--z2)]"
            />
            Carrera actual
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-4 rounded-[var(--r-s)] bg-[color:var(--warning)]"
            />
            Punto débil
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-4 rounded-[var(--r-s)] border border-dashed border-[color:var(--muted)]/70"
            />
            Carrera anterior
          </span>
        </div>

        <ul ref={chartRef} className="flex flex-col gap-4">
          {ANALYTICS.stations.map((station) => {
            const widthPct = (station.seconds / maxSeconds) * 100;
            const prevSeconds = station.seconds * PREV_RACE_FACTOR;
            const prevWidthPct = Math.min((prevSeconds / maxSeconds) * 100, 100);
            const barColorVar = station.weak ? 'var(--warning)' : 'var(--z2)';
            const splitLabel = formatSplit(station.seconds);

            return (
              <li key={station.key} className="grid grid-cols-[7.5rem_1fr] items-center gap-x-4 md:grid-cols-[10rem_1fr] md:gap-x-6">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[color:var(--fg)] md:text-sm">
                    {station.name}
                  </p>
                  {station.weak ? (
                    <span
                      className="mt-1 inline-flex max-w-full items-center rounded-[var(--r-pill)] px-2 py-0.5 text-[10px] font-medium leading-tight tracking-wide text-[color:var(--warning)]"
                      style={{
                        backgroundColor:
                          'color-mix(in srgb, var(--warning) 14%, transparent)',
                      }}
                    >
                      a mejorar
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-3">
                  {/* Track */}
                  <div className="relative h-7 flex-1 overflow-hidden rounded-[var(--r-m)] bg-[color:var(--surface-elevated)]">
                    {/* Ghost "previous race" bar — dashed outline + faint fill,
                        sits behind, a hair longer than the current bar. */}
                    <div
                      data-ghost
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 rounded-[var(--r-m)] border border-dashed"
                      style={{
                        width: `${prevWidthPct}%`,
                        borderColor: 'color-mix(in srgb, var(--muted) 70%, transparent)',
                        backgroundColor: 'color-mix(in srgb, var(--muted) 12%, transparent)',
                      }}
                    />
                    {/* Current race bar. */}
                    <div
                      data-bar
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 rounded-[var(--r-m)]"
                      style={{ width: `${widthPct}%`, backgroundColor: barColorVar }}
                    />
                  </div>
                  {/* Improvement vs previous race — only on the weak (focus) stations. */}
                  {station.weak ? (
                    <span
                      className="shrink-0 font-mono text-[12px] tabular-nums text-[color:var(--ok)] md:text-[13px]"
                      aria-label={`${station.name}: ${formatImprovement(station.seconds, prevSeconds)} respecto a la carrera anterior`}
                    >
                      {formatImprovement(station.seconds, prevSeconds)}
                    </span>
                  ) : null}
                  <span
                    className="w-12 shrink-0 text-right font-mono text-[13px] tabular-nums text-[color:var(--fg)] md:text-sm"
                    aria-label={`${station.name}: ${splitLabel}`}
                  >
                    {splitLabel}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Footer metric — the SUM of the 8 station splits. This is the total time
            ON the stations; it is NOT the RoxZone (transition) time, which is a
            separate metric we don't have demo data for yet. */}
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-[color:var(--hairline)] pt-5">
          <span className="inline-flex items-center gap-2 text-[13px] text-[color:var(--muted)]">
            <Clock aria-hidden="true" className="size-3.5 stroke-[1.5] text-[color:var(--z3)]" />
            Tiempo total en estaciones
          </span>
          <span className="font-mono text-[13px] tabular-nums text-[color:var(--fg)] md:text-sm">
            {formatSplit(
              ANALYTICS.stations.reduce((acc, s) => acc + s.seconds, 0),
            )}
          </span>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <p className="mt-7 max-w-[60ch] text-[13px] leading-relaxed text-[color:var(--muted)] md:text-sm">
          Cada semana trabajamos tus puntos débiles. Carrera tras carrera, los splits que
          hoy están en{' '}
          <span className="text-[color:var(--warning)]">ámbar</span> se acercan al resto —
          y ver ese progreso, tiempo a tiempo, es lo que engancha.
        </p>
      </Reveal>
    </Section>
  );
}
