// Card 135 — cuánto dura un microciclo es METODOLOGÍA DEL ENTRENADOR
// (`coaches.max_microcycle_weeks`, migración 0206), no un número clavado en el
// código. Antes de esta migración había DOS constantes con el mismo nombre y
// valores distintos (8 en biblioteca, 20 en plan personal); ahora los tres
// caminos que pueden crear o alargar un tramo leen el mismo dato del coach y
// lo rechazan con un mensaje legible en cuanto se pasa.

import { afterAll, expect, test } from 'vitest';
import {
  createMonthTemplateWithEmptyWeeks,
  ProgramMonthError,
} from '@/lib/dashboard/coach/program-months';
import {
  createPersonalMonthTemplateFromScratch,
} from '@/lib/dashboard/coach/personal-plans';
import {
  addPersonalTramoToChain,
  updatePersonalTramoMeta,
} from '@/lib/dashboard/coach/personal-plan-chain-mutations';
import { loadCoachMaxMicrocicloWeeks } from '@/lib/coach/microcycle-limits';
import { coachActor } from '@/lib/audit/record-edit';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('tope de semanas de un microciclo, por coach (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  async function makeLevel(fx: Fixture, name = 'base'): Promise<number> {
    const rows = await sql<Array<{ id: string }>>`
      insert into athlete_levels (coach_id, name, label)
      values (${fx.coachId}, ${name}, ${name})
      returning id::text
    `;
    return Number(rows[0]!.id);
  }

  test('un coach recién creado tiene el defecto (8) sin tocar nada', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    expect(await loadCoachMaxMicrocicloWeeks({ coach_id: fx.coachId, client: sql })).toBe(8);
  });

  test('biblioteca: crea sin level_id aunque el coach no tenga niveles', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);

    const created = await createMonthTemplateWithEmptyWeeks({
      coach_id: fx.coachId,
      payload: { name: 'Bloque libre', week_count: 4 },
      client: sql,
    });
    fx.monthTemplates.push({
      monthId: Number(created.id),
      weekIds: created.weeks.map((w) => Number(w.id)),
    });
    expect(created.weeks).toHaveLength(4);

    const monthRow = await sql<Array<{ level_id: string | null }>>`
      select level_id::text from program_month_templates where id = ${Number(created.id)}
    `;
    expect(monthRow[0]!.level_id).toBeNull();
  });

  test('biblioteca: rechaza por encima del tope del coach, acepta justo en el tope', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const levelId = await makeLevel(fx);

    await expect(
      createMonthTemplateWithEmptyWeeks({
        coach_id: fx.coachId,
        payload: { name: 'Demasiado largo', level_id: levelId, week_count: 9 },
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'week_count_too_long' });

    let err: ProgramMonthError | null = null;
    try {
      await createMonthTemplateWithEmptyWeeks({
        coach_id: fx.coachId,
        payload: { name: 'Demasiado largo', level_id: levelId, week_count: 9 },
        client: sql,
      });
    } catch (e) {
      err = e as ProgramMonthError;
    }
    expect(err!.message).toBe('Un bloque tuyo no pasa de 8 semanas.');

    const created = await createMonthTemplateWithEmptyWeeks({
      coach_id: fx.coachId,
      payload: { name: 'Justo en el tope', level_id: levelId, week_count: 8 },
      client: sql,
    });
    fx.monthTemplates.push({
      monthId: Number(created.id),
      weekIds: created.weeks.map((w) => Number(w.id)),
    });
    expect(created.weeks).toHaveLength(8);
  });

  test('biblioteca: un coach con tope propio más bajo se corta ahí, no en el defecto', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const levelId = await makeLevel(fx);
    await sql`update coaches set max_microcycle_weeks = 3 where id = ${fx.coachId}`;

    await expect(
      createMonthTemplateWithEmptyWeeks({
        coach_id: fx.coachId,
        payload: { name: 'Cuatro semanas', level_id: levelId, week_count: 4 },
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'week_count_too_long' });

    const created = await createMonthTemplateWithEmptyWeeks({
      coach_id: fx.coachId,
      payload: { name: 'Tres semanas', level_id: levelId, week_count: 3 },
      client: sql,
    });
    fx.monthTemplates.push({
      monthId: Number(created.id),
      weekIds: created.weeks.map((w) => Number(w.id)),
    });
    expect(created.weeks).toHaveLength(3);
  });

  test('plan personal desde cero: mismo tope real del coach', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await sql`update coaches set max_microcycle_weeks = 3 where id = ${fx.coachId}`;
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });

    await expect(
      createPersonalMonthTemplateFromScratch({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        payload: { name: 'Demasiado largo', week_count: 4 },
        actor,
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'week_count_too_long' });

    const created = await createPersonalMonthTemplateFromScratch({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Justo en el tope', week_count: 3 },
      actor,
      client: sql,
    });
    fx.monthTemplates.push({
      monthId: Number(created.id),
      weekIds: created.weeks.map((w) => Number(w.id)),
    });
    expect(created.weeks).toHaveLength(3);
  });

  test('encadenar un tramo personal nuevo respeta el mismo tope', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await sql`update coaches set max_microcycle_weeks = 3 where id = ${fx.coachId}`;
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });

    await expect(
      addPersonalTramoToChain({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        payload: { name: 'Demasiado largo', week_count: 4 },
        actor,
        start_date_when_empty: '2026-01-05',
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'week_count_too_long' });

    // Nada se creó: el rechazo fue ANTES de escribir el contenedor.
    const receipts = await sql<Array<{ n: string }>>`
      select count(*)::text as n from athlete_month_assignments where athlete_id = ${fx.athleteId}
    `;
    expect(Number(receipts[0]!.n)).toBe(0);

    const added = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Justo en el tope', week_count: 3 },
      actor,
      start_date_when_empty: '2026-01-05',
      client: sql,
    });
    fx.monthTemplates.push({
      monthId: Number(added.month_template_id),
      weekIds: (
        await sql<Array<{ id: string }>>`
          select week_template_id::text as id from program_month_weeks
          where month_template_id = ${Number(added.month_template_id)}
        `
      ).map((r) => Number(r.id)),
    });
    expect(added.week_count).toBe(3);
  }, 30000);

  test('alargar un tramo personal ya existente también respeta el tope', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await sql`update coaches set max_microcycle_weeks = 3 where id = ${fx.coachId}`;
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });

    const added = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Base', week_count: 2 },
      actor,
      start_date_when_empty: '2026-01-05',
      client: sql,
    });
    const monthId = Number(added.month_template_id);
    fx.monthTemplates.push({
      monthId,
      weekIds: (
        await sql<Array<{ id: string }>>`
          select week_template_id::text as id from program_month_weeks
          where month_template_id = ${monthId}
        `
      ).map((r) => Number(r.id)),
    });

    // Alargar de 2 a 4 semanas pasaría del tope (3) — se rechaza sin tocar nada.
    await expect(
      updatePersonalTramoMeta({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        month_template_id: monthId,
        payload: { week_count: 4 },
        actor,
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'week_count_too_long' });

    // Alargar justo hasta el tope (3) se acepta.
    const updated = await updatePersonalTramoMeta({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: monthId,
      payload: { week_count: 3 },
      actor,
      client: sql,
    });
    expect(updated.week_count).toBe(3);
    // La semana añadida al alargar también se limpia en el teardown.
    fx.monthTemplates[fx.monthTemplates.length - 1]!.weekIds = (
      await sql<Array<{ id: string }>>`
        select week_template_id::text as id from program_month_weeks
        where month_template_id = ${monthId}
      `
    ).map((r) => Number(r.id));
  }, 30000);
});
