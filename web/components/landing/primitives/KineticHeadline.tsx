'use client';

// Big display headline with a line-by-line kinetic reveal.
//
// Each line lives in an overflow-hidden wrapper with an inner span; on reveal the
// inner spans rise from below (yPercent:120 + opacity:0) into place, staggered.
//
// a11y/SEO: every line is a real text node inside ONE heading element, so screen
// readers and crawlers read the full headline as a single heading. No-JS / reduced
// motion → lines sit visible with no transform (the effect only adds the from-state
// on the client).

import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';
import { DURATION, EASE, STAGGER, prefersReducedMotion } from '@/lib/landing/motion';

interface KineticHeadlineProps {
  lines: string[];
  className?: string;
  as?: 'h1' | 'h2';
  /** 'load' animates on mount (hero); 'scroll' animates on scroll-enter. */
  trigger?: 'load' | 'scroll';
  id?: string;
}

export function KineticHeadline({
  lines,
  className,
  as: Tag = 'h2',
  trigger = 'scroll',
  id,
}: KineticHeadlineProps) {
  const ref = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    if (prefersReducedMotion()) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const inners = el.querySelectorAll<HTMLElement>('[data-kinetic-line]');
      gsap.set(inners, { yPercent: 120, opacity: 0 });

      const tween = {
        yPercent: 0,
        opacity: 1,
        duration: DURATION.base,
        ease: EASE.out,
        stagger: STAGGER,
      } satisfies gsap.TweenVars;

      if (trigger === 'load') {
        gsap.to(inners, tween);
      } else {
        gsap.to(inners, {
          ...tween,
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        });
      }
    }, el);

    return () => ctx.revert();
  }, [trigger]);

  return (
    <Tag
      ref={ref}
      id={id}
      className={cn(
        'font-display italic font-black leading-[0.95] tracking-tight text-[color:var(--fg)]',
        className,
      )}
    >
      {lines.map((line, i) => (
        // overflow-hidden clips the rising inner span; the inner span is the moving part.
        <span key={i} className="block overflow-hidden pb-[0.04em]">
          <span data-kinetic-line className="block">
            {line}
          </span>
        </span>
      ))}
    </Tag>
  );
}
