/**
 * La columna Estado de la ficha dice cuántas lecturas lleva hacia su base —
 * «aún sin su base (2 de 7 lecturas)» — igual que Hoy, el roster y el vistazo.
 * Antes el cockpit no recibía `baseline_readings` y decía solo «aún sin su base».
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { loadFichaShell } from '@/lib/dashboard/v2/atleta-detalle';
import { loadAthletePeek } from '@/lib/coach/athlete-peek';
import { readinessBaseText } from '@fahybrid/shared/domain/coach/readiness-evidence';

const sql = getTestSql();

describeWithDb('ficha · readiness sin base cuenta sus lecturas (BD real)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const t = await sql<Array<{ today: string }>>`select to_char((now() at time zone 'Europe/Madrid')::date,'YYYY-MM-DD') as today`;
    const today = t[0]!.today;
    await sql`
      insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score)
      values (${fx.athleteId}, ${today}::date - 2, 70),
             (${fx.athleteId}, ${today}::date - 1, 66),
             (${fx.athleteId}, ${today}::date, 38)
    `;
  });

  afterAll(async () => {
    await sql`delete from athlete_daily_readiness_snapshots where athlete_id = ${fx.athleteId}`;
    await fx.cleanup();
    await closeTestSql();
  });

  it('la ficha trae las lecturas previas del vistazo y la frase las cuenta', async () => {
    const [shell, peek] = await Promise.all([
      loadFichaShell({ coach_id: fx.coachId, athlete_id: fx.athleteId, club_name: 'Club', client: sql }),
      loadAthletePeek({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql }),
    ]);
    const r = shell!.readiness!;
    expect(r.baseline).toBeNull();
    expect(r.baseline_readings).toBe(peek!.readiness!.baseline_readings);
    expect(r.baseline_readings).toBe(2);
    expect(readinessBaseText(r)).toBe('aún sin su base (2 de 7 lecturas)');
  });
});
