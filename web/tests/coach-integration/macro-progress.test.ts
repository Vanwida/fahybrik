/**
 * Real-DB integration tests for `buildMacroProgress` + `buildAthleteMacroSummary`
 * (consumed by iOS).
 *
 * Exercises the real `date_trunc('week', ...)` weekly rollup, the
 * scheduled/completed compliance maths, week status derivation
 * (completed/current/upcoming/missed), and the current-block join. Nothing is
 * mocked — every number is computed by Postgres over seeded rows and verified
 * against a fixed `on_date`.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import {
  buildAthleteMacroSummary,
  buildMacroProgress,
} from '@fahybrid/shared/domain/coach/macro-progress';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeMicrocycle,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

// Macro spans 3 ISO weeks. `on_date` sits inside week 2 so we get
// completed (wk1), current (wk2), upcoming (wk3) statuses.
const MACRO_START = '2026-03-02'; // Monday (ISO week 10)
const MACRO_END = '2026-03-22'; // Sunday of wk3
const ON_DATE = new Date('2026-03-11T12:00:00Z'); // Wednesday of week 2

const WK1 = ['2026-03-02', '2026-03-04']; // Mon, Wed
const WK2 = ['2026-03-09', '2026-03-11'];
const WK3 = ['2026-03-16', '2026-03-18'];

describeWithDb('buildMacroProgress (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  async function seedMacroWithWeeks(): Promise<{ fx: Fixture; microId: number }> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    // AGNOSTIC: a per-athlete microcycle covering ON_DATE (microcycles hang off the athlete).
    const { microcycleId: microId } = await makeMicrocycle({
      sql,
      athleteId: fx.athleteId,
      startIso: '2026-03-09',
      endIso: '2026-03-15',
      weekNumber: 2,
    });

    const tplId = await makeTemplate({ fx, name: 'session' });

    // Week 1 (past): both completed → compliance 100%, status completed.
    for (const d of WK1) {
      await makeAssignment({ fx, templateId: tplId, scheduledForIso: d, status: 'completed', microcycleId: microId });
    }
    // Week 2 (current): one completed, one scheduled.
    await makeAssignment({ fx, templateId: tplId, scheduledForIso: WK2[0]!, status: 'completed', microcycleId: microId });
    await makeAssignment({ fx, templateId: tplId, scheduledForIso: WK2[1]!, status: 'scheduled', microcycleId: microId });
    // Week 3 (future): both scheduled.
    for (const d of WK3) {
      await makeAssignment({ fx, templateId: tplId, scheduledForIso: d, status: 'scheduled', microcycleId: microId });
    }

    return { fx, microId };
  }

  test('rolls weeks up with correct compliance and status', async () => {
    const { fx } = await seedMacroWithWeeks();

    const p = await buildMacroProgress({ athlete_id: fx.athleteId, on_date: ON_DATE, client: sql });

    expect(p.athlete_id).toBe(String(fx.athleteId));
    // `block` now derives from the materialization receipt (athlete_month_assignments
    // → template name), AGNOSTIC — none seeded here, so null. The weekly rollup below
    // (the subject of this test) comes purely from workout_assignments. The named
    // microciclo label is covered by the buildAthleteMacroSummary test.
    expect(p.block).toBeNull();
    expect(p.total_assigned_weeks).toBe(3);
    expect(p.weeks).toHaveLength(3);

    const [w1, w2, w3] = p.weeks;
    expect(w1!.week_start).toBe('2026-03-02');
    expect(w1!.status).toBe('completed');
    expect(w1!.compliance_pct).toBe(1); // 2/2

    expect(w2!.week_start).toBe('2026-03-09');
    expect(w2!.status).toBe('current');
    expect(w2!.compliance_pct).toBe(0.5); // 1/2

    expect(w3!.week_start).toBe('2026-03-16');
    expect(w3!.status).toBe('upcoming');
    expect(w3!.compliance_pct).toBe(0); // 0/2
  });

  test('past week below 50% completion is marked missed', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const { microcycleId: microId } = await makeMicrocycle({
      sql,
      athleteId: fx.athleteId,
      startIso: '2026-03-02',
      endIso: '2026-03-08',
      weekNumber: 1,
    });
    const tplId = await makeTemplate({ fx, name: 's' });
    // Past week with 0/2 completed → missed (completed < scheduled*0.5).
    for (const d of WK1) {
      await makeAssignment({
        fx,
        templateId: tplId,
        scheduledForIso: d,
        status: 'missed',
        microcycleId: microId,
      });
    }

    const p = await buildMacroProgress({ athlete_id: fx.athleteId, on_date: ON_DATE, client: sql });
    const w1 = p.weeks.find((w) => w.week_start === '2026-03-02');
    expect(w1?.status).toBe('missed');
    expect(w1?.compliance_pct).toBe(0);
  });

  test('lo que NO es del plan no crea semanas de progreso', async () => {
    // El bug real (7-ago): el atleta tenía entrenos libres y tests sueltos de
    // semanas anteriores, y el «progreso del microciclo» los contaba como sus
    // semanas — marcaba como ACTUAL una semana de entrenos propios y empujaba
    // el microciclo recién asignado a la S4. El coach leía que su atleta iba
    // por la semana 3 de un plan que no había empezado.
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tplId = await makeTemplate({ fx, name: 'libre' });
    // Entrenos SIN microciclo: libres del atleta, calibración ad-hoc, semana cero.
    for (const d of WK1) {
      await makeAssignment({ fx, templateId: tplId, scheduledForIso: d, status: 'completed' });
    }
    // Y una semana que SÍ es del plan.
    const { microcycleId: microId } = await makeMicrocycle({
      sql,
      athleteId: fx.athleteId,
      startIso: '2026-03-09',
      endIso: '2026-03-15',
      weekNumber: 1,
    });
    for (const d of WK2) {
      await makeAssignment({
        fx,
        templateId: tplId,
        scheduledForIso: d,
        status: 'scheduled',
        microcycleId: microId,
      });
    }

    const p = await buildMacroProgress({ athlete_id: fx.athleteId, on_date: ON_DATE, client: sql });
    // Solo la semana del plan. La de entrenos sueltos no existe para el progreso.
    expect(p.weeks.map((w) => w.week_start)).toEqual(['2026-03-09']);
  });

  test('athlete with no macrocycle returns empty progress (no crash)', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const p = await buildMacroProgress({ athlete_id: fx.athleteId, on_date: ON_DATE, client: sql });
    expect(p.block).toBeNull();
    expect(p.macrocycle_id).toBeNull();
    expect(p.weeks).toEqual([]);
    expect(p.total_assigned_weeks).toBe(0);
  });

  test('buildAthleteMacroSummary is agnostic: microciclo name + "semana N de M", no phase label', async () => {
    const { fx } = await seedMacroWithWeeks();
    // The athlete label is now sourced from the materialization receipt
    // (athlete_month_assignments → program_month_templates.name), NOT periodization tables.
    // microcycle_ids left empty → week count (M) falls back to the date span
    // (MACRO_START..MACRO_END = 3 Mon–Sun weeks); ON_DATE is in week 2 → N=2.
    await sql`
      insert into program_month_templates (coach_id, name)
      values (${fx.coachId}, 'Microciclo Base')
    `;
    const pmt = await sql<Array<{ id: string }>>`
      select id::text from program_month_templates
      where coach_id = ${fx.coachId} and name = 'Microciclo Base'
      order by id desc limit 1
    `;
    await sql`
      insert into athlete_month_assignments
        (athlete_id, month_template_id, start_date, end_date, created_by_coach_id)
      values (${fx.athleteId}, ${Number(pmt[0]!.id)}, ${MACRO_START}::date, ${MACRO_END}::date, ${fx.coachId})
    `;

    const s = await buildAthleteMacroSummary({ athlete_id: fx.athleteId, on_date: ON_DATE, client: sql });
    expect(s.block).toBeNull(); // no phase label ever reaches the athlete
    expect(s.current_week_start).toBe('2026-03-09'); // Monday of ON_DATE's week
    expect(s.current_week_end).toBe('2026-03-15');
    expect(s.week_label).toBe('Microciclo Base · semana 2 de 3');
  });
});
