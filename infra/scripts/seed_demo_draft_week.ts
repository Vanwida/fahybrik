/**
 * seed_demo_draft_week.ts — Preview-only: live draft week vs a published week.
 *
 * Por qué existe: el recorrido Coach Demo 1 no tenía caso vivo de
 * `weekly_plans.status='draft'` en la semana calendario actual
 * (`docs/coach-ux-recorrido.html` fila Borrador). Sin esa fila el atleta
 * VE la semana (doctrina 10-ago: sin fila = visible). Solo un `draft`
 * explícito esconde.
 *
 * QUÉ HACE, contra Preview QA (`preview-qa-2026-08-15` / ep-tiny-firefly):
 *   1. Resuelve Coach Demo 1 + Atleta Demo 1 (Marc Vidal) por email marcador.
 *      Guillem (partner) no se toca — sigue siendo el caso «sin plan».
 *   2. Si Marc no tiene sesiones en la semana calendario actual, materializa
 *      el microciclo «Acumulación» (2 semanas) desde ESTE lunes, vía
 *      `assignMonthToAthlete` (el path real). El bloque de julio NO se borra
 *      (no solapa: 13–26 jul vs 17 ago).
 *   3. Semana actual → `markWeekDraft({ delivery_mode: 'manual' })`.
 *      Manual = el cron del sábado NO auto-publica.
 *   4. La otra semana del bloque → `publishWeek` (`status='published'`).
 *      No se llama `publishMicrociclo` (publicaría también el borrador).
 *
 * Recorrido:
 *   Preview → /es/acceso-demo → Coach Demo 1 → Marc Vidal → Plan.
 *   Semana actual: badge parcial + botón Publicar; él no la ve.
 *   La otra semana del bloque: Visible.
 *
 * IDEMPOTENTE: si ya hay asignación que cubre este lunes, no rematerializa
 * (0166 rechazaría el solape); solo re-estampa los dos `weekly_plans`.
 *
 * TARGET: solo Preview QA. Nunca Production (`ep-aged-base`). Nunca
 * `.env.local` como fallback. Nunca `SEED_DEMO_ALLOW_MAIN`.
 *
 * RUN:
 *   cd web && DATABASE_URL='<connection-string preview-qa-2026-08-15>' \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/seed_demo_draft_week.ts
 *
 *   Dry-run (cero escrituras): añade `--dry-run`.
 */
import type { Sql } from '@/lib/db';
import { DEMO_ATHLETE_EMAIL, DEMO_COACH_EMAIL, resolveDemoTarget } from './_demo_target.ts';
import { assertExplicitPreviewDatabaseUrl } from './seed_demo_draft_week_guard.ts';

const DRY_RUN = process.argv.includes('--dry-run');
const MONTH_NAME = 'Acumulación';
const DAYS_PER_WEEK = 7;

const log = (...a: unknown[]) => console.log('[seed_demo_draft_week]', ...a); // eslint-disable-line no-console

type Dates = typeof import('@fahybrid/shared/domain/dates');

type Deps = {
  sql: Sql;
  dates: Dates;
  assignMonthToAthlete: typeof import('@/lib/dashboard/programming/assign-month')['assignMonthToAthlete'];
  markWeekDraft: typeof import('@/lib/coach/publish-week')['markWeekDraft'];
  publishWeek: typeof import('@/lib/coach/publish-week')['publishWeek'];
  DELIVERY_MODE: typeof import('@/lib/coach/publish-week')['DELIVERY_MODE'];
};

async function loadDeps(): Promise<Deps> {
  // `.env.local` only fills keys that are still missing. DATABASE_URL is already
  // Preview (asserted above), so production's URL cannot sneak in.
  await import('./_load_web_env.ts');
  const [db, dates, assign, publish] = await Promise.all([
    import('@/lib/db'),
    import('@fahybrid/shared/domain/dates'),
    import('@/lib/dashboard/programming/assign-month'),
    import('@/lib/coach/publish-week'),
  ]);
  return {
    sql: db.sql,
    dates,
    assignMonthToAthlete: assign.assignMonthToAthlete,
    markWeekDraft: publish.markWeekDraft,
    publishWeek: publish.publishWeek,
    DELIVERY_MODE: publish.DELIVERY_MODE,
  };
}

