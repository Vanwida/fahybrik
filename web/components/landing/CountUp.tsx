'use client';

// Count-up number for a stat value (e.g. Pablo's "+250"). On first scroll-into-view it
// animates 0 → target with an ease-out curve, preserving any non-digit prefix/suffix
// (the "+"). Uses tabular-nums so the width never jitters as digits change.
//
// Contract (mirrors Reveal / KineticHeadline): the FINAL value is rendered by default —
// SSR, no-JS and prefers-reduced-motion all show the real number, no animation. The
// count only ever runs on the client, once, when motion is allowed.

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/lib/landing/motion';

// ~1.2s feels lively without dragging; ease-out lands softly on the target.
const DEFAULT_DURATION_MS = 1200;
// Start counting once ~40% of the number is on screen (it sits low in the Coach split).
const ENTER_THRESHOLD = 0.4;

/** Split "+250" → { prefix: "+", target: 250, suffix: "" }. null if not countable. */
function parseStat(value: string): { prefix: string; target: number; suffix: string } | null {
  const match = value.match(/^(\D*)(\d[\d.,]*)(\D*)$/);
  if (!match) return null;
  const target = Number(match[2].replace(/[.,]/g, ''));
  if (!Number.isFinite(target)) return null;
  return { prefix: match[1], target, suffix: match[3] };
}

interface CountUpProps {
  value: string;
  durationMs?: number;
}

export function CountUp({ value, durationMs = DEFAULT_DURATION_MS }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const parsed = parseStat(value);
    if (!parsed) return;
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    if (prefersReducedMotion()) return; // leave the final value in place

    const format = (n: number) => `${parsed.prefix}${Math.round(n)}${parsed.suffix}`;
    let raf = 0;
    let started = false;

    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        setDisplay(format(parsed.target * eased));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true;
          setDisplay(format(0));
          run();
          io.disconnect();
        }
      },
      { threshold: ENTER_THRESHOLD },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [value, durationMs]);

  // Not a countable value → render as-is.
  if (!parseStat(value)) return <>{value}</>;

  // The final value is the accessible name; the animating text is decorative.
  return (
    <span ref={ref} aria-label={value} className="tabular-nums">
      <span aria-hidden="true">{display}</span>
    </span>
  );
}
