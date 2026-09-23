// Primeros pasos del coach (lib/coach/setup-checklist) contra DB real: cada paso
// se enciende cuando existe lo que pide, y «Agenda y cupo» solo con Negocio.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../../../tests/utils/test-db';
import { makeClub, makeLevel, makeProgram, type Club } from '../../../tests/plan-delivery/fixtures';
import { loadSetupChecklist, loadSetupFacts } from '@/lib/coach/setup-checklist';

describeWithDb('primeros pasos (DB real)', () => {
  const sql = getTestSql();
  let a: Club;

  beforeAll(async () => {
    a = await makeClub(sql, 2);
  });

  afterAll(async () => {
    await sql`delete from coach_entitlements where coach_id = ${a.coachId}`;
    await sql`delete from coach_availability where coach_id = ${a.coachId}`;
    await a.cleanup();
    await closeTestSql();
  });

  test('coach desconocido → null', async () => {
    expect(await loadSetupFacts(-1, sql)).toBeNull();
  });

  test('un club recién hecho: atletas y su entreno, nada más', async () => {
    const f = await loadSetupFacts(a.coachId, sql);
    expect(f).toMatchObject({
      club_named: false,
      method_written: false,
      levels: 0,
      programs: 0,
      groups_with_plan: 0,
      tests: 0,
      negocio: false,
      athletes: 2,
    });
    expect(f!.library_entrenos).toBeGreaterThanOrEqual(1);
    const c = await loadSetupChecklist(a.coachId, sql);
    expect(c!.total).toBe(8);
    expect(c!.complete).toBe(false);
  });

  test('club con nombre, nivel, programa y grupo con plan', async () => {
    await sql`update coaches set club_skin_name = 'Club de prueba' where id = ${a.coachId}`;
    await makeLevel(a, 'N1', 1);
    const program = await makeProgram(a, 2, 'Base');
    const g = await sql<Array<{ id: string }>>`
      insert into program_sequences (coach_id, name) values (${a.coachId}, 'Mañanas') returning id::text`;
    await sql`insert into program_sequence_items (sequence_id, position, month_template_id)
              values (${Number(g[0]!.id)}, 1, ${program})`;
    const c = await loadSetupChecklist(a.coachId, sql);
    const done = new Set(c!.steps.filter((s) => s.done).map((s) => s.key));
    expect([...done].sort()).toEqual(['club', 'niveles', 'primer_atleta', 'primer_entreno', 'primer_grupo', 'primer_programa']);
  });

  test('con Negocio aparece la agenda, y se enciende con una franja', async () => {
    await sql`insert into coach_entitlements (coach_id, feature, status, source) values (${a.coachId}, 'negocio', 'active', 'founder')`;
    let c = await loadSetupChecklist(a.coachId, sql);
    expect(c!.total).toBe(9);
    expect(c!.steps.find((s) => s.key === 'agenda')?.done).toBe(false);
    await sql`insert into coach_availability (coach_id, weekday, start_time, end_time) values (${a.coachId}, 1, '09:00', '10:00')`;
    c = await loadSetupChecklist(a.coachId, sql);
    expect(c!.steps.find((s) => s.key === 'agenda')?.done).toBe(true);
  });
});
