/**
 * seed_demo.ts — Idempotent demo dataset for the FAHYBRIK V2 coach dashboard.
 *
 * Stands up a coherent, realistic roster for the DEV-bypass coach so Alex can open
 * the V2 dashboard in a browser and polish the UX. Run against a DISPOSABLE Neon
 * branch ONLY — never the main/production DB.
 *
 *   DATABASE_URL='<branch-conn>' pnpm --filter @fahybrid/infra exec tsx scripts/seed_demo.ts
 *
 * Idempotent: every demo entity carries a stable marker (athlete emails under the
 * @demo.fahybrid.local domain). Re-running deletes the prior demo athletes (cascade)
 * and re-inserts them, so the dataset converges to the same state every time. It
 * NEVER touches non-demo athletes, and only writes data owned by the bypass coach.
 *
 * Why this coach: the dev-login bypass (web/lib/auth/coach-session.ts + proxy.ts)
 * resolves the coach by a fixed email in NODE_ENV=development. We seed/repair that
 * coach so the dashboard is reachable with zero login.
 */
import { getSql } from './_db.ts';

// ── Constants ────────────────────────────────────────────────────────────────

/** Email the dev-login bypass resolves to (coach-session.ts: DEV_BYPASS_COACH_EMAIL). */
const COACH_EMAIL = 'alexsole@gmail.com';
/** The real coach's name (ground truth) — never invent a surname for the demo. */
const COACH_DISPLAY_NAME = 'Pablo Amigo';
/** Stable marker domain — every demo athlete user lives here, so re-runs are safe. */
const DEMO_EMAIL_DOMAIN = '@demo.fahybrid.local';

/** Box timezone day key (Europe/Madrid ≈ UTC for date math at seed time). */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
/** Monday (ISO) of the week containing `d`, in UTC. */
function mondayOf(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const delta = (day + 6) % 7; // days since Monday
  return addDays(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), -delta);
}

type Modality = 'individual' | 'dobles' | 'pro_elite';
type SubStatus = 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing';

/**
 * Demo athlete spec. Each athlete is engineered to light up a specific lane /
 * roster status so the UX renders richly and the coach can judge every state.
 */
interface AthleteSpec {
  email: string;
  full_name: string;
  level_name: 'N1' | 'N2' | 'N3' | 'N4' | 'N5';
  discipline: 'hyrox' | 'hybrid' | 'running';
  sex: 'male' | 'female';
  modality: Modality;
  sub_status: SubStatus;
  is_comp: boolean;
  /** cancel_at_period_end + a near period end → renewal alert. */
  renewal_soon?: boolean;
  intake_reviewed: boolean;
  /** 'full' = active plan w/ this-week assignments; 'empty_week' = plan, no week; 'none' = no plan. */
  plan: 'full' | 'empty_week' | 'none';
  /** Fraction of this week's sessions already completed (drives adherence %). */
  week_completion: number;
  readiness: number | null;
  /** Seed N unread coach messages → "espera respuesta" lane. */
  unread_messages: number;
  /** Days since last activity while still having recent assignments → inactivity alert. */
  inactive_days?: number;
  /** Days until a TARGET race (countdown card). */
  target_race_in_days?: number;
  block_type: 'ACC' | 'TRANS' | 'REAL';
  /** Which week within the block the athlete currently sits in (1-based). */
  block_current_week: number;
  block_total_weeks: number;
}

