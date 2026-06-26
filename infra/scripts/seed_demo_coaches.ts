/**
 * seed_demo_coaches.ts — TWO self-contained demo COACH accounts, each with ONE
 * EMPTY athlete, seeded into the DEMO DB by REUSING the real app services
 * end-to-end (no fabricated rows that skip the pipeline). Idempotent.
 *
 * The athlete is an intentional BLANK SLATE: created + linked to its coach, and
 * nothing else. No classification (level/days), no zone profiles, no sequence
 * assignment, no materialized plan. The whole point of the demo is that the
 * colleague does ALL of that themselves — classify, assign, build workouts —
 * starting from the coach's library (microciclo + sequence) that this seed DOES
 * build. So: coach gets content (the material to assign FROM); athlete is empty.
 *
 * WHAT IT BUILDS, per coach (×2), through the REAL services:
 *   1. Coach account               → D.findOrCreateCoachByEmail()  (email-keyed,
 *      idempotent). Optionally stamps a known Clerk user id so the dashboard
 *      Clerk fast-path resolves this exact coach (see LOGIN, below).
 *   2. Levels (N1–N5)              → the canonical athlete_levels set (config the
 *      0057 migration seeds for existing coaches; a NEW coach has none, so we
 *      insert the same canonical rows — ON CONFLICT DO NOTHING).
 *   3. A microciclo                → D.createMonthTemplateWithEmptyWeeks()
 *      + D.upsertWeekTemplate() per week, with REAL inline-block sessions that
 *      reference REAL catalog exercises + structured prescriptions. The week
 *      content is what the materializer turns into real workouts.
 *   4. A sequence (the assignment) → D.saveCoachSequence() for (level, days) → the
 *      microciclo. The ORDER of items is the periodization (AGNOSTIC, no ATR).
 *   5. ONE EMPTY athlete           → D.createCompAthlete() (comp = full access, no
 *      billing). NOT classified, NO zones, NO sequence, NO plan — a blank slate
 *      the colleague fills in. The coach roster shows it as unclassified/empty.
 *   6. App login handles           → D.createAthleteInvitation() (deeplink/token to
 *      bind a real Apple ID onto this athlete) + a long-lived athlete bearer
 *      session (issueSession) as a no-Apple-ID fallback.
 *
 * IDEMPOTENT: keyed on the demo coach + athlete emails. Re-running WIPES this
 * demo coach's own content (athlete + sequences + microciclos + inline templates)
 * and rebuilds it — it never touches another coach, and refuses to run against a
 * protected/real coach email.
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
  createMonthTemplateWithEmptyWeeks: typeof import('@/lib/dashboard/coach/program-months')['createMonthTemplateWithEmptyWeeks'];
  upsertWeekTemplate: typeof import('@/lib/dashboard/coach/program-weeks')['upsertWeekTemplate'];
  saveCoachSequence: typeof import('@/lib/dashboard/coach/sequences')['saveCoachSequence'];
  createAthleteInvitation: typeof import('@/lib/athlete/invitations')['createAthleteInvitation'];
  issueSession: typeof import('@/lib/auth/session')['issueSession'];
  audiences: typeof import('@/lib/auth/session')['audiences'];
};

let D: Deps;

async function loadDeps(): Promise<Deps> {
  const [db, users, comp, months, weeks, seqs, invites, session] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/auth/users'),
    import('@/lib/dashboard/coach/comp-athletes'),
    import('@/lib/dashboard/coach/program-months'),
    import('@/lib/dashboard/coach/program-weeks'),
    import('@/lib/dashboard/coach/sequences'),
    import('@/lib/athlete/invitations'),
    import('@/lib/auth/session'),
  ]);
  return {
    sql: db.sql,
    findOrCreateCoachByEmail: users.findOrCreateCoachByEmail,
    createCompAthlete: comp.createCompAthlete,
    createMonthTemplateWithEmptyWeeks: months.createMonthTemplateWithEmptyWeeks,
    upsertWeekTemplate: weeks.upsertWeekTemplate,
    saveCoachSequence: seqs.saveCoachSequence,
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
    sex: 'male' | 'female';
    discipline: 'hyrox' | 'hybrid' | 'running';
    modality: 'individual' | 'dobles' | 'pro_elite';
    training_days_per_week: number;
    level_name: 'N1' | 'N2' | 'N3' | 'N4' | 'N5';
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
      sex: 'male',
      discipline: 'hyrox',
      modality: 'individual',
      training_days_per_week: 5,
      level_name: 'N3',
    },
  },
  {
    email: env('COACH_B_EMAIL', 'coach.demo2@fahybrid.local'),
    display_name: env('COACH_B_NAME', 'Coach Demo 2'),
    clerk_user_id: envOrNull('COACH_B_CLERK_ID'),
    athlete: {
      email: env('ATHLETE_B_EMAIL', 'athlete.demo2@demo.fahybrid.local'),
      full_name: env('ATHLETE_B_NAME', 'Atleta Demo 2'),
      sex: 'female',
      discipline: 'hybrid',
      modality: 'individual',
      training_days_per_week: 5,
      level_name: 'N3',
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

/** Stable name prefix so the microciclo + week templates are wipe-able by name. */
const MICRO_NAME = 'Demo · Microciclo base';

