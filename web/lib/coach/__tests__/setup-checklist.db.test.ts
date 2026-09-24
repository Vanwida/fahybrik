// Primeros pasos del coach (lib/coach/setup-checklist) contra DB real, con un
// coach NUEVO (no el tenant #1): el camino corto «invitar → programa → semana
// visible» se enciende paso a paso con datos reales; grupos, tests y «Cómo
// entrenas» nunca bloquean; y en cuanto un atleta ve una semana, está completo
// (la barra lateral deja de enseñar «Primeros pasos»).

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../../../tests/utils/test-db';
import { makeClub, makeLevel, makeProgram, type Club } from '../../../tests/plan-delivery/fixtures';
import { loadSetupChecklist, loadSetupFacts } from '@/lib/coach/setup-checklist';

describeWithDb('primeros pasos de un coach nuevo (DB real)', () => {
  const sql = getTestSql();
  let a: Club;
  let athlete: number;
  let monday: string;

  beforeAll(async () => {
    a = await makeClub(sql, 1);
    athlete = a.athleteIds[0]!;
    const m = await sql<Array<{ d: string }>>`select to_char(date_trunc('week', now())::date, 'YYYY-MM-DD') as d`;
    monday = m[0]!.d;
  });

  afterAll(async () => {
    await sql`delete from coach_entitlements where coach_id = ${a.coachId}`;
    await sql`delete from coach_availability where coach_id = ${a.coachId}`;
    await a.cleanup();
    await closeTestSql();
  });

  const byKey = async () => {
    const c = await loadSetupChecklist(a.coachId, sql);
    return { c: c!, done: new Set(c!.steps.filter((s) => s.done).map((s) => s.key)) };
  };

  test('coach desconocido → null', async () => {
    expect(await loadSetupFacts(-1, sql)).toBeNull();
  });

  test('con un atleta y nada más: paso 1 hecho, sin programa; el método entero es opcional', async () => {
    const f = await loadSetupFacts(a.coachId, sql);
    expect(f).toMatchObject({
      club_named: false,
      method_written: false,
      groups_with_plan: 0,
      tests: 0,
      athletes: 1,
      athletes_with_plan: 0,
      athletes_with_visible_week: 0,
    });
    const { c, done } = await byKey();
    expect(c.total).toBe(3);
    expect(c.done).toBe(1);
    expect(done.has('primer_atleta')).toBe(true);
    expect(c.complete).toBe(false);
    expect(c.steps.filter((s) => s.track === 'metodo').every((s) => s.optional)).toBe(true);
  });

  test('un entreno del coach en una semana OCULTA: tiene programa, pero aún no ve nada', async () => {
    await sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status, origin)
              values (${athlete}, ${monday}::date + 2, ${a.templateId}, 1, 'scheduled', 'coach')`;
    await sql`insert into weekly_plans (athlete_id, week_start, status, delivery_mode)
              values (${athlete}, ${monday}::date, 'draft', 'manual')`;
    const { c, done } = await byKey();
    expect(done.has('primer_plan')).toBe(true);
    expect(done.has('primera_semana')).toBe(false);
    expect(c.complete).toBe(false);
  });

  test('se publica la semana → completo, sin grupos, ni tests, ni «Cómo entrenas»', async () => {
    await sql`update weekly_plans set status = 'published' where athlete_id = ${athlete} and week_start = ${monday}::date`;
    const { c, done } = await byKey();
    expect(done.has('primera_semana')).toBe(true);
    expect(c.complete).toBe(true);
    expect(done.has('primer_grupo')).toBe(false);
    expect(done.has('tests')).toBe(false);
    expect(done.has('metodo')).toBe(false);
  });

  test('el método se va encendiendo aparte: club, nivel, grupo con plan', async () => {
    await sql`update coaches set club_skin_name = 'Club de prueba' where id = ${a.coachId}`;
    await makeLevel(a, 'N1', 1);
    const program = await makeProgram(a, 2, 'Base');
    const g = await sql<Array<{ id: string }>>`
      insert into program_sequences (coach_id, name) values (${a.coachId}, 'Mañanas') returning id::text`;
    await sql`insert into program_sequence_items (sequence_id, position, month_template_id)
              values (${Number(g[0]!.id)}, 1, ${program})`;
    const { c, done } = await byKey();
    for (const k of ['club', 'niveles', 'primer_grupo', 'primer_entreno'] as const) expect(done.has(k)).toBe(true);
    expect(c.method.done).toBe(4);
  });

  test('con Negocio aparece la agenda (opcional), y se enciende con una franja', async () => {
    await sql`insert into coach_entitlements (coach_id, feature, status, source) values (${a.coachId}, 'negocio', 'active', 'founder')`;
    let { c } = await byKey();
    expect(c.steps.find((s) => s.key === 'agenda')).toMatchObject({ done: false, optional: true });
    expect(c.complete).toBe(true);
    await sql`insert into coach_availability (coach_id, weekday, start_time, end_time) values (${a.coachId}, 1, '09:00', '10:00')`;
    ({ c } = await byKey());
    expect(c.steps.find((s) => s.key === 'agenda')?.done).toBe(true);
  });
});
