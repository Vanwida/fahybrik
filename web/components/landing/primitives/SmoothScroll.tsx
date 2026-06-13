'use client';

// Lenis smooth-scroll provider, integrated with GSAP ScrollTrigger.
//
// Lenis drives the real window scroll, so {children} render unchanged. We wire
// Lenis's RAF loop into gsap.ticker (single shared clock) and tell ScrollTrigger
// to update on every Lenis scroll — otherwise scroll-triggered reveals would lag
// or fire at the wrong positions.
//
// SSR-safe: all window/document access is inside useEffect (client-only). When the
// user prefers reduced motion we do nothing and let the browser scroll natively.

import { useEffect } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { prefersReducedMotion } from '@/lib/landing/motion';

interface SmoothScrollProps {
  children: React.ReactNode;
}

export function SmoothScroll({ children }: SmoothScrollProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Native scroll for reduced-motion users — no Lenis, no smoothing.
    if (prefersReducedMotion()) return;

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis();

    // Keep ScrollTrigger in sync with Lenis's virtual scroll position.
    lenis.on('scroll', ScrollTrigger.update);

    // Intercept in-page hash anchors so Lenis scrolls WITH a header offset; without
    // this Lenis lands the target heading flush under the fixed 64px header.
    // HEADER_OFFSET ≈ 64px header + 24px breathing room.
    const HEADER_OFFSET = 88;
    const onAnchorClick = (event: MouseEvent) => {
      // Respect modified / non-primary clicks (open in new tab, etc.).
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      // Same-page hash links only; ignore bare "#" / empty hashes.
      if (!href || href === '#' || !href.startsWith('#')) return;

      const targetEl = document.getElementById(href.slice(1));
      if (!targetEl) return;

      event.preventDefault();
      lenis.scrollTo(targetEl, { offset: -HEADER_OFFSET });
    };
    document.addEventListener('click', onAnchorClick);

    // Drive Lenis from gsap's ticker so there is a single RAF loop. gsap.ticker
    // time is in seconds; Lenis.raf expects milliseconds.
    const tick = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tick);
    // Lenis manages its own frame pacing; disable gsap's lag smoothing so the two
    // don't fight over dropped frames.
    gsap.ticker.lagSmoothing(0);

    return () => {
      document.removeEventListener('click', onAnchorClick);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33); // restore gsap default
      lenis.off('scroll', ScrollTrigger.update);
      lenis.destroy();
      // Kill ScrollTriggers this provider's lifecycle owns so re-mounts start clean.
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  return <>{children}</>;
}
