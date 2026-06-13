// FAHYBRID landing — shared motion language.
//
// ONE set of constants so every section animates with the same vocabulary (no
// bespoke easings/durations scattered across components). Pure TS — no gsap import,
// so it stays importable from anywhere (server or client). The gsap eases here are
// referenced by NAME by the client primitives that DO import gsap.

/** Named gsap eases used across all reveals. */
export const EASE = {
  out: 'power3.out',
  inOut: 'power2.inOut',
  expo: 'expo.out',
} as const;

/** Animation durations (seconds). */
export const DURATION = {
  fast: 0.4,
  base: 0.7,
  slow: 1.1,
} as const;

/** Default stagger (seconds) between siblings in a staggered reveal. */
export const STAGGER = 0.08;

/** Default translateY (px) a reveal travels from. */
export const REVEAL_Y = 24;

/**
 * Whether the user has requested reduced motion.
 *
 * SSR-safe: returns `false` on the server (no `window`). On the client, reads the
 * live `prefers-reduced-motion` media query. Callers that animate must branch on
 * this and leave content fully visible when it returns true.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
