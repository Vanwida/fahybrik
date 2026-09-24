// Ajustes de método que ya eran dato del coach y ahora se editan (DB real):
// la cadencia de tests decide «Toca test», la duración máxima de un programa es
// NULL = defecto, y el huso del club mueve el «hoy» de la publicación automática.

import { afterAll, expect, test } from 'vitest';
import { getTestCadenceSetting, setTestCadence } from '@/lib/coach/test-cadence';
import { resolveEffectiveThresholds } from '@/lib/coach/signal-thresholds';
import { getMaxProgramWeeksSetting, loadCoachMaxMicrocicloWeeks, setMaxProgramWeeks } from '@/lib/coach/microcycle-limits';
import { getCoachTimezoneSetting, loadCoachTimezone, setCoachTimezone } from '@/lib/coach/coach-timezone';
import { runAutoPublish } from '@/lib/coach/week-publishing-cron';
import {
  getCoachRunningThresholdsSetting,
  patchCoachRunningThresholds,
  resolveEffectiveRunningThresholds,
} from '@/lib/coach/running-thresholds';
import { getCoachHrMethodSetting, resetCoachHrMethod, upsertCoachHrMethod } from '@/lib/coach/hr-method';
import { getCoachPaceZones, saveCoachPaceZones, PaceZonesError } from '@/lib/coach/methodology-zones';
import { DEFAULT_COACH_HR_METHOD } from '@fahybrid/shared/domain/coach/hr-method';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('ajustes de método del coach (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    for (const fx of fixtures) {
      await sql`delete from weekly_plans where athlete_id = ${fx.athleteId}`;
      await sql`delete from coach_running_thresholds where coach_id = ${fx.coachId}`;
      await sql`delete from coach_hr_method where coach_id = ${fx.coachId}`;
      await sql`delete from methodology_zones where coach_id = ${fx.coachId}`;
    }
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  async function fresh(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    return fx;
  }

  test('«Toca test» sale de la cadencia del coach (su repetición más corta)', async () => {
    const fx = await fresh();
    expect((await getTestCadenceSetting(fx.coachId, sql)).effective).toEqual([6, 12]);
    expect((await resolveEffectiveThresholds(fx.coachId, sql)).test_due_days).toBe(42);
    await setTestCadence(fx.coachId, [10, 8], sql);
    expect((await getTestCadenceSetting(fx.coachId, sql)).stored).toEqual([8, 10]);
    expect((await resolveEffectiveThresholds(fx.coachId, sql)).test_due_days).toBe(56);
    await setTestCadence(fx.coachId, [6, 12], sql);
    expect((await getTestCadenceSetting(fx.coachId, sql)).stored).toBeNull();
  });

  test('duración máxima de un programa: NULL = 8, editable', async () => {
    const fx = await fresh();
    expect(await getMaxProgramWeeksSetting(fx.coachId, sql)).toEqual({ stored: null, effective: 8, default_weeks: 8 });
    await setMaxProgramWeeks(fx.coachId, 12, sql);
    expect(await loadCoachMaxMicrocicloWeeks({ coach_id: fx.coachId, client: sql })).toBe(12);
    await setMaxProgramWeeks(fx.coachId, 8, sql);
    expect((await getMaxProgramWeeksSetting(fx.coachId, sql)).stored).toBeNull();
  });

  test('umbrales de carrera: se cambia una clave y restaurar deja al coach sin fila', async () => {
    const fx = await fresh();
    expect((await getCoachRunningThresholdsSetting(fx.coachId, sql)).is_custom).toBe(false);
    await patchCoachRunningThresholds(fx.coachId, { gradient_retires_pace_pct: 7 }, sql);
    expect((await resolveEffectiveRunningThresholds(fx.coachId, sql)).gradient_retires_pace_pct).toBe(7);
    await patchCoachRunningThresholds(fx.coachId, { gradient_retires_pace_pct: null }, sql);
    expect((await getCoachRunningThresholdsSetting(fx.coachId, sql)).is_custom).toBe(false);
  });

  test('bandas de FC: se guardan enteras y restaurar vuelve a los defectos', async () => {
    const fx = await fresh();
    await upsertCoachHrMethod(fx.coachId, { ...DEFAULT_COACH_HR_METHOD, z2_hi_frac: 0.87, z3_lo_frac: 0.88 }, sql);
    const s = await getCoachHrMethodSetting(fx.coachId, sql);
    expect(s.is_custom).toBe(true);
    expect(s.method.z2_hi_frac).toBeCloseTo(0.87);
    await resetCoachHrMethod(fx.coachId, sql);
    expect((await getCoachHrMethodSetting(fx.coachId, sql)).is_custom).toBe(false);
  });

  test('zonas de ritmo: seis filas propias, coherentes, y el estándar al restaurar', async () => {
    const fx = await fresh();
    const std = await getCoachPaceZones(fx.coachId, 'per_km', sql);
    expect(std.is_standard).toBe(true);
    const edit = std.zones.map((z) => ({ label: z.label, low_offset_s: z.low_offset_s, high_offset_s: z.high_offset_s }));
    edit[1] = { ...edit[1]!, label: 'Rodaje', low_offset_s: 30 };
    const saved = await saveCoachPaceZones(fx.coachId, 'per_km', edit, sql);
    expect(saved.is_standard).toBe(false);
    expect(saved.zones[1]).toMatchObject({ code: 'Z2', label: 'Rodaje', low_offset_s: 30, role: 'aerobic_base' });
    await expect(
      saveCoachPaceZones(fx.coachId, 'per_km', edit.map((z, i) => (i === 3 ? { ...z, low_offset_s: 5 } : z)), sql),
    ).rejects.toBeInstanceOf(PaceZonesError);
    expect((await saveCoachPaceZones(fx.coachId, 'per_km', null, sql)).is_standard).toBe(true);
  });

  test('el huso del club: se guarda validado y mueve el «hoy» de la publicación automática', async () => {
    const madrid = await fresh();
    const mexico = await fresh();
    expect((await getCoachTimezoneSetting(mexico.coachId, sql)).timezone).toBeNull();
    await setCoachTimezone(mexico.coachId, 'America/Mexico_City', sql);
    expect(await loadCoachTimezone(mexico.coachId, sql)).toBe('America/Mexico_City');

    // Se abre el MISMO lunes (N = 0). Dom 27 sept 22:30 UTC: en Madrid ya es lunes
    // 28; en México todavía es domingo 27.
    const now = new Date('2026-09-27T22:30:00Z');
    for (const fx of [madrid, mexico]) {
      await sql`update coaches set auto_publish_days_before = 0 where id = ${fx.coachId}`;
      await sql`
        insert into weekly_plans (athlete_id, week_start, status, delivery_mode)
        values (${fx.athleteId}, '2026-09-28', 'draft', 'scheduled')
      `;
      await runAutoPublish({ client: sql, now, coach_id: fx.coachId });
    }
    const status = async (fx: Fixture) =>
      (await sql<Array<{ status: string }>>`
        select status::text from weekly_plans where athlete_id = ${fx.athleteId} and week_start = '2026-09-28'
      `)[0]!.status;
    expect(await status(madrid)).toBe('published');
    expect(await status(mexico)).toBe('draft');

    // Un huso que Postgres no conoce no tumba el barrido: cae al defecto.
    await sql`update coaches set timezone = 'Mars/Olympus_Mons' where id = ${mexico.coachId}`;
    await runAutoPublish({ client: sql, now, coach_id: mexico.coachId });
    expect(await status(mexico)).toBe('published');
  });
});
