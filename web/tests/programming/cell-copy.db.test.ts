/**
 * Real-DB integration tests for the microciclo deep-clone primitive and the
 * cell-level copy across the nivel × días matrix.
 *
 * Exercises the actual transactions (`client.begin`), real inserts/clones into
 * program_month_templates / program_week_templates / program_month_weeks /
 * program_sequences / program_sequence_items, and re-queries the Neon test branch
 * for every assertion. No SQL is mocked. The point of the whole feature is that a
 * copy is INDEPENDENT: mutating a cloned week must never touch the source.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { duplicateMonthTemplate } from '@/lib/dashboard/coach/program-months';
import { duplicateSequenceCell } from '@/lib/dashboard/coach/sequences';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import type { Sql } from '@/lib/db';

// A distinctive week document so verbatim-copy and cross-contamination are visible.
function weekSlots(tag: string): { days: unknown[] } {
  return {
    days: [
      {
        day_of_week: 1,
        focus: `foco-${tag}`,
        sessions: [
          {
            kind: 'workout',
            blocks: [
              {
                uid: `blk-${tag}`,
                title: `Bloque ${tag}`,
                items: [{ uid: `it-${tag}`, exercise_id: 7, exercise_name: `Ej ${tag}` }],
              },
            ],
          },
        ],
      },
    ],
  };
}

type SeededWeek = { name: string; focus: string; slots: { days: unknown[] }; profile?: string; weekNumber?: number };
type WeekRow = {
  id: string;
  position: number;
  name: string;
  focus: string | null;
  athlete_profile: string;
  week_number: number | null;
  slots_json: unknown;
};

// These suites do many serial round-trips on a single (max:1) connection to a
// freshly-woken Neon branch; cold-start + seed + clone + re-read comfortably
// exceeds vitest's 5s default. Generous per-test budget avoids false timeouts.
const DB_TEST_TIMEOUT = 60_000;

describeWithDb('microciclo deep-clone + cell copy (real DB)', () => {
  const sql: Sql = getTestSql();
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

  // Coach-scoped program cleanup in FK-safe order (program_sequence_items and
  // program_month_weeks carry ON DELETE RESTRICT, so children go before parents).
  async function purgeCoachProgramData(coachId: number): Promise<void> {
    await sql`delete from program_sequence_items where sequence_id in (select id from program_sequences where coach_id = ${coachId})`;
    await sql`delete from program_sequences where coach_id = ${coachId}`;
    await sql`delete from program_month_weeks where month_template_id in (select id from program_month_templates where coach_id = ${coachId})`;
    await sql`delete from program_week_templates where coach_id = ${coachId}`;
    await sql`delete from program_month_templates where coach_id = ${coachId}`;
    await sql`delete from athlete_levels where coach_id = ${coachId}`;
  }

  async function setupCoach(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    // fx.cleanup runs LAST (deletes the coach); our program purge runs FIRST.
    cleanups.push(fx.cleanup);
    cleanups.push(() => purgeCoachProgramData(fx.coachId));
    return fx;
  }

  async function makeLevel(coachId: number, name: string, sortOrder: number): Promise<number> {
    const rows = await sql<Array<{ id: string }>>`
      insert into athlete_levels (coach_id, name, label, sort_order)
      values (${coachId}, ${name}, ${`${name} label`}, ${sortOrder})
      returning id::text
    `;
    return Number(rows[0]!.id);
  }

  async function makeMonth(
    coachId: number,
    levelId: number,
    name: string,
    weeks: SeededWeek[],
  ): Promise<number> {
    const month = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name, level_id)
      values (${coachId}, ${name}, ${levelId})
      returning id::text
    `;
    const monthId = Number(month[0]!.id);
    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i]!;
      const wk = await sql<Array<{ id: string }>>`
        insert into program_week_templates
          (coach_id, name, level_id, focus, athlete_profile, week_number, slots_json)
        values (
          ${coachId}, ${w.name}, ${levelId}, ${w.focus},
          ${(w.profile ?? 'balanced')}::athlete_profile_type,
          ${w.weekNumber ?? null},
          ${sql.json(w.slots as Parameters<typeof sql.json>[0])}
        )
        returning id::text
      `;
      await sql`
        insert into program_month_weeks (month_template_id, week_template_id, position)
        values (${monthId}, ${Number(wk[0]!.id)}, ${i})
      `;
    }
    return monthId;
  }

  async function makeCell(
    coachId: number,
    levelId: number,
    days: number,
    monthIds: number[],
    config?: { end_policy?: string; progression_pct?: number | null; progression_applies_to?: string | null },
  ): Promise<number> {
    const seq = await sql<Array<{ id: string }>>`
      insert into program_sequences
        (coach_id, level_id, days_per_week, end_policy, progression_pct, progression_applies_to)
      values (
        ${coachId}, ${levelId}, ${days},
        ${config?.end_policy ?? 'repeat'},
        ${config?.progression_pct ?? null},
        ${config?.progression_applies_to ?? null}
      )
      returning id::text
    `;
    const sequenceId = Number(seq[0]!.id);
    for (let i = 0; i < monthIds.length; i++) {
      await sql`
        insert into program_sequence_items (sequence_id, position, month_template_id)
        values (${sequenceId}, ${i + 1}, ${monthIds[i]!})
      `;
    }
    return sequenceId;
  }

  async function weeksOf(monthId: number): Promise<WeekRow[]> {
    return sql<WeekRow[]>`
      select w.id::text, mw.position, w.name, w.focus, w.athlete_profile,
             w.week_number, w.slots_json
      from program_month_weeks mw
      join program_week_templates w on w.id = mw.week_template_id
      where mw.month_template_id = ${monthId}
      order by mw.position
    `;
  }

  // ── Primitive: deep clone one microciclo ───────────────────────────────────
  test('duplicateMonthTemplate deep-clones every week; editing the copy leaves the source intact', async () => {
    const fx = await setupCoach();
    const levelId = await makeLevel(fx.coachId, 'N3', 1);
    const srcMonthId = await makeMonth(fx.coachId, levelId, 'Base aeróbica', [
      { name: 'Semana 1', focus: 'F1', slots: weekSlots('m0w0'), profile: 'strength_focus', weekNumber: 1 },
      { name: 'Semana 2', focus: 'F2', slots: weekSlots('m0w1'), weekNumber: 2 },
    ]);

    const newMonthId = Number(
      await duplicateMonthTemplate({ coach_id: fx.coachId, id: srcMonthId, client: sql }),
    );
    expect(newMonthId).not.toBe(srcMonthId);

    // New month row: "(copia)" name + preserved level_id.
    const monthRow = await sql<Array<{ name: string; level_id: string | null }>>`
      select name, level_id::text from program_month_templates where id = ${newMonthId}
    `;
    expect(monthRow[0]!.name).toBe('Base aeróbica (copia)');
    expect(Number(monthRow[0]!.level_id)).toBe(levelId);

    const src = await weeksOf(srcMonthId);
    const copy = await weeksOf(newMonthId);
    expect(copy).toHaveLength(2);
    expect(copy.map((w) => w.position)).toEqual([0, 1]); // positions preserved

    for (let i = 0; i < src.length; i++) {
      const s = src[i]!;
      const c = copy[i]!;
      expect(c.id).not.toBe(s.id); // different rows
      expect(c.name).toBe(s.name); // week name identical (only the MONTH gets "(copia)")
      expect(c.focus).toBe(s.focus);
      expect(c.athlete_profile).toBe(s.athlete_profile); // carried (was silently dropped before)
      expect(c.week_number).toBe(s.week_number); // carried
      expect(c.slots_json).toEqual(s.slots_json); // verbatim
    }

    // Mutate a CLONED week — the SOURCE week must be untouched.
    const mutated = { days: [{ day_of_week: 7, focus: 'MUTATED', sessions: [] }] };
    await sql`
      update program_week_templates set slots_json = ${sql.json(mutated as Parameters<typeof sql.json>[0])}
      where id = ${Number(copy[0]!.id)}
    `;
    const srcAfter = await weeksOf(srcMonthId);
    expect(srcAfter[0]!.slots_json).toEqual(src[0]!.slots_json);
    expect(srcAfter[0]!.slots_json).not.toEqual(mutated);
  }, DB_TEST_TIMEOUT);

  // ── Headline: copy a whole cell into another (level × días) ─────────────────
  test('duplicateSequenceCell clones the whole cell, retargets the level, preserves order, stays independent', async () => {
    const fx = await setupCoach();
    const levelA = await makeLevel(fx.coachId, 'N3', 1);
    const monthA1 = await makeMonth(fx.coachId, levelA, 'Micro 1', [
      { name: 'A1S1', focus: 'a1', slots: weekSlots('a1w0') },
      { name: 'A1S2', focus: 'a2', slots: weekSlots('a1w1') },
    ]);
    const monthA2 = await makeMonth(fx.coachId, levelA, 'Micro 2', [
      { name: 'A2S1', focus: 'b1', slots: weekSlots('a2w0') },
      { name: 'A2S2', focus: 'b2', slots: weekSlots('a2w1') },
    ]);
    await makeCell(fx.coachId, levelA, 5, [monthA1, monthA2], {
      end_policy: 'repeat',
      progression_pct: 10,
      progression_applies_to: 'volume',
    });

    // Alex's exact flow: Nivel 3 · 5 días → Nivel 3 · 6 días, partiendo del primero.
    const target = await duplicateSequenceCell(
      fx.coachId,
      { level_id: levelA, days_per_week: 5 },
      { level_id: levelA, days_per_week: 6 },
      sql,
    );

    // New sequence row for the target cell, config copied from the source.
    expect(target.days_per_week).toBe(6);
    expect(Number(target.level_id)).toBe(levelA);
    expect(target.end_policy).toBe('repeat');
    expect(target.progression_pct).toBe(10);
    expect(target.progression_applies_to).toBe('volume');

    // Order preserved: 2 items, positions 1..2, pointing at NEW months.
    expect(target.items).toHaveLength(2);
    const targetMonthIds = target.items.map((it) => Number(it.month_template_id));
    expect(targetMonthIds).not.toContain(monthA1);
    expect(targetMonthIds).not.toContain(monthA2);

    // Each cloned month: retargeted level + weeks cloned verbatim (order kept).
    const sourceMonths = [monthA1, monthA2];
    for (let m = 0; m < sourceMonths.length; m++) {
      const clonedMonthId = targetMonthIds[m]!;
      const mrow = await sql<Array<{ level_id: string | null }>>`
        select level_id::text from program_month_templates where id = ${clonedMonthId}
      `;
      expect(Number(mrow[0]!.level_id)).toBe(levelA); // retargeted (same level here)

      const src = await weeksOf(sourceMonths[m]!);
      const copy = await weeksOf(clonedMonthId);
      expect(copy.map((w) => w.position)).toEqual(src.map((w) => w.position));
      for (let i = 0; i < src.length; i++) {
        expect(copy[i]!.id).not.toBe(src[i]!.id);
        expect(copy[i]!.slots_json).toEqual(src[i]!.slots_json);
        expect(copy[i]!.name).toBe(src[i]!.name);
      }
    }

    // Independence: mutate a cloned week → the matching source week is untouched.
    const firstClonedWeeks = await weeksOf(targetMonthIds[0]!);
    const srcBefore = await weeksOf(monthA1);
    await sql`
      update program_week_templates
      set slots_json = ${sql.json({ days: [] } as Parameters<typeof sql.json>[0])}
      where id = ${Number(firstClonedWeeks[0]!.id)}
    `;
    const srcAfter = await weeksOf(monthA1);
    expect(srcAfter[0]!.slots_json).toEqual(srcBefore[0]!.slots_json);
  }, DB_TEST_TIMEOUT);

  // ── Retarget to a DIFFERENT level ───────────────────────────────────────────
  test('duplicateSequenceCell retargets cloned microciclos to the destination level', async () => {
    const fx = await setupCoach();
    const levelA = await makeLevel(fx.coachId, 'N3', 1);
    const levelB = await makeLevel(fx.coachId, 'N4', 2);
    const monthA = await makeMonth(fx.coachId, levelA, 'Micro', [
      { name: 'S1', focus: 'f', slots: weekSlots('r0') },
    ]);
    await makeCell(fx.coachId, levelA, 5, [monthA]);

    const target = await duplicateSequenceCell(
      fx.coachId,
      { level_id: levelA, days_per_week: 5 },
      { level_id: levelB, days_per_week: 5 },
      sql,
    );

    expect(Number(target.level_id)).toBe(levelB);
    const clonedMonthId = Number(target.items[0]!.month_template_id);
    const mrow = await sql<Array<{ level_id: string | null }>>`
      select level_id::text from program_month_templates where id = ${clonedMonthId}
    `;
    expect(Number(mrow[0]!.level_id)).toBe(levelB);
  }, DB_TEST_TIMEOUT);

  // ── Guard: never merge into a filled target ─────────────────────────────────
  test('duplicateSequenceCell rejects when the target cell already has content', async () => {
    const fx = await setupCoach();
    const levelA = await makeLevel(fx.coachId, 'N3', 1);
    const srcMonth = await makeMonth(fx.coachId, levelA, 'Src', [
      { name: 'S1', focus: 'f', slots: weekSlots('g0') },
    ]);
    const dstMonth = await makeMonth(fx.coachId, levelA, 'Dst', [
      { name: 'D1', focus: 'f', slots: weekSlots('g1') },
    ]);
    await makeCell(fx.coachId, levelA, 5, [srcMonth]);
    await makeCell(fx.coachId, levelA, 4, [dstMonth]); // target already occupied

    await expect(
      duplicateSequenceCell(
        fx.coachId,
        { level_id: levelA, days_per_week: 5 },
        { level_id: levelA, days_per_week: 4 },
        sql,
      ),
    ).rejects.toMatchObject({ code: 'target_occupied' });

    // Nothing leaked: the occupied target still has exactly its 1 original item.
    const dst = await sql<Array<{ n: string }>>`
      select count(*)::text as n from program_sequence_items i
      join program_sequences s on s.id = i.sequence_id
      where s.coach_id = ${fx.coachId} and s.level_id = ${levelA} and s.days_per_week = 4
    `;
    expect(Number(dst[0]!.n)).toBe(1);
  }, DB_TEST_TIMEOUT);
});