// ── date helpers (box-local ≈ UTC at seed time) ───────────────────────────────
function mondayOfThisWeekIso(): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const delta = (day + 6) % 7;
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  mon.setUTCDate(mon.getUTCDate() - delta);
  return mon.toISOString().slice(0, 10);
}

// ── real catalog exercises (looked up by stable slug) ─────────────────────────
const EXERCISE_SLUGS = [
  'back-squat',
  'row',
  'run',
  'hyrox-wall-balls',
  'hyrox-sled-push',
  'hyrox-burpee-broad-jump',
] as const;

type ExMap = Record<string, { id: number; name: string }>;

async function loadExercises(): Promise<ExMap> {
  const rows = await D.sql<Array<{ id: string; slug: string; name: string }>>`
    select id::text, slug, name from exercises where slug = any(${[...EXERCISE_SLUGS]}::text[])
  `;
  const map: ExMap = {};
  for (const r of rows) map[r.slug] = { id: Number(r.id), name: r.name };
  const missing = EXERCISE_SLUGS.filter((s) => !map[s]);
  if (missing.length) {
    throw new Error(
      `Missing catalog exercises (run seed:exercises first): ${missing.join(', ')}`,
    );
  }
  return map;
}

let UID = 0;
const uid = (p: string) => `demo-${p}-${++UID}`;

/** Build a workout session (kind='workout') with inline blocks + real exercises. */
function workoutSession(ex: ExMap, opts: {
  focus: string;
  format: string;
  title: string;
  items: Array<{ slug: keyof ExMap | string; prescription: unknown }>;
}) {
  return {
    kind: 'workout' as const,
    focus: opts.focus,
    blocks: [
      {
        uid: uid('blk'),
        format: opts.format,
        title: opts.title,
        items: opts.items.map((it) => ({
          uid: uid('it'),
          exercise_id: ex[it.slug as string]!.id,
          exercise_name: ex[it.slug as string]!.name,
          prescription_json: it.prescription,
        })),
      },
    ],
  };
}

/** One realistic 5-day training week (Mon/Tue/Thu/Fri/Sat) as WeekSlots. */
function buildWeekSlots(ex: ExMap, weekIdx: number) {
  const days = [
    {
      day_of_week: 1, // Mon — fuerza
      sessions: [
        workoutSession(ex, {
          focus: 'Fuerza base',
          format: 'strength_block',
          title: 'Sentadilla — fuerza',
          items: [
            {
              slug: 'back-squat',
              prescription: {
                scheme: 'sets',
                modality: 'strength',
                sets: Array.from({ length: 5 }, () => ({
                  measure: { kind: 'reps', value: 5 },
                  target: { kind: 'percent_rm', value: 72 + weekIdx * 3 },
                  rest_s: 150,
                })),
              },
            },
          ],
        }),
      ],
    },
    {
      day_of_week: 2, // Tue — ergo intervals
      sessions: [
        workoutSession(ex, {
          focus: 'Series ergómetro',
          format: 'intervals',
          title: 'Row 4×500m',
          items: [
            {
              slug: 'row',
              prescription: {
                scheme: 'interval',
                modality: 'row',
                sets: Array.from({ length: 4 }, () => ({
                  measure: { kind: 'distance', meters: 500 },
                  target: { kind: 'pace', unit: 'per_500m', value_s: 112 },
                  rest_s: 90,
                })),
              },
            },
          ],
        }),
      ],
    },
    {
      day_of_week: 4, // Thu — carrera Z2
      sessions: [
        workoutSession(ex, {
          focus: 'Carrera aeróbica',
          format: 'tempo',
          title: 'Run Z2 30min',
          items: [
            {
              slug: 'run',
              prescription: {
                scheme: 'steady',
                modality: 'run',
                total_s: 1800,
                target: { kind: 'hr_zone', value: 2 },
              },
            },
          ],
        }),
      ],
    },
    {
      day_of_week: 5, // Fri — WOD HYROX
      sessions: [
        workoutSession(ex, {
          focus: 'WOD estaciones',
          format: 'circuit',
          title: 'Wall balls + Sled push + Burpee BJ',
          items: [
            {
              slug: 'hyrox-wall-balls',
              prescription: { scheme: 'rounds', modality: 'functional', rounds: 3, sets: [{ measure: { kind: 'reps', value: 20 } }] },
            },
            {
              slug: 'hyrox-sled-push',
              prescription: { scheme: 'rounds', modality: 'functional', rounds: 3, sets: [{ measure: { kind: 'distance', meters: 25 } }] },
            },
            {
              slug: 'hyrox-burpee-broad-jump',
              prescription: { scheme: 'rounds', modality: 'functional', rounds: 3, sets: [{ measure: { kind: 'reps', value: 15 } }] },
            },
          ],
        }),
      ],
    },
    {
      day_of_week: 6, // Sat — series running
      sessions: [
        workoutSession(ex, {
          focus: 'Series específicas',
          format: 'intervals',
          title: 'Run 6×400m',
          items: [
            {
              slug: 'run',
              prescription: {
                scheme: 'interval',
                modality: 'run',
                sets: Array.from({ length: 6 }, () => ({
                  measure: { kind: 'distance', meters: 400 },
                  target: { kind: 'pace', unit: 'per_km', value_s: 235 },
                  rest_s: 90,
                })),
              },
            },
          ],
        }),
      ],
    },
  ];
  return { days };
}

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

  // Coach library: sequences (cascade items), microciclos by name (cascade
  // junction; week templates RESTRICT → delete by name prefix after), and the
  // inline templates this coach owns (segments cascade).
  await D.sql`delete from program_sequences where coach_id = ${coachId}`;
  await D.sql`delete from program_month_templates where coach_id = ${coachId} and name like ${MICRO_NAME + '%'}`;
  await D.sql`delete from program_week_templates where coach_id = ${coachId} and name like ${MICRO_NAME + '%'}`;
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
  zone_modalities: string[];
  month_template_id: number;
  sequence_id: number;
  week_start: string;
  assignment_count: number;
  invite_url: string;
  invite_expires_at: string;
  athlete_bearer_token: string;
  bearer_expires_at: string;
}