const ATHLETES: AthleteSpec[] = [
  {
    email: `alex.sole${DEMO_EMAIL_DOMAIN}`,
    full_name: 'Alex Solé',
    level_name: 'N3',
    discipline: 'hyrox',
    sex: 'male',
    modality: 'individual',
    sub_status: 'active',
    is_comp: false,
    intake_reviewed: true,
    plan: 'full',
    week_completion: 0.6,
    readiness: 78,
    unread_messages: 0,
    block_type: 'ACC',
    block_current_week: 2,
    block_total_weeks: 5,
  },
  {
    email: `marc.vidal${DEMO_EMAIL_DOMAIN}`,
    full_name: 'Marc Vidal',
    level_name: 'N4',
    discipline: 'hyrox',
    sex: 'male',
    modality: 'pro_elite',
    sub_status: 'active',
    is_comp: false,
    intake_reviewed: true,
    plan: 'full',
    week_completion: 0.4,
    readiness: 42, // < 45 → "Fatiga CNS alta" + vigilar fisiología
    unread_messages: 0,
    target_race_in_days: 24,
    block_type: 'TRANS',
    block_current_week: 2,
    block_total_weeks: 4,
  },
  {
    email: `laura.perez${DEMO_EMAIL_DOMAIN}`,
    full_name: 'Laura Pérez',
    level_name: 'N2',
    discipline: 'hybrid',
    sex: 'female',
    modality: 'individual',
    sub_status: 'active',
    is_comp: false,
    intake_reviewed: true,
    plan: 'empty_week', // plan exists but no assignments THIS week
    week_completion: 0,
    readiness: 66,
    unread_messages: 0,
    block_type: 'ACC',
    block_current_week: 1,
    block_total_weeks: 5,
  },
  {
    email: `julia.roca${DEMO_EMAIL_DOMAIN}`,
    full_name: 'Júlia Roca',
    level_name: 'N5',
    discipline: 'hyrox',
    sex: 'female',
    modality: 'dobles',
    sub_status: 'active',
    is_comp: true, // coach-granted → comp badge
    intake_reviewed: true,
    plan: 'full',
    week_completion: 1.0, // 100% + clean week → "listo progresar"
    readiness: 88,
    unread_messages: 0,
    target_race_in_days: 11,
    block_type: 'REAL',
    block_current_week: 2,
    block_total_weeks: 3,
  },
  {
    email: `pol.serra${DEMO_EMAIL_DOMAIN}`,
    full_name: 'Pol Serra',
    level_name: 'N1',
    discipline: 'running',
    sex: 'male',
    modality: 'individual',
    sub_status: 'active',
    is_comp: false,
    intake_reviewed: true,
    plan: 'none', // no plan → "Sin plan activo"
    week_completion: 0,
    readiness: null,
    unread_messages: 0,
    block_type: 'ACC',
    block_current_week: 1,
    block_total_weeks: 5,
  },
  {
    email: `anna.camps${DEMO_EMAIL_DOMAIN}`,
    full_name: 'Anna Camps',
    level_name: 'N3',
    discipline: 'hyrox',
    sex: 'female',
    modality: 'individual',
    sub_status: 'trialing',
    is_comp: false,
    intake_reviewed: false, // onboarded, intake NOT reviewed → intake_pending (critical)
    plan: 'none',
    week_completion: 0,
    readiness: null,
    unread_messages: 0,
    block_type: 'ACC',
    block_current_week: 1,
    block_total_weeks: 5,
  },
  {
    email: `david.costa${DEMO_EMAIL_DOMAIN}`,
    full_name: 'David Costa',
    level_name: 'N4',
    discipline: 'hybrid',
    sex: 'male',
    modality: 'dobles',
    sub_status: 'active',
    is_comp: false,
    renewal_soon: true,
    intake_reviewed: true,
    plan: 'full',
    week_completion: 0.5,
    readiness: 71,
    unread_messages: 2, // → "espera respuesta" + message inbox item
    block_type: 'ACC',
    block_current_week: 4,
    block_total_weeks: 5,
  },
  {
    email: `sofia.mas${DEMO_EMAIL_DOMAIN}`,
    full_name: 'Sofia Mas',
    level_name: 'N2',
    discipline: 'hyrox',
    sex: 'female',
    modality: 'individual',
    sub_status: 'past_due', // → billing alert
    is_comp: false,
    intake_reviewed: true,
    plan: 'full',
    week_completion: 0.3,
    readiness: 58,
    unread_messages: 0,
    inactive_days: 3, // recent assignments but last activity 3d ago → inactivity alert
    block_type: 'TRANS',
    block_current_week: 1,
    block_total_weeks: 4,
  },
];

// Day-of-week → typical session count for a "full" week (Mon..Sun). Rest on Wed/Sun.
const WEEK_SESSION_DAYS = [0, 1, 2, 4, 5]; // offsets from Monday with a scheduled session (5/week)

