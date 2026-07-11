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
  /** Optional line index rendered in brand accent (e.g. the Hero's last line). */
  accentLineIndex?: number;
}

export function KineticHeadline({
  lines,
  className,
  as: Tag = 'h2',
  trigger = 'scroll',
  id,
  accentLineIndex,
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
        // tracking-[-0.02em]: brand display gets slight negative tracking (single source
        // for hero h1, all section h2s and the FinalCta h2 — they all route through here).
        'font-display italic font-black leading-[0.95] tracking-[-0.02em] text-[color:var(--fg)]',
        className,
      )}
    >
      {lines.map((line, i) => (
        // overflow-hidden clips the rising inner span; the inner span is the moving part.
        // pr-[0.08em] gives the italic overhang of a line's last glyph room inside the clip
        // box so it never gets sheared at the right edge (left-aligned start is unaffected).
        <span key={i} className="block overflow-hidden pb-[0.04em] pr-[0.08em]">
          <span
            data-kinetic-line
            className={cn('block', i === accentLineIndex && 'text-[color:var(--accent)]')}
          >
            {line}
          </span>
        </span>
      ))}
    </Tag>
  );
}