async function seedCoach(spec: CoachSpec, ex: ExMap, weekStartIso: string): Promise<SeedResult> {
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
  const levelRows = await D.sql<Array<{ id: string; name: string }>>`
    select id::text, name from athlete_levels where coach_id = ${coachId}
  `;
  const levelByName = new Map(levelRows.map((r) => [r.name, Number(r.id)]));
  const levelId = levelByName.get(spec.athlete.level_name)!;

  // 3. Reset our own demo content, then rebuild the microciclo (real services).
  await wipeCoachDemoContent(coachId, spec.athlete.email.toLowerCase());

  const WEEK_COUNT = 3;
  const month = await D.createMonthTemplateWithEmptyWeeks({
    coach_id: coachId,
    payload: { name: MICRO_NAME, level_id: levelId, week_count: WEEK_COUNT },
  });
  const monthTemplateId = Number(month.id);
  for (const w of month.weeks) {
    await D.upsertWeekTemplate({
      coach_id: coachId,
      id: Number(w.id),
      payload: {
        name: `${MICRO_NAME} · Semana ${w.week_index + 1}`,
        focus: ['Carga base', 'Carga progresiva', 'Pico de carga'][w.week_index] ?? null,
        slots_json: buildWeekSlots(ex, w.week_index),
      },
    });
  }

  // 4. Sequence (the assignment) for (level, days) → the microciclo.
  const sequence = await D.saveCoachSequence(coachId, {
    level_id: levelId,
    days_per_week: spec.athlete.training_days_per_week,
    end_policy: 'repeat',
    progression_pct: null,
    progression_applies_to: null,
    items: [{ month_template_id: monthTemplateId }],
  });

  // 5. Athlete (real comp service) — created EMPTY (a blank slate).
  //    NO classify (level_id/days stay null), NO zone profiles, NO sequence
  //    assignment, NO plan materialization. The whole point of the demo is that
  //    the colleague does ALL of that themselves: classify the athlete, assign
  //    a microciclo/sequence, and materialize workouts. We only create the
  //    athlete row + link it to the coach (createCompAthlete does both).
  const created = await D.createCompAthlete({
    coach_id: coachId,
    input: {
      full_name: spec.athlete.full_name,
      email: spec.athlete.email.toLowerCase(),
      modality: spec.athlete.modality,
    },
  });
  const athleteId = Number(created.id);

  // 6a. App invite (real service) — bind a real Apple ID onto this athlete.
  const invite = await D.createAthleteInvitation({
    athlete_id: BigInt(athleteId),
    coach_id: BigInt(coachId),
  });
  if (!invite.ok) {
    throw new Error(`invite failed for ${spec.athlete.email}: ${invite.error.code}`);
  }
  const inviteUrl = `${appUrl()}/invite/${encodeURIComponent(invite.result.token)}`;

  // 6b. Long-lived athlete bearer (real token minter) — no-Apple-ID fallback.
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
    zone_modalities: [],
    month_template_id: monthTemplateId,
    sequence_id: Number(sequence.id),
    week_start: weekStartIso,
    assignment_count: 0,
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
  const host = (process.env.DATABASE_URL ?? '').match(/@([^/?]+)/)?.[1] ?? '';
  if (!host.includes('ep-flat-wind')) {
    throw new Error(
      `Refusing to run: DATABASE_URL host is "${host || '(unknown)'}", not the DEMO DB (ep-flat-wind). ` +
        `Point DATABASE_URL at the demo branch.`,
    );
  }
  // eslint-disable-next-line no-console
  console.log(`[seed_demo_coaches] target host: ${host}`);

  D = await loadDeps();

  const weekStartIso = mondayOfThisWeekIso();
  const ex = await loadExercises();

  const results: SeedResult[] = [];
  for (const spec of COACHES) {
    // eslint-disable-next-line no-console
    console.log(`\n[seed_demo_coaches] seeding coach ${spec.email} …`);
    results.push(await seedCoach(spec, ex, weekStartIso));
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