async function main() {
  const sql = getSql();
  const today = new Date();
  const weekStart = mondayOf(today);

  // ── Guardrail: refuse to run against the known main branch host ──────────────
  // SEED_DEMO_ALLOW_MAIN=1 overrides it — explicit opt-in for the (temporary)
  // single-universe era where Alex wants the demo roster visible in production.
  const host = (process.env.DATABASE_URL ?? '').match(/@([^/?]+)/)?.[1] ?? '';
  if (host.includes('ep-aged-base-alij2f0j') && process.env.SEED_DEMO_ALLOW_MAIN !== '1') {
    throw new Error(
      `Refusing to seed: DATABASE_URL points at the MAIN branch host (${host}). ` +
        `Point DATABASE_URL at a disposable Neon branch, or set SEED_DEMO_ALLOW_MAIN=1 on purpose.`,
    );
  }
  // eslint-disable-next-line no-console
  console.log(`[seed_demo] target host: ${host || '(unknown)'}`);

  // ── 1. Resolve / repair the dev-bypass coach ─────────────────────────────────
  // Resolve the coach like the app does (coach_members, migration 0113) with the
  // legacy owner link as fallback — the email's ACTIVE club membership is the truth,
  // not whichever coach row it happened to mint first.
  const coachRows = await sql<{ coach_id: string; user_id: string }[]>`
    select coalesce(cm.coach_id, c_owned.id)::text as coach_id, u.id::text as user_id
    from users u
    left join coach_members cm on cm.user_id = u.id and cm.removed_at is null
    left join coaches c_owned on c_owned.user_id = u.id
    where u.email = ${COACH_EMAIL} and u.deleted_at is null
      and coalesce(cm.coach_id, c_owned.id) is not null
    limit 1
  `;
  if (!coachRows[0]) {
    throw new Error(
      `Dev-bypass coach (${COACH_EMAIL}) not found in this DB. The branch should be ` +
        `a copy of main where this coach already exists. Aborting rather than fabricating it.`,
    );
  }
  const coachId = Number(coachRows[0].coach_id);
  // Give the coach a presentable display name (idempotent).
  await sql`update coaches set full_name = ${COACH_DISPLAY_NAME}, updated_at = now() where id = ${coachId}`;
  // eslint-disable-next-line no-console
  console.log(`[seed_demo] coach id=${coachId} (${COACH_EMAIL}) → "${COACH_DISPLAY_NAME}"`);

  // ── 2. Level + a usable template (FK target for assignments) ─────────────────
  const levelRows = await sql<{ id: string; name: string }[]>`
    select id::text, name from athlete_levels where coach_id = ${coachId}
  `;
  const levelByName = new Map(levelRows.map((r) => [r.name, Number(r.id)]));
  if (levelByName.size === 0) {
    throw new Error(`No athlete_levels for coach ${coachId} (migration 0057 should have seeded N1-N5).`);
  }

  const tplRows = await sql<{ id: string; version: number }[]>`
    select id::text, version from templates where coach_id = ${coachId} and archived_at is null
    order by id asc limit 1
  `;
  if (!tplRows[0]) {
    throw new Error(`No templates for coach ${coachId} — workout_assignments need a template FK.`);
  }
  const templateId = Number(tplRows[0].id);
  const templateVersion = tplRows[0].version;

  // ── 3. Idempotent reset: delete prior demo athletes ─────────────────────────
  // chat_messages.sender_user_id is ON DELETE RESTRICT, so a demo athlete's user
  // can't be deleted while it still authored messages. Delete their chat threads
  // first (cascades chat_messages via thread_id), then the users (cascades
  // athletes → plans → assignments → subscriptions → readiness → races).
  await sql`
    delete from chat_threads
    where athlete_id in (
      select a.id from athletes a
      join users u on u.id = a.user_id
      where u.email like ${'%' + DEMO_EMAIL_DOMAIN}
    )
  `;
  await sql`
    delete from users
    where email like ${'%' + DEMO_EMAIL_DOMAIN} and role = 'athlete'
  `;
  // eslint-disable-next-line no-console
  console.log(`[seed_demo] cleared prior demo athletes (${DEMO_EMAIL_DOMAIN})`);

  // ── 4. Seed each athlete ─────────────────────────────────────────────────────
  for (const spec of ATHLETES) {
    await seedAthlete(sql, {
      spec,
      coachId,
      coachUserId: Number(coachRows[0].user_id),
      templateId,
      templateVersion,
      levelId: levelByName.get(spec.level_name)!,
      today,
      weekStart,
    });
  }

  // ── 5. A demo microcycle (program_month_templates + 4 weeks) so /microciclos
  //      and the Level×Días matrix render with real day-modality strips. The
  //      branch already has 2 month templates; we add one clearly-named demo one
  //      with populated slots, idempotently (delete by name + re-create).
  await seedDemoMicrocycle(sql, { coachId, templateId });

  await sql.end();
  // eslint-disable-next-line no-console
  console.log('[seed_demo] done.');
}