interface CoveringAssignment {
  id: number;
  start_date: string;
  end_date: string;
  month_name: string;
}

function mondaysInRange(dates: Dates, startIso: string, endIso: string): string[] {
  const mondays: string[] = [];
  let cursor = dates.parseIsoDate(startIso);
  const end = dates.parseIsoDate(endIso);
  while (cursor.getTime() <= end.getTime()) {
    mondays.push(dates.isoDateString(cursor));
    cursor = dates.addDays(cursor, DAYS_PER_WEEK);
  }
  return mondays;
}

async function sessionCountInWeek(sql: Sql, athleteId: number, weekStart: string, dates: Dates): Promise<number> {
  const weekEnd = dates.isoDateString(dates.addDays(dates.parseIsoDate(weekStart), 6));
  const rows = await sql<Array<{ n: number }>>`
    select count(*)::int as n
    from workout_assignments
    where athlete_id = ${athleteId}
      and scheduled_for >= ${weekStart}::date
      and scheduled_for <= ${weekEnd}::date
  `;
  return rows[0]?.n ?? 0;
}

async function findCoveringAssignment(sql: Sql, athleteId: number, monday: string): Promise<CoveringAssignment | null> {
  const rows = await sql<Array<CoveringAssignment>>`
    select ama.id::int as id,
           to_char(ama.start_date, 'YYYY-MM-DD') as start_date,
           to_char(ama.end_date, 'YYYY-MM-DD') as end_date,
           pmt.name as month_name
    from athlete_month_assignments ama
    join program_month_templates pmt on pmt.id = ama.month_template_id
    where ama.athlete_id = ${athleteId}
      and ama.start_date <= ${monday}::date
      and ama.end_date >= ${monday}::date
    order by ama.start_date desc
    limit 1
  `;
  return rows[0] ?? null;
}

async function findMonthTemplateId(sql: Sql, coachId: number): Promise<number> {
  const rows = await sql<Array<{ id: number }>>`
    select id::int as id
    from program_month_templates
    where coach_id = ${coachId} and name = ${MONTH_NAME}
    order by id desc
    limit 1
  `;
  if (!rows[0]) {
    throw new Error(
      `seed_demo_draft_week: coach ${coachId} has no month template named "${MONTH_NAME}". ` +
        `Refusing to fabricate a library. Seed the demo plan first, or pick another coach.`,
    );
  }
  return rows[0].id;
}

async function verify(sql: Sql, athleteId: number, draftMonday: string, publishedMonday: string): Promise<void> {
  const rows = await sql<Array<{ week_start: string; status: string; delivery_mode: string }>>`
    select to_char(week_start, 'YYYY-MM-DD') as week_start,
           status::text as status,
           coalesce(delivery_mode::text, '') as delivery_mode
    from weekly_plans
    where athlete_id = ${athleteId}
      and week_start in (${draftMonday}::date, ${publishedMonday}::date)
    order by week_start
  `;
  log('weekly_plans after:', rows);
  const draft = rows.find((r) => r.week_start === draftMonday);
  const published = rows.find((r) => r.week_start === publishedMonday);
  if (draft?.status !== 'draft' || draft.delivery_mode !== 'manual') {
    throw new Error(
      `verify failed: ${draftMonday} should be draft/manual, got ${JSON.stringify(draft ?? null)}`,
    );
  }
  if (published?.status !== 'published') {
    throw new Error(
      `verify failed: ${publishedMonday} should be published, got ${JSON.stringify(published ?? null)}`,
    );
  }
}

