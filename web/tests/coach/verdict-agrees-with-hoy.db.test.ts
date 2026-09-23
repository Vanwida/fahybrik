/**
 * El veredicto semanal y Hoy NUNCA discrepan para la misma semana de un atleta.
 *
 * Antes el motor de ajuste tenía sus propias reglas con sus propios números
 * (adherencia < 60 %, 2 sin hacer, readiness < 45…) y no leía los del coach: a
 * quien hizo 8 de 10 Hoy le decía «al día» (proporción del coach, 30 %) y el
 * lunes el veredicto le proponía un ajuste. Ahora el veredicto son las señales de
 * Hoy que piden tocar la semana. Este test construye la semana, corre el barrido
 * de Hoy de verdad (`recomputeCoach`), lee el estado (`loadAthleteState`) y la
 * evaluación (`evaluateAthleteWeek`, la del botón y del cron), y exige que digan
 * lo mismo — también cuando el coach cambia sus umbrales.
 */
import { afterEach, beforeEach, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { recomputeCoach } from '@/lib/coach/attention/recompute';
import { loadAthleteState } from '@/lib/coach/athlete-state';
import { evaluateAthleteWeek } from '@/lib/coach/weekly-evaluation';
import { asksToAdjustWeek } from '@/lib/coach/week-adjust-signals';

const sql = getTestSql();

describeWithDb('veredicto semanal = Hoy (BD real)', () => {
  let fx: Fixture;
  let tpl: number;
  let today: string;

  beforeEach(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`
      update athletes set onboarded_at = now() - interval '60 days', intake_completed_at = now() - interval '59 days'
      where id = ${fx.athleteId}
    `;
    tpl = await makeTemplate({ fx, name: 'Entreno' });
    const t = await sql<Array<{ today: string }>>`select to_char((now() at time zone 'Europe/Madrid')::date,'YYYY-MM-DD') as today`;
    today = t[0]!.today;
  });

  afterEach(async () => {
    await sql`delete from coach_attention_items where coach_id = ${fx.coachId}`;
    await sql`delete from coach_signal_thresholds where coach_id = ${fx.coachId}`;
    await fx.cleanup();
    await closeTestSql();
  });

  /** `n` días antes del hoy del atleta. */
  const ago = (n: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };

  /** `done` hechos y `missed` sin hacer, repartidos en los últimos 6 días. */
  async function week(done: number, missed: number) {
    for (let i = 0; i < done + missed; i += 1) {
      await makeAssignment({
        fx,
        templateId: tpl,
        scheduledForIso: ago(1 + (i % 6)),
        status: i < done ? 'completed' : 'missed',
      });
    }
  }

  async function both() {
    await recomputeCoach({ coach_id: fx.coachId, client: sql });
    const status = await loadAthleteState({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql });
    const evaluation = await evaluateAthleteWeek({ athlete_id: fx.athleteId, client: sql });
    const hoyAsks = (status?.signals ?? []).filter(asksToAdjustWeek).map((s) => `signal:${s.kind}`);
    return { status: status!, evaluation, hoyAsks };
  }

  it('3 de 4 sin hacer: Hoy vigila y el veredicto pide ajuste, por la misma señal', async () => {
    await week(1, 3);
    const { status, evaluation, hoyAsks } = await both();
    expect(status.key).toBe('vigilar');
    expect(hoyAsks).toEqual(['signal:missed_sessions']);
    expect(evaluation.verdict).toBe('needs_adjustment');
    expect(evaluation.triggers).toEqual(hoyAsks);
  });

  it('8 de 10: Hoy dice al día y el veredicto también (antes: «2 sin hacer» → ajuste)', async () => {
    await week(8, 2);
    const { status, evaluation, hoyAsks } = await both();
    expect(hoyAsks).toEqual([]);
    expect(status.key).toBe('al_dia');
    expect(evaluation.verdict).toBe('ok');
  });

  it('1 de 2 (50 %): por debajo del mínimo del coach en los dos (antes: adherencia < 60 % → ajuste)', async () => {
    await week(1, 1);
    const { evaluation, hoyAsks } = await both();
    expect(hoyAsks).toEqual([]);
    expect(evaluation.verdict).toBe('ok');
  });

  it('con los umbrales del coach (basta el número): los dos cambian a la vez', async () => {
    await sql`insert into coach_signal_thresholds (coach_id, missed_sessions_share_pct) values (${fx.coachId}, 0)`;
    await week(8, 2);
    const { status, evaluation, hoyAsks } = await both();
    expect(hoyAsks).toEqual(['signal:missed_sessions']);
    expect(status.key).toBe('vigilar');
    expect(evaluation.verdict).toBe('needs_adjustment');
    expect(evaluation.triggers).toEqual(hoyAsks);
  });
});