interface SeedAthleteCtx {
  spec: AthleteSpec;
  coachId: number;
  coachUserId: number;
  templateId: number;
  templateVersion: number;
  levelId: number;
  today: Date;
  weekStart: Date;
}

async function seedAthlete(sql: ReturnType<typeof getSql>, ctx: SeedAthleteCtx) {
  const { spec, coachId, coachUserId, templateId, templateVersion, levelId, today, weekStart } = ctx;

  // 4a. user + athlete
  const onboardedAt = spec.intake_reviewed
    ? addDays(today, -30)
    : addDays(today, -1); // recent onboarding for the intake_pending case
  const userRows = await sql<{ id: string }[]>`
    insert into users (email, role, created_at)
    values (${spec.email}, 'athlete', ${addDays(today, -45).toISOString()})
    returning id::text
  `;
  const userId = Number(userRows[0]!.id);

  const athleteRows = await sql<{ id: string }[]>`
    insert into athletes (
      user_id, coach_id, full_name, sex, primary_discipline,
      level_id, level_source, level_confidence,
      onboarded_at, intake_completed_at, training_days_per_week,
      created_at, updated_at
    )
    values (
      ${userId}, ${coachId}, ${spec.full_name}, ${spec.sex}::athlete_sex,
      ${spec.discipline}::discipline,
      ${levelId}, 'coach', 'high',
      ${onboardedAt.toISOString()},
      ${spec.intake_reviewed ? addDays(today, -28).toISOString() : null},
      5,
      now(), now()
    )
    returning id::text
  `;
  const athleteId = Number(athleteRows[0]!.id);

  // 4b. subscription (modality + comp + billing state)
  const periodEnd = spec.renewal_soon ? addDays(today, 4) : addDays(today, 25);
  await sql`
    insert into subscriptions (
      user_id, plan_type, status, source, current_period_end, cancel_at_period_end, created_at
    )
    values (
      ${userId}, ${spec.modality}, ${spec.sub_status}::subscription_status,
      ${spec.is_comp ? 'comp' : 'stripe'},
      ${periodEnd.toISOString()}, ${spec.renewal_soon ?? false},
      ${addDays(today, -40).toISOString()}
    )
  `;

  // 4c. readiness snapshot for today (drives physiology lane + roster readiness)
  if (spec.readiness != null) {
    await sql`
      insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score, computed_at)
      values (${athleteId}, ${isoDay(today)}::date, ${spec.readiness}, now())
      on conflict (athlete_id, recorded_for) do update set score = excluded.score
    `;
  }

  // 4d. plan: active macrocycle → block → microcycles → this-week assignments
  if (spec.plan !== 'none') {
    await seedPlan(sql, {
      athleteId,
      templateId,
      templateVersion,
      today,
      weekStart,
      spec,
    });
  }

  // 4e. chat thread + messages (unread → "espera respuesta")
  await seedChat(sql, { coachId, coachUserId, athleteId, userId, spec, today });
}

interface SeedPlanCtx {
  athleteId: number;
  templateId: number;
  templateVersion: number;
  today: Date;
  weekStart: Date;
  spec: AthleteSpec;
}

