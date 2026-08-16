/**
 * _demo_target.ts — shared resolution + safety guard for the demo-account seeds.
 *
 * The demo showcase seeds must run against PROD (main) now, not only the old
 * demo branch. To keep that safe they all share TWO invariants, defined here once:
 *
 *   1. HOST GUARD (assertDemoWriteHost)
 *      - the DEMO branch prefix (DEMO_NEON_HOST_PREFIX) is always writable, and
 *      - MAIN (MAIN_NEON_HOST_PREFIX) is writable ONLY when the operator opts in
 *        with SEED_DEMO_ALLOW_MAIN=1 — a deliberate, per-run acknowledgement that
 *        this seed is about to touch production data.
 *      - anything else (unknown host) is refused.
 *      Prefixes are env, never committed hostnames.
 *
 *   2. TARGET RESOLUTION (resolveDemoTarget)
 *      keyed on the demo MARKER EMAILS, never on fixed ids (ids differ across
 *      branches). It resolves the demo coach + athlete (+ optional partner) and
 *      HARD-ASSERTS they are demo accounts: the athlete's email domain must be
 *      the demo marker and the athlete must belong to the resolved demo coach.
 *      Any script that only writes rows keyed by these resolved ids therefore
 *      cannot touch a real coach/athlete, a real user, a lead, or another coach's
 *      content — the whole safety contract of the demo seeds.
 *
 * Type-only import of Sql → this module has NO runtime deps and is safe to import
 * from any seed (it never opens its own connection; callers pass their sql).
 */
import type { Sql } from '@/lib/db';

const trimmed = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

/** Demo marker emails (overridable via env for the second demo athlete/coach). */
export const DEMO_ATHLETE_EMAIL = trimmed('DEMO_ATHLETE_EMAIL') ?? 'athlete.demo1@demo.fahybrid.local';
export const DEMO_COACH_EMAIL = trimmed('DEMO_COACH_EMAIL') ?? 'coach.demo1@fahybrid.local';
export const DEMO_PARTNER_EMAIL = trimmed('DEMO_PARTNER_EMAIL') ?? 'athlete.demo.partner@demo.fahybrid.local';

/** Email-domain markers a demo athlete/partner MUST match (defence in depth). */
const DEMO_ATHLETE_DOMAIN = /@demo\.fahybrid\.local$/i;
/** Coach demo emails end in @fahybrid.local (no `demo.` subdomain). */
const DEMO_COACH_DOMAIN = /@(demo\.)?fahybrid\.local$/i;

/** Neon host prefixes — set in the operator env. No branch hostname in git. */
const DEMO_HOST = trimmed('DEMO_NEON_HOST_PREFIX');
const MAIN_HOST = trimmed('MAIN_NEON_HOST_PREFIX');

export function currentHost(): string {
  return (process.env.DATABASE_URL ?? '').match(/@([^/?]+)/)?.[1] ?? '';
}

/**
 * Assert the DB this run points at is a legal target for a demo seed, and return
 * its host. Demo branch: always ok. Main: ok only with SEED_DEMO_ALLOW_MAIN=1.
 * Anything else is refused.
 */
export function assertDemoWriteHost(scriptName: string): string {
  if (!DEMO_HOST || !MAIN_HOST) {
    throw new Error(
      `${scriptName}: set DEMO_NEON_HOST_PREFIX and MAIN_NEON_HOST_PREFIX ` +
        `(Neon host prefixes). Do not commit the values.`,
    );
  }
  const host = currentHost();
  if (host.includes(DEMO_HOST)) return host;
  if (host.includes(MAIN_HOST)) {
    if (trimmed('SEED_DEMO_ALLOW_MAIN') === '1') return host;
    throw new Error(
      `${scriptName}: DATABASE_URL host is MAIN (${host}). Refusing to write to production ` +
        `without SEED_DEMO_ALLOW_MAIN=1. Re-run with SEED_DEMO_ALLOW_MAIN=1 to confirm.`,
    );
  }
  throw new Error(
    `${scriptName}: DATABASE_URL host "${host || '(unknown)'}" is neither the demo branch ` +
      `(${DEMO_HOST}) nor main (${MAIN_HOST}). Point DATABASE_URL at a known branch.`,
  );
}

export interface DemoTarget {
  coachId: number;
  athleteId: number;
  athleteUserId: number;
  athleteEmail: string;
  coachEmail: string;
}

/**
 * Resolve the demo coach + athlete by MARKER EMAIL and hard-assert they are demo
 * accounts. Throws (never writes) if the athlete is missing, is not a demo-domain
 * email, or does not belong to the resolved demo coach.
 */
export async function resolveDemoTarget(sql: Sql): Promise<DemoTarget> {
  const arows = await sql<Array<{ id: string; user_id: string; coach_id: string; email: string }>>`
    select a.id::text, a.user_id::text, a.coach_id::text, u.email
    from athletes a join users u on u.id = a.user_id
    where lower(u.email) = ${DEMO_ATHLETE_EMAIL.toLowerCase()}
    limit 1
  `;
  if (arows.length === 0) throw new Error(`demo athlete not found by email ${DEMO_ATHLETE_EMAIL}`);
  const a = arows[0]!;

  if (!DEMO_ATHLETE_DOMAIN.test(a.email)) {
    throw new Error(`safety: athlete email "${a.email}" is not a demo marker (${DEMO_ATHLETE_DOMAIN})`);
  }

  const crows = await sql<Array<{ id: string; email: string }>>`
    select c.id::text, u.email
    from coaches c join users u on u.id = c.user_id
    where lower(u.email) = ${DEMO_COACH_EMAIL.toLowerCase()}
    limit 1
  `;
  if (crows.length === 0) throw new Error(`demo coach not found by email ${DEMO_COACH_EMAIL}`);
  const c = crows[0]!;
  if (!DEMO_COACH_DOMAIN.test(c.email)) {
    throw new Error(`safety: coach email "${c.email}" is not a demo marker (${DEMO_COACH_DOMAIN})`);
  }

  if (Number(a.coach_id) !== Number(c.id)) {
    throw new Error(
      `safety: athlete ${a.id} (coach_id ${a.coach_id}) does not belong to demo coach ${c.id} <${DEMO_COACH_EMAIL}>`,
    );
  }

  return {
    coachId: Number(c.id),
    athleteId: Number(a.id),
    athleteUserId: Number(a.user_id),
    athleteEmail: a.email,
    coachEmail: c.email,
  };
}

/** Assert a coach id belongs to a demo coach account (target-safety for clone). */
export async function assertDemoCoach(sql: Sql, coachId: number): Promise<string> {
  const rows = await sql<Array<{ email: string }>>`
    select u.email from coaches c join users u on u.id = c.user_id where c.id = ${coachId} limit 1
  `;
  if (rows.length === 0) throw new Error(`coach ${coachId} not found`);
  const email = rows[0]!.email;
  if (!DEMO_COACH_DOMAIN.test(email)) {
    throw new Error(`safety: coach ${coachId} <${email}> is not a demo coach — refusing to write its library`);
  }
  return email;
}
