// DEMO ACCESS — gated, additive, demo-only coach/athlete sign-in.
//
// PURE module (no `next/headers`, no DB) so it is safe to import from edge
// middleware (proxy.ts). The cookie read/write helpers that need `next/headers`
// live in demo-cookie.ts.
//
// PURPOSE: let two of Alex's colleagues each tour the dashboard as a distinct
// DEMO coach (and log into the iOS app as that coach's demo athlete) WITHOUT
// Clerk, on a preview/demo deployment. The real Clerk auth path is untouched.
//
// SECURITY MODEL — why this can NEVER leak to production:
//   1. SINGLE ENV GATE. Everything here is dead unless `DEMO_ACCESS === '1'`.
//      The production deployment simply never sets that var, so the demo page
//      404s, the demo endpoints 404, and getCoachSession ignores the demo
//      cookie. There is no NODE_ENV carve-out (preview builds run as
//      production) — the flag, and only the flag, opens the door.
//   2. DEMO-ONLY IDENTITIES. The demo cookie is a normal coach JWT (issued by
//      the SAME session issuer as everything else, DB-backed + revocable). On
//      read we additionally require the resolved coach's email to be one of the
//      two hard-coded DEMO_COACH_EMAILS. A forged/real coach JWT therefore
//      cannot be promoted through the demo path, and the demo path can only
//      ever resolve the seeded demo coaches.
//   3. NO PARALLEL AUTH. We reuse issueSession/verifySession (lib/auth/session)
//      and a signed, httpOnly cookie. getCoachSession reads it ONLY when the
//      flag is on, BEFORE the Clerk path, and falls through to Clerk otherwise.
//
// The demo coach/athlete rows + their emails are created by
// infra/scripts/seed_demo_coaches.ts (commit d0e710f) in the DEMO DB.

/** The two seeded demo coaches, keyed by a stable slot the UI picks. */
export interface DemoCoachSpec {
  slot: 1 | 2;
  label: string;
  coach_email: string;
  athlete_label: string;
  athlete_email: string;
}

// MUST match infra/scripts/seed_demo_coaches.ts CONFIG (COACH_A_EMAIL /
// ATHLETE_A_EMAIL / COACH_B_EMAIL / ATHLETE_B_EMAIL defaults). Single source of
// truth for the demo identities on the read side.
export const DEMO_COACHES: readonly DemoCoachSpec[] = [
  {
    slot: 1,
    label: 'Coach Demo 1',
    coach_email: 'coach.demo1@fahybrid.local',
    athlete_label: 'Atleta Demo 1',
    athlete_email: 'athlete.demo1@demo.fahybrid.local',
  },
  {
    slot: 2,
    label: 'Coach Demo 2',
    coach_email: 'coach.demo2@fahybrid.local',
    athlete_label: 'Atleta Demo 2',
    athlete_email: 'athlete.demo2@demo.fahybrid.local',
  },
] as const;

/** Lowercased demo coach emails — the allowlist the read path enforces. */
export const DEMO_COACH_EMAILS: ReadonlySet<string> = new Set(
  DEMO_COACHES.map((c) => c.coach_email.toLowerCase()),
);

/**
 * The ONE gate. Demo access exists iff this returns true. Production leaves
 * DEMO_ACCESS unset → false → the whole feature is invisible (404s) and the
 * demo cookie is ignored by getCoachSession.
 */
export function isDemoAccessEnabled(): boolean {
  return process.env.DEMO_ACCESS === '1';
}

/** Look up a demo coach spec by slot, or null if the slot is invalid. */
export function demoCoachBySlot(slot: number): DemoCoachSpec | null {
  return DEMO_COACHES.find((c) => c.slot === slot) ?? null;
}

// Distinct, demo-scoped cookie name (NOT the real coach cookie) so it is
// obvious in the browser that this is a demo session and so it never collides
// with any future first-party coach cookie.
export const DEMO_COACH_COOKIE = 'fahybrik_demo_coach';