async function seedPlan(sql: ReturnType<typeof getSql>, ctx: SeedPlanCtx) {
  const { athleteId, templateId, templateVersion, today, weekStart, spec } = ctx;

  // The block spans `block_total_weeks`; the current week sits at block_current_week.
  // first week of block = this week − (block_current_week − 1).
  const blockFirstWeekStart = addDays(weekStart, -(spec.block_current_week - 1) * 7);
  const blockEnd = addDays(blockFirstWeekStart, spec.block_total_weeks * 7 - 1);
  const macroStart = blockFirstWeekStart;
  const macroEnd = addDays(blockEnd, 14); // a little tail so it reads as ongoing

  const macroRows = await sql<{ id: string }[]>`
    insert into atr_macrocycles (athlete_id, name, start_date, end_date, status, created_at, updated_at)
    values (${athleteId}, ${'Demo macrociclo'}, ${isoDay(macroStart)}::date, ${isoDay(macroEnd)}::date, 'active', now(), now())
    returning id::text
  `;
  const macroId = Number(macroRows[0]!.id);

  const blockRows = await sql<{ id: string }[]>`
    insert into atr_blocks (macrocycle_id, type, position, start_date, end_date, status, created_at, updated_at)
    values (${macroId}, ${spec.block_type}::atr_block_type, 0, ${isoDay(blockFirstWeekStart)}::date, ${isoDay(blockEnd)}::date, 'active', now(), now())
    returning id::text
  `;
  const blockId = Number(blockRows[0]!.id);

  // One microcycle per week of the block. week_number is macro-relative (1-based
  // from block start), matching how the roster derives block_week.
  const microIds: number[] = [];
  for (let w = 0; w < spec.block_total_weeks; w++) {
    const wkStart = addDays(blockFirstWeekStart, w * 7);
    const wkEnd = addDays(wkStart, 6);
    const mcRows = await sql<{ id: string }[]>`
      insert into microcycles (block_id, week_number, start_date, end_date, created_at, updated_at)
      values (${blockId}, ${w + 1}, ${isoDay(wkStart)}::date, ${isoDay(wkEnd)}::date, now(), now())
      returning id::text
    `;
    microIds.push(Number(mcRows[0]!.id));
  }
  const currentMicroId = microIds[spec.block_current_week - 1]!;

  // Materialize past-week assignments (so the plan is "real") for the block so far.
  for (let w = 0; w < spec.block_current_week - 1; w++) {
    const wkStart = addDays(blockFirstWeekStart, w * 7);
    for (const off of WEEK_SESSION_DAYS) {
      await sql`
        insert into workout_assignments (athlete_id, microcycle_id, scheduled_for, template_id, template_version, status, created_at, updated_at)
        values (${athleteId}, ${microIds[w]!}, ${isoDay(addDays(wkStart, off))}::date, ${templateId}, ${templateVersion}, 'completed', now(), now())
      `;
    }
  }

  // This week's assignments — unless the spec wants an empty current week.
  if (spec.plan === 'full') {
    const completedCount = Math.round(WEEK_SESSION_DAYS.length * spec.week_completion);
    const lastActivityOffset =
      spec.inactive_days != null
        ? // place the last completed session `inactive_days` ago (relative to today)
          Math.max(0, dayOffsetInWeek(today, weekStart) - spec.inactive_days)
        : null;

    for (let i = 0; i < WEEK_SESSION_DAYS.length; i++) {
      const off = WEEK_SESSION_DAYS[i]!;
      const dayDate = addDays(weekStart, off);
      const isPastOrToday = isoDay(dayDate) <= isoDay(today);
      let status: 'scheduled' | 'completed' | 'missed' = 'scheduled';
      if (isPastOrToday) {
        status = i < completedCount ? 'completed' : 'missed';
      }
      // For the inactivity case, only count sessions on/before the last-activity day
      // as completed so the inactivity gap is real.
      if (lastActivityOffset != null && status === 'completed' && off > lastActivityOffset) {
        status = 'missed';
      }
      await sql`
        insert into workout_assignments (athlete_id, microcycle_id, scheduled_for, template_id, template_version, status, created_at, updated_at)
        values (${athleteId}, ${currentMicroId}, ${isoDay(dayDate)}::date, ${templateId}, ${templateVersion}, ${status}::assignment_status, now(), now())
      `;
    }

    // daily_checkin on the last-activity day (so inactivity math has a real anchor)
    const checkinDay =
      lastActivityOffset != null ? addDays(weekStart, lastActivityOffset) : addDays(today, -1);
    await sql`
      insert into daily_checkins (athlete_id, recorded_for, recorded_at, sub_score, soreness, mood, motivation, fatigue, sleep_quality, created_at, updated_at)
      values (${athleteId}, ${isoDay(checkinDay)}::date, ${checkinDay.toISOString()}, ${spec.readiness ?? 65}, 2, 4, 4, 3, 4, now(), now())
      on conflict (athlete_id, recorded_for) do nothing
    `;
  }

  // Target race countdown
  if (spec.target_race_in_days != null) {
    await sql`
      insert into races (
        athlete_id, name, event_type, format, division, gender_category,
        priority, race_date, status, created_at, updated_at
      )
      values (
        ${athleteId}, ${'HYROX Barcelona'}, 'hyrox', ${spec.modality === 'dobles' ? 'doubles' : 'singles'}::race_format,
        'open', ${spec.sex === 'female' ? 'women' : 'men'}::race_gender,
        'target', ${isoDay(addDays(today, spec.target_race_in_days))}::date, 'registered', now(), now()
      )
    `;
  }
}

