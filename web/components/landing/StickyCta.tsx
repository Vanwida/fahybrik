'use client';

// Mobile-only sticky CTA bar. Appears once the hero has scrolled out of view and hides
// again over the final CTA (the big button is already there, and it must never cover the
// footer). Driven by two IntersectionObservers — no magic scroll threshold.
//
// a11y: when hidden it slides off-screen AND its link is taken out of the tab order +
// the bar is aria-hidden, so keyboard/SR users never land on an off-screen control.
// Motion: a single translate-y slide, disabled under prefers-reduced-motion.

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { STICKY_CTA, SECTION_IDS } from '@/lib/landing/content';
import { CHOOSE_PLAN_HREF } from '@/lib/landing/cta';

export function StickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hero = document.getElementById(SECTION_IDS.hero);
    const finalCta = document.getElementById(SECTION_IDS.empieza);
    // No hero on this page (e.g. a non-landing marketing route) → never show.
    if (!hero) return;

    // visible = the hero has fully scrolled out AND the final CTA is not yet in view.
    let pastHero = false;
    let finalInView = false;
    const update = () => setVisible(pastHero && !finalInView);

    const heroObserver = new IntersectionObserver(
      ([entry]) => {
        pastHero = !entry.isIntersecting;
        update();
      },
      { threshold: 0 },
    );
    heroObserver.observe(hero);

    let finalObserver: IntersectionObserver | undefined;
    if (finalCta) {
      finalObserver = new IntersectionObserver(
        ([entry]) => {
          finalInView = entry.isIntersecting;
          update();
        },
        { threshold: 0 },
      );
      finalObserver.observe(finalCta);
    }

    return () => {
      heroObserver.disconnect();
      finalObserver?.disconnect();
    };
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 lg:hidden',
        'transition-transform duration-300 ease-out motion-reduce:transition-none',
        visible ? 'translate-y-0' : 'translate-y-full',
      )}
    >
      <div className="border-t border-[color:var(--hairline)] bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--muted)]">
            {STICKY_CTA.note}
          </span>
          <Link
            href={CHOOSE_PLAN_HREF}
            tabIndex={visible ? 0 : -1}
            className={cn(
              'inline-flex h-10 shrink-0 items-center justify-center rounded-[var(--r-pill)]',
              'bg-[color:var(--accent)] px-5 text-sm font-semibold text-[color:var(--accent-on)]',
              'transition-colors hover:bg-[color:var(--accent-press)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]',
            )}
          >
            {STICKY_CTA.cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
