// Encadenar tramos personales (nuevo) — «Añadir microciclo»: nombre + nº de
// semanas, sin fecha que elegir. Empieza justo el día después de que acabe lo
// último que el atleta ya tiene asignado, sin hueco ni solape (0166).

import { afterAll, expect, test } from 'vitest';
import { addDays, isoDateString, mondayOfWeek } from '@fahybrid/shared/domain/dates';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import {
  addPersonalTramoToChain,
  PersonalChainError,
} from '@/lib/dashboard/coach/personal-plan-chain-mutations';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeMonthTemplate, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('addPersonalTramoToChain (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  /** Registra para teardown los ids REALES de semana de un mes personal —
   *  `insertEmptyPersonalMonthTemplate` no los devuelve por fuera de
   *  `addPersonalTramoToChain`, así que se releen de la junction. */
  async function trackForCleanup(fx: Fixture, monthId: number) {
    const rows = await sql<Array<{ id: string }>>`
      select week_template_id::text as id from program_month_weeks where month_template_id = ${monthId}
    `;
    fx.monthTemplates.push({ monthId, weekIds: rows.map((r) => Number(r.id)) });
  }

  test('dos tramos añadidos seguidos se encadenan sin hueco ni solape', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { monthId: sourceMonthId } = await makeMonthTemplate({
      fx,
      weekCount: 1,
      workoutDays: [1],
      workoutTemplateId,
    });
    const thisMonday = mondayOfWeek(new Date());
    await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: sourceMonthId,
      start_date: isoDateString(thisMonday),
      client: sql,
    });

    const base = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Base', week_count: 2 },
      client: sql,
    });
    await trackForCleanup(fx, Number(base.month_template_id));

    const build = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Build', week_count: 3 },
      client: sql,
    });
    await trackForCleanup(fx, Number(build.month_template_id));

    // «Base» empieza justo el lunes siguiente al domingo de la semana 1
    // (biblioteca). «Build» empieza justo el lunes siguiente al domingo de
    // «Base» — nunca el mismo día, nunca con un día de hueco entre medias.
    const libraryEnd = addDays(thisMonday, 6); // 1 semana.
    expect(base.start_date).toBe(isoDateString(addDays(libraryEnd, 1)));
    const baseEnd = addDays(addDays(thisMonday, 7), 2 * 7 - 1);
    expect(base.end_date).toBe(isoDateString(baseEnd));
    expect(build.start_date).toBe(isoDateString(addDays(baseEnd, 1)));
    expect(build.week_count).toBe(3);

    // Tres recibos, ninguno solapado — lo comprueba la propia restricción de
    // la base de datos (si hubiera solapado, el segundo add habría lanzado).
    const receipts = await sql<Array<{ n: string }>>`
      select count(*)::text as n from athlete_month_assignments where athlete_id = ${fx.athleteId}
    `;
    expect(Number(receipts[0]!.n)).toBe(3);

    // El contenedor personal quedó forkeable/editable: nombre correcto,
    // athlete_id puesto, sin level_id.
    const tplRows = await sql<Array<{ name: string; athlete_id: string | null; level_id: string | null }>>`
      select name, athlete_id::text as athlete_id, level_id::text as level_id
      from program_month_templates where id = ${Number(base.month_template_id)}
    `;
    expect(tplRows[0]!.name).toBe('Base');
    expect(Number(tplRows[0]!.athlete_id)).toBe(fx.athleteId);
    expect(tplRows[0]!.level_id).toBeNull();
  }, 30000);

  test('sin ningún plan asignado todavía, añadir se niega con un mensaje legible', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);

    await expect(
      addPersonalTramoToChain({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        payload: { name: 'Base', week_count: 2 },
        client: sql,
      }),
    ).rejects.toMatchObject({
      code: 'no_chain_yet',
    });

    let err: PersonalChainError | null = null;
    try {
      await addPersonalTramoToChain({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        payload: { name: 'Base', week_count: 2 },
        client: sql,
      });
    } catch (e) {
      err = e as PersonalChainError;
    }
    expect(err).toBeInstanceOf(PersonalChainError);
    expect(err!.message).not.toMatch(/postgres|sql|constraint/i);
    expect(err!.message.length).toBeGreaterThan(10);
  }, 30000);

  test('payload inválido (nombre vacío, semanas fuera de rango) se rechaza antes de tocar la base de datos', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { monthId: sourceMonthId } = await makeMonthTemplate({
      fx,
      weekCount: 1,
      workoutDays: [1],
      workoutTemplateId,
    });
    await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: sourceMonthId,
      start_date: isoDateString(mondayOfWeek(new Date())),
      client: sql,
    });

    await expect(
      addPersonalTramoToChain({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        payload: { name: '   ', week_count: 2 },
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'invalid_payload' });

    await expect(
      addPersonalTramoToChain({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        payload: { name: 'Base', week_count: 99 },
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'invalid_payload' });

    const receipts = await sql<Array<{ n: string }>>`
      select count(*)::text as n from athlete_month_assignments where athlete_id = ${fx.athleteId}
    `;
    expect(Number(receipts[0]!.n)).toBe(1); // sólo el de biblioteca — nada se creó.
  }, 30000);
});