async function main(): Promise<void> {
  const host = assertExplicitPreviewDatabaseUrl(process.env.DATABASE_URL);
  log(`target host: ${host}${DRY_RUN ? '  (dry-run)' : ''}`);

  const D = await loadDeps();
  const thisMonday = D.dates.isoDateString(D.dates.mondayOfWeekInBox(new Date()));
  log(`calendar week (Europe/Madrid): ${thisMonday}`);

  const target = await resolveDemoTarget(D.sql);
  log(`athlete ${target.athleteId} <${target.athleteEmail}> · coach ${target.coachId} <${target.coachEmail}>`);
  if (target.coachEmail.toLowerCase() !== DEMO_COACH_EMAIL.toLowerCase()) {
    throw new Error(`safety: resolved coach is not ${DEMO_COACH_EMAIL}`);
  }
  if (target.athleteEmail.toLowerCase() !== DEMO_ATHLETE_EMAIL.toLowerCase()) {
    throw new Error(`safety: resolved athlete is not ${DEMO_ATHLETE_EMAIL}`);
  }

  let covering = await findCoveringAssignment(D.sql, target.athleteId, thisMonday);
  const sessionsHere = await sessionCountInWeek(D.sql, target.athleteId, thisMonday, D.dates);
  log(`covering assignment: ${covering ? `#${covering.id} ${covering.month_name} ${covering.start_date}→${covering.end_date}` : '(none)'}`);
  log(`sessions this week: ${sessionsHere}`);

  if (!covering || sessionsHere === 0) {
    if (covering && sessionsHere === 0) {
      throw new Error(
        `seed_demo_draft_week: assignment #${covering.id} covers ${thisMonday} but has 0 sessions. ` +
          `Not rematerializing (would overlap). Inspect Preview before retrying.`,
      );
    }
    const monthId = await findMonthTemplateId(D.sql, target.coachId);
    log(`will assign "${MONTH_NAME}" id=${monthId} starting ${thisMonday}`);
    if (!DRY_RUN) {
      const assigned = await D.assignMonthToAthlete({
        coach_id: target.coachId,
        athlete_id: target.athleteId,
        month_template_id: monthId,
        start_date: thisMonday,
      });
      log(`assigned month_assignment_id=${assigned.month_assignment_id} sessions=${assigned.assignment_count} ${assigned.start_date}→${assigned.end_date}`);
      covering = await findCoveringAssignment(D.sql, target.athleteId, thisMonday);
    } else {
      covering = {
        id: 0,
        start_date: thisMonday,
        end_date: D.dates.isoDateString(D.dates.addDays(D.dates.parseIsoDate(thisMonday), 13)),
        month_name: MONTH_NAME,
      };
    }
  }

  if (!covering) {
    throw new Error('seed_demo_draft_week: no covering assignment after assign');
  }

  const mondays = mondaysInRange(D.dates, covering.start_date, covering.end_date);
  const otherMonday = mondays.find((m) => m !== thisMonday);
  if (!otherMonday) {
    throw new Error(
      `seed_demo_draft_week: assignment #${covering.id} is a single week (${thisMonday}). ` +
        `Need a second week to contrast Visible vs No lo ve.`,
    );
  }

  log(`draft (current, manual): ${thisMonday}`);
  log(`published (other week):  ${otherMonday}`);
  log('Guillem Soler: untouched');

  if (DRY_RUN) {
    log('dry-run: no writes');
    await D.sql.end({ timeout: 2 });
    return;
  }

  await D.markWeekDraft({
    coach_id: target.coachId,
    athlete_id: target.athleteId,
    week_start: thisMonday,
    delivery_mode: D.DELIVERY_MODE.manual,
    client: D.sql,
  });
  await D.publishWeek({
    coach_id: target.coachId,
    athlete_id: target.athleteId,
    week_start: otherMonday,
    client: D.sql,
  });

  await verify(D.sql, target.athleteId, thisMonday, otherMonday);
  const draftSessions = await sessionCountInWeek(D.sql, target.athleteId, thisMonday, D.dates);
  const publishedSessions = await sessionCountInWeek(D.sql, target.athleteId, otherMonday, D.dates);
  log(`sessions draft week=${draftSessions} published week=${publishedSessions}`);
  log('done. Recorrido: Preview /es/acceso-demo → Coach Demo 1 → Marc Vidal → Plan.');

  await D.sql.end({ timeout: 2 });
}

main().catch(async (err) => {
  console.error('[seed_demo_draft_week] FAILED:', err); // eslint-disable-line no-console
  process.exitCode = 1;
});
