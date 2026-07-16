/**
 * seed_demo_coaches.ts — TWO self-contained demo COACH accounts, each born as a
 * BLANK SLATE: just the coach account + ONE empty athlete + app login handles,
 * and NOTHING else. Seeded into the DEMO DB by REUSING the real app services
 * end-to-end (no fabricated rows that skip the pipeline). Idempotent.
 *
 * The whole point of the demo is that the colleague does EVERYTHING themselves —
 * build their library (microciclos, sequences, sessions), classify the athlete,
 * assign a plan, materialize workouts — starting from zero, exactly like a real
 * new coach signup. So this seed deliberately builds NO coach content and leaves
 * the athlete unclassified/empty.
 *
 * WHAT IT BUILDS, per coach (×2), through the REAL services:
 *   1. Coach account     → D.findOrCreateCoachByEmail()  (email-keyed, idempotent).
 *      Optionally stamps a known Clerk user id so the dashboard Clerk fast-path
 *      resolves this exact coach (see LOGIN, below).
 *   2. Levels (N1–N5)    → the canonical athlete_levels set (config the 0057
 *      migration seeds for existing coaches; a NEW coach has none, so we insert
 *      the same canonical rows — ON CONFLICT DO NOTHING). This is coach *config*,
 *      not authored content, and is kept so the classify UI has a scale.
 *   3. ONE EMPTY athlete → D.createCompAthlete() (comp = full access, no billing).
 *      NOT classified, NO zones, NO sequence, NO plan — a blank slate the
 *      colleague fills in. The coach roster shows it as unclassified/empty.
 *   4. App login handles → D.createAthleteInvitation() (deeplink/token to bind a
 *      real Apple ID onto this athlete) + a long-lived athlete bearer session
 *      (issueSession) as a no-Apple-ID fallback.
 *
 * IDEMPOTENT: keyed on the demo coach + athlete emails. Re-running WIPES this
 * demo coach's own content (athlete + any sequences/microciclos/templates left
 * over from older seeds) and rebuilds the blank slate — it never touches another
 * coach, and refuses to run against a protected/real coach email.
 *
 * RUN (against the DEMO DB — host must be ep-flat-wind):
 *   cd web && NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/seed_demo_coaches.ts
 *
 *   The script auto-loads web/.env.local (DATABASE_URL, AUTH_SECRET). Override
 *   coach/athlete identity + Clerk linkage via env (see CONFIG below).
 */
import './_load_web_env.ts';

import type { Sql } from '@/lib/db';

// The real web services live behind `server-only` + `@/` aliases and form import
// cycles the Next bundler tolerates but tsx's STATIC ESM linker does not (it
// reports "does not provide an export"). DYNAMIC import() defers linking past the
// cycle, so we load every service at runtime (see loadDeps) instead of statically.
// We run under `--conditions=react-server` so `server-only` resolves to its no-op.
type Deps = {
  sql: Sql;
  findOrCreateCoachByEmail: typeof import('@/lib/auth/users')['findOrCreateCoachByEmail'];
  createCompAthlete: typeof import('@/lib/dashboard/coach/comp-athletes')['createCompAthlete'];
  createAthleteInvitation: typeof import('@/lib/athlete/invitations')['createAthleteInvitation'];
  issueSession: typeof import('@/lib/auth/session')['issueSession'];
  audiences: typeof import('@/lib/auth/session')['audiences'];
};

let D: Deps;

async function loadDeps(): Promise<Deps> {
  const [db, users, comp, invites, session] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/auth/users'),
    import('@/lib/dashboard/coach/comp-athletes'),
    import('@/lib/athlete/invitations'),
    import('@/lib/auth/session'),
  ]);
  return {
    sql: db.sql,
    findOrCreateCoachByEmail: users.findOrCreateCoachByEmail,
    createCompAthlete: comp.createCompAthlete,
    createAthleteInvitation: invites.createAthleteInvitation,
    issueSession: session.issueSession,
    audiences: session.audiences,
  };
}

/** Mirrors AUTH_CONFIG.appUrl() (lib/auth/config.ts) — the invite deeplink base. */
const appUrl = () => process.env.APP_URL ?? 'http://localhost:3000';

// ── CONFIG ───────────────────────────────────────────────────────────────────

/** Coaches that must NEVER be wiped/rewritten by this script (real/seeded). */
const PROTECTED_COACH_EMAILS = new Set([
  'alexsole@gmail.com',
  'pablo@fabrik.training',
]);

interface CoachSpec {
  email: string;
  display_name: string;
  /** Optional real Clerk user id → stamped so the dashboard Clerk path resolves THIS coach. */
  clerk_user_id: string | null;
  athlete: {
    email: string;
    full_name: string;
    modality: 'individual' | 'dobles' | 'pro_elite';
  };
}