function dayOffsetInWeek(today: Date, weekStart: Date): number {
  return Math.round((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) -
    Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate())) / 86_400_000);
}

interface SeedChatCtx {
  coachId: number;
  coachUserId: number;
  athleteId: number;
  userId: number;
  spec: AthleteSpec;
  today: Date;
}

async function seedChat(sql: ReturnType<typeof getSql>, ctx: SeedChatCtx) {
  const { coachId, coachUserId, athleteId, userId, spec, today } = ctx;

  // A thread for every athlete with at least one message, so /mensajes is populated.
  const lastAt = addDays(today, spec.unread_messages > 0 ? 0 : -2);
  const threadRows = await sql<{ id: string }[]>`
    insert into chat_threads (coach_id, athlete_id, last_message_at, unread_for_coach, created_at, updated_at)
    values (${coachId}, ${athleteId}, ${lastAt.toISOString()}, ${spec.unread_messages}, now(), now())
    on conflict (coach_id, athlete_id) do update
      set last_message_at = excluded.last_message_at, unread_for_coach = excluded.unread_for_coach
    returning id::text
  `;
  const threadId = Number(threadRows[0]!.id);

  // A short, realistic conversation. Coach messages are read; the last N athlete
  // messages are unread (read_at null) to match unread_for_coach.
  const convo: Array<{ from: 'coach' | 'athlete'; body: string; daysAgo: number }> = [
    { from: 'coach', body: 'Buenas! ¿Cómo fuiste con la sesión de series de ayer?', daysAgo: 3 },
    { from: 'athlete', body: 'Bien, las primeras 3 muy cómodo, la última me costó bastante.', daysAgo: 3 },
    { from: 'coach', body: 'Perfecto, es justo el estímulo que buscábamos. Mañana toca Z2 suave.', daysAgo: 2 },
  ];
  if (spec.unread_messages > 0) {
    convo.push({
      from: 'athlete',
      body: 'Oye, tengo una duda con el sled push, ¿qué peso pongo si no llego al pautado?',
      daysAgo: 0,
    });
    if (spec.unread_messages > 1) {
      convo.push({ from: 'athlete', body: 'Y otra cosa: el sábado no podré entrenar, ¿lo muevo?', daysAgo: 0 });
    }
  }

  for (const m of convo) {
    const senderUserId = m.from === 'coach' ? coachUserId : userId;
    const createdAt = addDays(today, -m.daysAgo);
    const unread = m.from === 'athlete' && m.daysAgo === 0 && spec.unread_messages > 0;
    await sql`
      insert into chat_messages (thread_id, sender_user_id, body, created_at, read_at)
      values (${threadId}, ${senderUserId}, ${m.body}, ${createdAt.toISOString()}, ${unread ? null : createdAt.toISOString()})
    `;
  }
}

/**
 * One presentable demo microcycle with 4 weeks whose slots_json holds real day
 * sessions (referencing a real template + a methodology-grouped block) so the
 * /microciclos editor renders day-modality strips and the biblioteca usage count
 * picks it up. Idempotent: delete by name, re-create.
 */
