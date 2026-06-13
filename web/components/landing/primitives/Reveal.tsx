'use client';

// THE single scroll-reveal primitive. Every landing section uses this — one motion
// language, no bespoke per-section tweens.
//
// SEO/a11y/no-JS: children are ALWAYS in the DOM and fully visible by default. The
// effect only HIDES them (gsap.set opacity:0 + y) once, on the client, immediately
// before animating them back in. So:
//   - no-JS / crawlers       → content visible (never hidden).
//   - reduced-motion         → content visible, no animation.
//   - normal                 → fade + lift in on scroll-enter (once).

import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';
import { DURATION, EASE, REVEAL_Y, STAGGER, prefersReducedMotion } from '@/lib/landing/motion';

type RevealTag = keyof React.JSX.IntrinsicElements;

interface RevealProps {
  children: React.ReactNode;
  /** Element to render. Default 'div'. */
  as?: RevealTag;
  /** Extra delay (s) before the tween starts. */
  delay?: number;
  /** translateY (px) the element travels from. Default REVEAL_Y. */
  y?: number;
  className?: string;
  /** Stagger the direct children instead of animating the wrapper as one block. */
  stagger?: boolean;
}

export function Reveal({
  children,
  as = 'div',
  delay = 0,
  y = REVEAL_Y,
  className,
  stagger = false,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const Tag = as as React.ElementType;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    // Reduced motion: leave content visible exactly as rendered. No tween.
    if (prefersReducedMotion()) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const targets: gsap.TweenTarget = stagger ? Array.from(el.children) : el;
      gsap.set(targets, { opacity: 0, y });
      gsap.to(targets, {
        opacity: 1,
        y: 0,
        duration: DURATION.base,
        ease: EASE.out,
        delay,
        stagger: stagger ? STAGGER : 0,
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          once: true,
        },
      });
    }, el);

    return () => ctx.revert();
  }, [delay, y, stagger]);

  return (
    <Tag ref={ref} className={cn(className)}>
      {children}
    </Tag>
  );
}