const env = (k: string, d: string) => (process.env[k]?.trim() ? process.env[k]!.trim() : d);
const envOrNull = (k: string) => (process.env[k]?.trim() ? process.env[k]!.trim() : null);

const COACHES: CoachSpec[] = [
  {
    email: env('COACH_A_EMAIL', 'coach.demo1@fahybrid.local'),
    display_name: env('COACH_A_NAME', 'Coach Demo 1'),
    clerk_user_id: envOrNull('COACH_A_CLERK_ID'),
    athlete: {
      email: env('ATHLETE_A_EMAIL', 'athlete.demo1@demo.fahybrid.local'),
      full_name: env('ATHLETE_A_NAME', 'Atleta Demo 1'),
      modality: 'individual',
    },
  },
  {
    email: env('COACH_B_EMAIL', 'coach.demo2@fahybrid.local'),
    display_name: env('COACH_B_NAME', 'Coach Demo 2'),
    clerk_user_id: envOrNull('COACH_B_CLERK_ID'),
    athlete: {
      email: env('ATHLETE_B_EMAIL', 'athlete.demo2@demo.fahybrid.local'),
      full_name: env('ATHLETE_B_NAME', 'Atleta Demo 2'),
      modality: 'individual',
    },
  },
];

/** Canonical N1–N5 (mirrors migration 0057's seed for existing coaches). */
const CANONICAL_LEVELS: Array<{ name: string; label: string; description: string; sort_order: number }> = [
  { name: 'N1', label: 'Iniciación', description: 'Primera experiencia estructurada. Sin carreras o >90min.', sort_order: 1 },
  { name: 'N2', label: 'Desarrollo', description: 'Base aeróbica, 0-1 carreras. 75-90min.', sort_order: 2 },
  { name: 'N3', label: 'Rendimiento', description: '1-3 carreras, entiende zonas. 65-75min.', sort_order: 3 },
  { name: 'N4', label: 'Competición', description: 'Open competitivo, múltiples carreras. 55-65min.', sort_order: 4 },
  { name: 'N5', label: 'Elite', description: 'Pro o sub-elite. <55min (H) / <65min (M).', sort_order: 5 },
];

// ── per-coach reset (only our own demo content; never a protected coach) ──────
async function wipeCoachDemoContent(coachId: number, athleteEmail: string) {
  // Athlete (cascades workout_assignments, subscriptions, zone profiles,
  // athlete_sequence_progress, athlete_month_assignments, microcycles, sessions,
  // invitations). chat_threads RESTRICT — delete them first (none expected).
  await D.sql`
    delete from chat_threads where athlete_id in (
      select a.id from athletes a join users u on u.id = a.user_id
      where u.email = ${athleteEmail}
    )
  `;
  await D.sql`delete from users where email = ${athleteEmail}`;

  // Coach library left over from OLDER seeds (this script now builds none, but a
  // re-run from a dirty state must converge to the blank slate). Order respects
  // FKs: sequences (cascade items + progress) → month templates (cascade weeks) →
  // week templates → inline templates (segments cascade).
  await D.sql`delete from program_sequences where coach_id = ${coachId}`;
  await D.sql`delete from program_month_templates where coach_id = ${coachId}`;
  await D.sql`delete from program_week_templates where coach_id = ${coachId}`;
  await D.sql`delete from template_segments where template_id in (select id from templates where coach_id = ${coachId})`;
  await D.sql`delete from templates where coach_id = ${coachId}`;
}

// ── per-coach seed ────────────────────────────────────────────────────────────
interface SeedResult {
  coach_email: string;
  coach_display_name: string;
  coach_id: number;
  clerk_linked: boolean;
  athlete_email: string;
  athlete_id: number;
  level_name: string;
  training_days: number | null;
  invite_url: string;
  invite_expires_at: string;
  athlete_bearer_token: string;
  bearer_expires_at: string;
}

