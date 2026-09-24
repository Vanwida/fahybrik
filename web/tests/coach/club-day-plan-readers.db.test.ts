/**
 * LO QUE EL COACH LEE Y DECIDE DEL PLAN VA EN EL DÍA DE SU CLUB — contra base de
 * datos REAL.
 *
 * Los lectores del plan de `shared/domain/coach` (`getCurrentMicrociclo`,
 * `buildMacroProgress`, `assessAthleteProgressReadiness`, `buildAthleteContextPack`,
 * `evaluateAthleteWeek`) cuentan desde el día que les pasan; sin él, desde el de
 * Madrid (`startOfDayInBox`), y un instante también se lee en Madrid. Cada
 * llamador del panel, del MCP y de los barridos les pasa ahora el día del CLUB
 * (`coaches.timezone`; DECISIONS 2026-09-23, «Qué día es en cada sitio»).
 *
 * El momento: lunes 21 sept 03:30 UTC. En Madrid ya es lunes 21; en el club
 * (Ciudad de México, UTC−6) aún es domingo 20 por la noche. El atleta lleva su plan
 * PERSONAL hasta el domingo 20 (4 semanas, todas cumplidas) y el lunes 21 empieza
 * un bloque nuevo de biblioteca. El club lo ve aún en el personal («semana 4 de 4»,
 * listo para progresar, se puede volver a la periodización); con el día de Madrid
 * ya estaba en el bloque nuevo («semana 1»). El atleta no tiene huso guardado (su
 * día sería el de Madrid): así se ve que manda el del club, no el suyo.
 *
 * Los que no reciben `now` leen el reloj: se fija `Date` (solo `Date`; los
 * temporizadores del driver siguen siendo reales).
 */

import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { buildAthletePlan } = await import('@/lib/dashboard/coach/athlete-plan');
const { loadFichaShell } = await import('@/lib/dashboard/v2/atleta-detalle');
const { canRevertToSequence, revertPersonalPlanForAthlete } = await import(
  '@/lib/dashboard/coach/revert-personal-plan'
);
const { personalizePlanForAthlete } = await import('@/lib/dashboard/coach/personalize-plan');
const { buildAthleteDeepDive } = await import('@/lib/coach/athlete-deep-dive');
const { buildCohort } = await import('@/lib/coach/cohort');
const { rollupAthleteFacts } = await import('@/lib/coach/attention/recompute');
const { proposeNextMonthlyBlock } = await import('@/lib/dashboard/coach/monthly-block-proposal');
const { proposeWeekAdjustment } = await import('@/lib/dashboard/coach/weekly-evaluation');
const { evaluateAthleteWeek } = await import('@/lib/coach/weekly-evaluation');
const { coachActor } = await import('@/lib/audit/record-edit');
const macroRoute = await import('@/app/api/coach/athletes/[id]/macro-progress/route');

const CLUB_TZ = 'America/Mexico_City';
const NOW = new Date('2026-09-21T03:30:00Z');