async function seedDemoMicrocycle(
  sql: ReturnType<typeof getSql>,
  params: { coachId: number; templateId: number },
) {
  const { coachId, templateId } = params;
  const MONTH_NAME = 'Demo · Acumulación N3';

  // Idempotent reset. Deleting the month cascades program_month_weeks (junction)
  // but program_week_templates are ON DELETE RESTRICT from that junction, so the
  // weeks would orphan + accumulate on re-run. Delete the month first (clears the
  // junction), then the demo week templates by their stable name prefix.
  await sql`
    delete from program_month_templates where coach_id = ${coachId} and name = ${MONTH_NAME}
  `;
  await sql`
    delete from program_week_templates
    where coach_id = ${coachId} and name like ${MONTH_NAME + ' · Semana %'}
  `;

  // Agnostic level: pick the coach's first athlete_level (by sort_order) so the
  // seeded microciclo carries a real level_id. Null when the coach has no levels.
  const lvlRows = await sql<{ id: string }[]>`
    select id::text from athlete_levels
    where coach_id = ${coachId}
    order by sort_order asc, id asc
    limit 1
  `;
  const levelId = lvlRows[0] ? Number(lvlRows[0].id) : null;

  const monthRows = await sql<{ id: string }[]>`
    insert into program_month_templates (coach_id, name, level_id)
    values (${coachId}, ${MONTH_NAME}, ${levelId})
    returning id::text
  `;
  const monthId = Number(monthRows[0]!.id);

  const WEEK_FOCUS = ['Carga base', 'Carga progresiva', 'Pico de carga', 'Descarga'];
  for (let i = 0; i < 4; i++) {
    // A week with sessions Mon/Tue/Thu/Fri/Sat — mixed modalities via block format
    // + methodology_group_id so the day strips show fuerza / ergo / carrera / WOD.
    const days = [1, 2, 3, 4, 5, 6, 7].map((dow) => {
      const sessions = sessionsForDay(dow, templateId, i);
      return { day_of_week: dow, sessions };
    });
    const slots = { days };
    await sql<{ id: string }[]>`
      insert into program_week_templates (coach_id, name, level_id, focus, slots_json)
      values (
        ${coachId}, ${`${MONTH_NAME} · Semana ${i + 1}`}, ${levelId},
        ${WEEK_FOCUS[i]!}, ${sql.json(slots as never)}
      )
      returning id::text
    `.then(async (wkRows) => {
      const weekId = Number(wkRows[0]!.id);
      await sql`
        insert into program_month_weeks (month_template_id, week_template_id, position)
        values (${monthId}, ${weekId}, ${i})
      `;
    });
  }
  // eslint-disable-next-line no-console
  console.log(`[seed_demo] demo microcycle "${MONTH_NAME}" (id=${monthId}) + 4 weeks`);
}

/** Build day sessions with varied block formats/modalities for the editor strips. */
function sessionsForDay(dow: number, templateId: number, weekIdx: number) {
  // dow: 1=Mon ... 7=Sun. Wed (3) and Sun (7) are rest.
  if (dow === 3 || dow === 7) return [];
  // Map a day to a (format, methodology_group_id, title) for the block strip.
  const byDay: Record<number, { format: string; group: number; title: string }> = {
    1: { format: 'strength_block', group: 1, title: 'Fuerza base · sentadilla + peso muerto' },
    2: { format: 'intervals', group: 3, title: 'Series ergómetros · row/ski' },
    4: { format: 'tempo', group: 5, title: 'Carrera Z2 + movilidad' },
    5: { format: 'circuit', group: 6, title: 'WOD estaciones HYROX' },
    6: { format: 'intervals', group: 4, title: 'Series running específicas' },
  };
  const cfg = byDay[dow]!;
  return [
    {
      kind: 'workout',
      template_id: templateId,
      focus: cfg.title,
      blocks: [
        {
          uid: `demo-${weekIdx}-${dow}`,
          format: cfg.format,
          title: cfg.title,
          methodology_group_id: cfg.group,
          items: [],
        },
      ],
    },
  ];
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed_demo] FAILED:', err);
  process.exitCode = 1;
});
