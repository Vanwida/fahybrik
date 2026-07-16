/**
 * Isolated fixtures for real-DB integration tests.
 *
 * Each test creates its OWN coach + athlete (+ optional macrocycle/blocks/
 * templates) with unique emails, then tears them down via `Fixture.cleanup()`.
 * No test depends on seed data and no test leaves rows behind, so suites are
 * order-independent and re-runnable against the same branch.
 *
 * All inserts go through a real `Sql` client (Neon test branch) — there is no
 * scripted-array fake here. The SQL exercised by the helpers is the same DDL
 * shape the production code reads back.
 */

import type { Sql } from '@/lib/db';

let seq = 0;
function uniq(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}-${Math.floor(Math.random() * 1e6)}`;
}

export type Fixture = {
  sql: Sql;
  coachId: number;
  coachUserId: number;
  athleteId: number;
  athleteUserId: number;
  /** Coach-scoped `templates` ids registered for teardown. */
  templateIds: number[];
  /** Coach-scoped month-template bundles registered for teardown. */
  monthTemplates: Array<{ monthId: number; weekIds: number[] }>;
  /** Exercise ids created by the fixture, removed last in teardown. */
  exerciseIds: number[];
  /** Library-block ids created by the fixture (block_exercises cascade). */
  blockIds: number[];
  /**
   * Deletes every row this fixture created, in FK-safe order. Idempotent.
   * Athlete child rows (workout_assignments, month assignments) are purged
   * BEFORE the coach-scoped templates they reference, then the coach/users.
   */
  cleanup: () => Promise<void>;
};

/** Create a coach + an athlete owned by that coach. */
export async function makeCoachAndAthlete(sql: Sql): Promise<Fixture> {
  const coachUser = await sql<Array<{ id: string }>>`
    insert into users (email, role) values (${uniq('coach') + '@test.local'}, 'coach')
    returning id::text
  `;
  const coachUserId = Number(coachUser[0]!.id);
  const coach = await sql<Array<{ id: string }>>`
    insert into coaches (user_id, full_name) values (${coachUserId}, 'Test Coach')
    returning id::text
  `;
  const coachId = Number(coach[0]!.id);

  const athleteUser = await sql<Array<{ id: string }>>`
    insert into users (email, role) values (${uniq('ath') + '@test.local'}, 'athlete')
    returning id::text
  `;
  const athleteUserId = Number(athleteUser[0]!.id);
  const athlete = await sql<Array<{ id: string }>>`
    insert into athletes (user_id, coach_id, full_name)
    values (${athleteUserId}, ${coachId}, 'Test Athlete')
    returning id::text
  `;
  const athleteId = Number(athlete[0]!.id);

  const fx: Fixture = {
    sql,
    coachId,
    coachUserId,
    athleteId,
    athleteUserId,
    templateIds: [],
    monthTemplates: [],
    exerciseIds: [],
    blockIds: [],
    cleanup: async () => {
      // FK-safe order. Some tables may have no rows for this fixture; the WHERE
      // clauses make each delete a no-op then.
      // 1) Athlete-scoped rows that reference templates / program templates.
      await sql`delete from week_adjustment_proposals where athlete_id = ${athleteId}`;
      await sql`delete from daily_checkins where athlete_id = ${athleteId}`;
      await sql`delete from workout_assignments where athlete_id = ${athleteId}`;
      await sql`delete from athlete_month_assignments where athlete_id = ${athleteId}`;
      await sql`delete from microcycles where athlete_id = ${athleteId}`;
      await sql`delete from athletes where id = ${athleteId}`;
      // 2) Coach-scoped program/workout templates (now unreferenced).
      for (const m of fx.monthTemplates) {
        await sql`delete from program_month_weeks where month_template_id = ${m.monthId}`;
        await sql`delete from program_month_templates where id = ${m.monthId}`;
        if (m.weekIds.length > 0) {
          await sql`delete from program_week_templates where id in ${sql(m.weekIds)}`;
        }
      }
      if (fx.templateIds.length > 0) {
        await sql`delete from templates where id in ${sql(fx.templateIds)}`;
      }
      // Catch-all: templates the materializer created inline are coach-scoped
      // with auto-generated ids we don't track. Their segments cascade-delete.
      await sql`delete from templates where coach_id = ${coachId}`;
      // 3) Library blocks (block_exercises cascade) — MUST go before the coach,
      // since blocks.coach_id FKs coaches (blocks_coach_id_fkey).
      if (fx.blockIds.length > 0) {
        await sql`delete from blocks where id in ${sql(fx.blockIds)}`;
      }
      // 4) Exercises the fixture seeded (block_exercises + template_segments FKs
      // already cascaded via blocks/templates above). MUST run before the coach
      // delete below: since migration 0132, a PROPIO exercise carries
      // `exercises.coach_id references coaches(id) on delete restrict`, so a
      // coach-owned exercise still on the table would block deleting its coach.
      if (fx.exerciseIds.length > 0) {
        await sql`delete from exercises where id in ${sql(fx.exerciseIds)}`;
      }
      // 5) Coach + users.
      await sql`delete from coaches where id = ${coachId}`;
      await sql`delete from users where id in (${athleteUserId}, ${coachUserId})`;
    },
  };

  return fx;
}

/**
 * Insert a microciclo (a week row) directly under an athlete — AGNOSTIC: microcycles
 * now hang off `athlete_id` (no ATR block/macrocycle). Returns its id. Most tests no
 * longer need this (the materializer self-creates microcycles by athlete_id + date),
 * but it stays for tests that seed a bare microciclo to read back.
 */
export async function makeMicrocycle(params: {
  sql: Sql;
  athleteId: number;
  startIso: string;
  endIso: string;
  weekNumber?: number;
}): Promise<{ microcycleId: number }> {
  const { sql, athleteId, startIso, endIso } = params;
  const mc = await sql<Array<{ id: string }>>`
    insert into microcycles (athlete_id, week_number, start_date, end_date)
    values (${athleteId}, ${params.weekNumber ?? 1}, ${startIso}::date, ${endIso}::date)
    returning id::text
  `;
  return { microcycleId: Number(mc[0]!.id) };
}

/**
 * Insert a workout template owned by the fixture's coach. Auto-registers the
 * id with the fixture so `fx.cleanup()` removes it in FK-safe order.
 */
export async function makeTemplate(params: {
  fx: Fixture;
  name: string;
  format?: string;
}): Promise<number> {
  const { fx } = params;
  const rows = await fx.sql<Array<{ id: string }>>`
    insert into templates (coach_id, name, format, target_block, version)
    values (${fx.coachId}, ${params.name}, ${params.format ?? 'circuit'}::template_format, 'any', 1)
    returning id::text
  `;
  const id = Number(rows[0]!.id);
  fx.templateIds.push(id);
  return id;
}

/**
 * Insert a single workout assignment for an athlete on a given date/status.
 * Requires a template id (FK). Returns the assignment id.
 */
export async function makeAssignment(params: {
  fx: Fixture;
  templateId: number;
  scheduledForIso: string;
  status?: 'scheduled' | 'completed' | 'missed' | 'skipped';
  microcycleId?: number | null;
  notes?: string | null;
}): Promise<number> {
  const { fx } = params;
  const rows = await fx.sql<Array<{ id: string }>>`
    insert into workout_assignments (
      athlete_id, microcycle_id, scheduled_for, template_id, template_version, status, notes
    )
    values (
      ${fx.athleteId},
      ${params.microcycleId ?? null},
      ${params.scheduledForIso}::date,
      ${params.templateId},
      1,
      ${params.status ?? 'scheduled'}::assignment_status,
      ${params.notes ?? null}
    )
    returning id::text
  `;
  return Number(rows[0]!.id);
}

/** Insert a daily check-in (drives sub_score → readiness verdict triggers). */
export async function makeCheckin(params: {
  fx: Fixture;
  recordedForIso: string;
  subScore: number;
  notes?: string | null;
}): Promise<void> {
  await params.fx.sql`
    insert into daily_checkins (athlete_id, recorded_for, recorded_at, sub_score, notes)
    values (
      ${params.fx.athleteId},
      ${params.recordedForIso}::date,
      ${params.recordedForIso + 'T08:00:00Z'}::timestamptz,
      ${params.subScore},
      ${params.notes ?? null}
    )
  `;
}

/**
 * Insert a month template + N week templates + junction rows.
 * Each week is given `slots_json` with one workout session pointing at
 * `workoutTemplateId` on the given days. Returns ids so the caller can
 * clean up program-template rows it owns.
 */
export async function makeMonthTemplate(params: {
  fx: Fixture;
  weekCount: number;
  /** day_of_week (1=Mon..7=Sun) that should carry a workout session each week. */
  workoutDays: number[];
  workoutTemplateId: number;
  level?: string;
}): Promise<{ monthId: number; weekIds: number[] }> {
  const sql = params.fx.sql;
  const coachId = params.fx.coachId;

  const month = await sql<Array<{ id: string }>>`
    insert into program_month_templates (coach_id, name)
    values (${coachId}, 'Test month')
    returning id::text
  `;
  const monthId = Number(month[0]!.id);

  const weekIds: number[] = [];
  for (let i = 0; i < params.weekCount; i++) {
    const slots = {
      days: params.workoutDays.map((dow) => ({
        day_of_week: dow,
        sessions: [{ kind: 'workout', template_id: params.workoutTemplateId }],
      })),
    };
    const week = await sql<Array<{ id: string }>>`
      insert into program_week_templates (coach_id, name, slots_json)
      values (
        ${coachId},
        ${`Test week ${i + 1}`},
        ${sql.json(slots as Parameters<typeof sql.json>[0])}
      )
      returning id::text
    `;
    const weekId = Number(week[0]!.id);
    weekIds.push(weekId);
    await sql`
      insert into program_month_weeks (month_template_id, week_template_id, position)
      values (${monthId}, ${weekId}, ${i})
    `;
  }

  const bundle = { monthId, weekIds };
  params.fx.monthTemplates.push(bundle);
  return bundle;
}

/** Insert an exercise, auto-registered for teardown. `category`/`modality`
 *  default to 'strength' (exercises.modality is NOT NULL since 0053); pass them
 *  to seed a specific modality (e.g. 'functional' for a WOD movement).
 *  `coachId` (migration 0132, ownership) is OPTIONAL and defaults to omitted →
 *  `coach_id` stays NULL, a BASE catalog exercise — every existing caller keeps
 *  seeding BASE rows unchanged. Pass a fixture's `coachId` to seed a PROPIO
 *  exercise owned by that coach (invisible to every other coach). */
export async function makeExercise(params: {
  fx: Fixture;
  name?: string;
  slug?: string;
  category?: string;
  modality?: string;
  coachId?: number;
}): Promise<number> {
  const slug = params.slug ?? uniq('ex');
  const rows = await params.fx.sql<Array<{ id: string }>>`
    insert into exercises (slug, name, category, modality, coach_id)
    values (
      ${slug}, ${params.name ?? slug},
      ${params.category ?? 'strength'}::exercise_category, ${params.modality ?? 'strength'},
      ${params.coachId ?? null}
    )
    returning id::text
  `;
  const id = Number(rows[0]!.id);
  params.fx.exerciseIds.push(id);
  return id;
}

/**
 * Insert a library block (0037) + its structured `block_exercises` (0038).
 * `needs_review` blocks pass an empty `exercises` array (no structure). The
 * block FKs methodology_group 1 (seeded). Registered for fixture teardown.
 */
export async function makeLibraryBlock(params: {
  fx: Fixture;
  title: string;
  description: string;
  needsReview?: boolean;
  exercises?: Array<{
    exercise_id: number;
    position: number;
    block_position?: number;
    params_json?: Record<string, unknown>;
    reps_scheme?: string;
    notes?: string;
  }>;
}): Promise<number> {
  const sql = params.fx.sql;
  const rows = await sql<Array<{ id: string }>>`
    insert into blocks (slug, title, description, methodology_group_id, needs_review, coach_id)
    values (${uniq('blk')}, ${params.title}, ${params.description}, 1, ${params.needsReview ?? false}, ${params.fx.coachId})
    returning id::text
  `;
  const blockId = Number(rows[0]!.id);
  params.fx.blockIds.push(blockId);
  for (const e of params.exercises ?? []) {
    await sql`
      insert into block_exercises (
        block_id, position, block_position, exercise_id, params_json, reps_scheme, notes
      ) values (
        ${blockId}, ${e.position}, ${e.block_position ?? 0}, ${e.exercise_id},
        ${sql.json((e.params_json ?? {}) as Parameters<typeof sql.json>[0])},
        ${e.reps_scheme ?? null}, ${e.notes ?? null}
      )
    `;
  }
  return blockId;
}

/**
 * Month template whose week sessions carry INLINE blocks (no `template_id`),
 * mirroring what the week-studio editor persists. Drives the
 * inline-materialization path of `instantiateMonthFromTemplate`.
 *
 * `dayPlans` maps day_of_week → blocks; each block holds exercise items.
 */
export async function makeInlineMonthTemplate(params: {
  fx: Fixture;
  weekCount: number;
  dayPlans: Array<{
    day_of_week: number;
    blocks: Array<{
      title: string;
      format?: string;
      // Inline exercises (a-medida). Optional: a library-block part carries no
      // items and is hydrated from `block_exercises` via `source_block_id`.
      items?: Array<{ exercise_id: number; exercise_name: string; params_json?: Record<string, unknown> }>;
      // Procedencia Biblioteca de Bloques (0037/0038) — el materializador
      // hidrata los items desde block_exercises del bloque referenciado.
      source_block_id?: number;
    }>;
  }>;
  level?: string;
}): Promise<{ monthId: number; weekIds: number[] }> {
  const sql = params.fx.sql;
  const coachId = params.fx.coachId;

  const month = await sql<Array<{ id: string }>>`
    insert into program_month_templates (coach_id, name)
    values (${coachId}, 'Inline month')
    returning id::text
  `;
  const monthId = Number(month[0]!.id);

  const slots = {
    days: params.dayPlans.map((d, di) => ({
      day_of_week: d.day_of_week,
      sessions: [
        {
          kind: 'workout',
          template_id: null,
          blocks: d.blocks.map((b, bi) => ({
            uid: `blk-${di}-${bi}`,
            format: b.format ?? 'circuit',
            title: b.title,
            items: (b.items ?? []).map((it, ii) => ({
              uid: `it-${di}-${bi}-${ii}`,
              exercise_id: it.exercise_id,
              exercise_name: it.exercise_name,
              params_json: it.params_json ?? {},
            })),
            ...(b.source_block_id != null ? { source_block_id: b.source_block_id } : {}),
          })),
        },
      ],
    })),
  };

  const weekIds: number[] = [];
  for (let i = 0; i < params.weekCount; i++) {
    const week = await sql<Array<{ id: string }>>`
      insert into program_week_templates (coach_id, name, slots_json)
      values (
        ${coachId},
        ${`Inline week ${i + 1}`},
        ${sql.json(slots as Parameters<typeof sql.json>[0])}
      )
      returning id::text
    `;
    const weekId = Number(week[0]!.id);
    weekIds.push(weekId);
    await sql`
      insert into program_month_weeks (month_template_id, week_template_id, position)
      values (${monthId}, ${weekId}, ${i})
    `;
  }

  const bundle = { monthId, weekIds };
  params.fx.monthTemplates.push(bundle);
  return bundle;
}
