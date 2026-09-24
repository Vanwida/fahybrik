/**
 * «Alta pendiente» desaparece en cuanto se firma el alta: la lectura de señales
 * la reconcilia con `athletes.intake_completed_at` (el hecho fresco), sin esperar
 * al siguiente barrido (hasta 15 min con la fila vieja en la ficha y en Hoy).
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { loadAthleteSignals } from '@/lib/coach/attention/signals-read';

const sql = getTestSql();

describeWithDb('«Alta pendiente» se reconcilia al leer (BD real)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`update athletes set onboarded_at = now() - interval '1 day' where id = ${fx.athleteId}`;
    await sql`
      insert into coach_attention_items (coach_id, athlete_id, signal_kind, severity, label, detail, dedupe_key)
      values (${fx.coachId}, ${fx.athleteId}, 'intake_pending', 'warning', 'Alta pendiente', 'hace 1 d',
              ${`intake_pending:${fx.athleteId}`})
    `;
  });

  afterAll(async () => {
    await sql`delete from coach_attention_items where coach_id = ${fx.coachId}`;
    await fx.cleanup();
    await closeTestSql();
  });

  const kinds = async () =>
    ((await loadAthleteSignals({ coach_id: fx.coachId, client: sql })).get(String(fx.athleteId))?.live ?? []).map(
      (s) => s.kind,
    );

  it('mientras el alta está por revisar, la señal está', async () => {
    expect(await kinds()).toEqual(['intake_pending']);
  });

  it('firmada el alta, la señal persistida ya no se lee', async () => {
    await sql`update athletes set intake_completed_at = now() where id = ${fx.athleteId}`;
    expect(await kinds()).toEqual([]);
  });
});