describeWithDb('el día del CLUB en lo que el coach lee y decide del plan (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  const tag = `${Date.now()}`;
  const PERSONAL = `Plan personal ${tag}`;
  const NEXT = `Bloque otoño ${tag}`;

  /** Congela `Date` en NOW para los llamadores que leen el reloj. */
  function atNow(): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  }

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`update coaches set timezone = ${CLUB_TZ} where id = ${fx.coachId}`;

    const [level] = await sql<Array<{ id: string }>>`
      insert into athlete_levels (coach_id, name, label) values (${fx.coachId}, ${`N-${tag}`}, 'Nivel club')
      returning id::text
    `;
    await sql`update athletes set level_id = ${Number(level!.id)} where id = ${fx.athleteId}`;

    const month = async (name: string, athleteId: number | null, levelId: number | null): Promise<number> => {
      const [row] = await sql<Array<{ id: string }>>`
        insert into program_month_templates (coach_id, name, athlete_id, level_id)
        values (${fx.coachId}, ${name}, ${athleteId}, ${levelId})
        returning id::text
      `;
      const id = Number(row!.id);
      fx.monthTemplates.push({ monthId: id, weekIds: [] });
      return id;
    };
    const personal = await month(PERSONAL, fx.athleteId, null);
    const next = await month(NEXT, null, null);
    // La plantilla de biblioteca de su nivel: la que propone «siguiente bloque».
    await month(`Siguiente ${tag}`, null, Number(level!.id));

    await sql`
      insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date, created_by_coach_id)
      values (${fx.athleteId}, ${personal}, '2026-08-24', '2026-09-20', ${fx.coachId}),
             (${fx.athleteId}, ${next}, '2026-09-21', '2026-10-18', ${fx.coachId})
    `;

    // El plan personal viene de forkear una secuencia: hay un cursor «detached».
    const [seq] = await sql<Array<{ id: string }>>`
      insert into program_sequences (coach_id) values (${fx.coachId}) returning id::text
    `;
    await sql`
      insert into athlete_sequence_progress (athlete_id, coach_id, sequence_id, status)
      values (${fx.athleteId}, ${fx.coachId}, ${Number(seq!.id)}, 'detached')
    `;

    // Su última semana del personal, cumplida entera.
    const tpl = await makeTemplate({ fx, name: 'Sesión' });
    for (const day of ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17']) {
      await makeAssignment({ fx, templateId: tpl, scheduledForIso: day, status: 'completed' });
    }
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  }, 60_000);

  it('Plan de la ficha (y del MCP): programa, «volver», progreso y el día marcado como hoy son del club', async () => {
    atNow();
    const plan = await buildAthletePlan({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql });
    expect(plan.current_block).toBe(PERSONAL);
    expect(plan.is_personal).toBe(true);
    expect(plan.can_revert_to_sequence).toBe(true);
    expect(plan.macro.block).toBe(PERSONAL);
    const today = plan.weeks.flatMap((w) => w.days).filter((d) => d.is_today).map((d) => d.iso_date);
    expect(today).toEqual(['2026-09-20']);
  });

  it('cabecera de la ficha: el plan en curso y el botón «volver» salen del día del club', async () => {
    atNow();
    const shell = await loadFichaShell({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      club_name: 'Club de prueba',
      client: sql,
    });
    expect(shell?.personal_plan).toEqual({ current_name: PERSONAL, is_personal: true, can_revert: true });
  });

  it('canRevertToSequence sin día: lo resuelve con el club del atleta', async () => {
    atNow();
    expect(await canRevertToSequence({ athlete_id: fx.athleteId, client: sql })).toBe(true);
  });

  // Con el día de Madrid el plan en curso era el de biblioteca: personalizar
  // fallaba con «nothing_to_copy» y volver con «not_personal».
  it('personalizar decide sobre el plan que el club tiene en curso (ya es personal)', async () => {
    atNow();
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    await expect(
      personalizePlanForAthlete({ coach_id: fx.coachId, athlete_id: fx.athleteId, actor, client: sql }),
    ).rejects.toMatchObject({ code: 'already_personal' });
  });

  it('volver a la periodización decide sobre el plan que el club tiene en curso (el personal)', async () => {
    atNow();
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    // Pasa «es personal» y «hay cursor»; se para en la secuencia vacía del fixture.
    await expect(
      revertPersonalPlanForAthlete({ coach_id: fx.coachId, athlete_id: fx.athleteId, actor, client: sql }),
    ).rejects.toMatchObject({ code: 'sequence_gone' });
  });

  it('ficha del deep-dive (panel y MCP): microciclo en curso y «listo para progresar»', async () => {
    const dd = await buildAthleteDeepDive({
      coach_id: fx.coachId,
      athlete_id: String(fx.athleteId),
      now: NOW,
      client: sql,
    });
    expect(dd.macrocycle?.current_block).toBe(PERSONAL);
    expect(dd.macrocycle?.current_week).toBe(4);
    expect(dd.transition_suggest?.recommendation).toBe('advance');
    expect(dd.transition_suggest?.reasons[0]).toBe('Programa: 4/4 semanas completadas.');
  });

  it('roster del MCP (cohort): bloque, semana y «listo para progresar» del club', async () => {
    const rows = await buildCohort({ coach_id: fx.coachId, now: NOW, client: sql });
    const row = rows.find((r) => r.athlete_id === String(fx.athleteId));
    expect(row).toMatchObject({ block_type: PERSONAL, block_week: 4 });
    expect(row?.flags.transition_ready).toBe(true);
  });

  it('barrido de Hoy: la señal «listo para progresar» mira el microciclo del día del club', async () => {
    const facts = await rollupAthleteFacts({ coach_id: fx.coachId, now: NOW, client: sql });
    const f = facts.find((x) => x.athlete_id === String(fx.athleteId));
    expect(f?.transition_recommendation).toBe('advance');
    expect(f?.transition_detail).toContain('Programa: 4/4 semanas completadas.');
  });

  it('GET /api/coach/athletes/[id]/macro-progress: el progreso en el día del club', async () => {
    atNow();
    vi.mocked(getCoachSession).mockResolvedValue({
      user_id: BigInt(fx.coachUserId),
      coach_id: BigInt(fx.coachId),
    } as Awaited<ReturnType<typeof getCoachSession>>);
    const res = await macroRoute.GET(new Request('http://localhost/api/coach/athletes/x/macro-progress'), {
      params: Promise.resolve({ id: String(fx.athleteId) }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { macro_progress: { block: string | null; block_week: number | null } };
    expect(body.macro_progress).toMatchObject({ block: PERSONAL, block_week: 4 });
  });

  it('proponer el siguiente bloque: el contexto de la IA se lee en el día del club', async () => {
    atNow();
    const proposal = await proposeNextMonthlyBlock({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql });
    expect(proposal).not.toBeNull();
    const [row] = await sql<Array<{ block: string | null; week: string | null }>>`
      select context_pack_json -> 'identity' ->> 'block_type' as block,
             context_pack_json -> 'identity' ->> 'week_in_block' as week
      from monthly_block_proposals where id = ${Number(proposal!.id)}
    `;
    expect(row).toEqual({ block: PERSONAL, week: '4' });
  });

  // Domingo 20 en el club: la semana en curso es la del 14; la evaluada, la del 7
  // (con el lunes de Madrid era la del 14).
  it('«Evaluar semana» / «Proponer descarga» sin semana: la anterior a la de hoy en el club', async () => {
    atNow();
    const rec = await proposeWeekAdjustment({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql });
    expect(rec.evaluated_week_start).toBe('2026-09-07');
    expect(rec.week_start).toBe('2026-09-14');
  });

  it('la evaluación con las señales de Hoy (lib/coach) sin semana: también la del club', async () => {
    atNow();
    const evaluation = await evaluateAthleteWeek({ athlete_id: fx.athleteId, client: sql });
    expect(evaluation.week_start).toBe('2026-09-07');
  });
});