async function seedCoach(spec: CoachSpec): Promise<SeedResult> {
  const email = spec.email.toLowerCase();
  if (PROTECTED_COACH_EMAILS.has(email)) {
    throw new Error(`Refusing to seed onto protected coach email: ${email}`);
  }

  // 1. Coach (real service, idempotent by email).
  const { user, coach } = await D.findOrCreateCoachByEmail(email);
  const coachId = Number(coach.id);
  await D.sql`update coaches set full_name = ${spec.display_name}, updated_at = now() where id = ${coachId}`;
  // Stamp a known Clerk user id so the dashboard Clerk fast-path resolves THIS
  // coach (only when provided — and only onto a row not already clerk-linked).
  let clerkLinked = false;
  if (spec.clerk_user_id) {
    await D.sql`
      update users set clerk_user_id = ${spec.clerk_user_id}, updated_at = now()
      where id = ${Number(user.id)} and (clerk_user_id is null or clerk_user_id = ${spec.clerk_user_id})
    `;
    clerkLinked = true;
  }

  // 2. Levels (canonical N1–N5; config a new coach lacks). Idempotent.
  for (const lv of CANONICAL_LEVELS) {
    await D.sql`
      insert into athlete_levels (coach_id, name, label, description, sort_order)
      values (${coachId}, ${lv.name}, ${lv.label}, ${lv.description}, ${lv.sort_order})
      on conflict (coach_id, name) do nothing
    `;
  }

  // 3. Converge to the blank slate: drop the athlete + any leftover coach content.
  await wipeCoachDemoContent(coachId, spec.athlete.email.toLowerCase());

  // 4. Athlete (real comp service) — created EMPTY (a blank slate). NO classify
  //    (level_id/days stay null), NO zones, NO sequence, NO plan. The colleague
  //    does ALL of that themselves. createCompAthlete creates the row + coach link.
  const created = await D.createCompAthlete({
    coach_id: coachId,
    input: {
      full_name: spec.athlete.full_name,
      email: spec.athlete.email.toLowerCase(),
      modality: spec.athlete.modality,
    },
  });
  const athleteId = Number(created.id);

  // 5a. App invite (real service) — bind a real Apple ID onto this athlete.
  const invite = await D.createAthleteInvitation({
    athlete_id: BigInt(athleteId),
    coach_id: BigInt(coachId),
  });
  if (!invite.ok) {
    throw new Error(`invite failed for ${spec.athlete.email}: ${invite.error.code}`);
  }
  const inviteUrl = `${appUrl()}/invite/${encodeURIComponent(invite.result.token)}`;

  // 5b. Long-lived athlete bearer (real token minter) — no-Apple-ID fallback.
  const athleteUserIdVal = await athleteUserId(athleteId);
  const bearer = await D.issueSession({
    user_id: BigInt(athleteUserIdVal),
    audience: D.audiences.athlete,
    ttl_seconds: 365 * 24 * 60 * 60,
    user_agent: 'seed_demo_coaches',
    ip: null,
  });

  return {
    coach_email: email,
    coach_display_name: spec.display_name,
    coach_id: coachId,
    clerk_linked: clerkLinked,
    athlete_email: spec.athlete.email.toLowerCase(),
    athlete_id: athleteId,
    // Athlete is an intentional blank slate — unclassified, no zones, no plan.
    level_name: '(unclassified)',
    training_days: null,
    invite_url: inviteUrl,
    invite_expires_at: invite.result.expires_at.toISOString(),
    athlete_bearer_token: bearer.token,
    bearer_expires_at: bearer.expires_at.toISOString(),
  };
}

async function athleteUserId(athleteId: number): Promise<number> {
  const rows = await D.sql<Array<{ user_id: string }>>`
    select user_id::text from athletes where id = ${athleteId} limit 1
  `;
  return Number(rows[0]!.user_id);
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  // SEED_DEMO_ALLOW_MAIN=1 overrides the host guard — explicit opt-in for the
  // single-universe era (demo slots live in prod until Alex retires them).
  const host = (process.env.DATABASE_URL ?? '').match(/@([^/?]+)/)?.[1] ?? '';
  if (!host.includes('ep-flat-wind') && process.env.SEED_DEMO_ALLOW_MAIN !== '1') {
    throw new Error(
      `Refusing to run: DATABASE_URL host is "${host || '(unknown)'}", not the DEMO DB (ep-flat-wind). ` +
        `Point DATABASE_URL at the demo branch, or set SEED_DEMO_ALLOW_MAIN=1 on purpose.`,
    );
  }
  // eslint-disable-next-line no-console
  console.log(`[seed_demo_coaches] target host: ${host}`);

  D = await loadDeps();

  const results: SeedResult[] = [];
  for (const spec of COACHES) {
    // eslint-disable-next-line no-console
    console.log(`\n[seed_demo_coaches] seeding coach ${spec.email} …`);
    results.push(await seedCoach(spec));
  }

  // eslint-disable-next-line no-console
  console.log('\n========================= DEMO COACHES SEEDED =========================');
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(r, null, 2));
  }

  await D.sql.end();
  // eslint-disable-next-line no-console
  console.log('\n[seed_demo_coaches] done.');
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('[seed_demo_coaches] FAILED:', err);
  try {
    await D?.sql?.end();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
