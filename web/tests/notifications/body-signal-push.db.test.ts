/**
 * El cron de avisos (check-in saltado, VFC) empuja al coach las señales que Hoy
 * YA decidió con sus umbrales — no reglas propias — una vez por episodio, nunca
 * lo pospuesto o hecho, y no le manda al atleta ningún consejo en nombre de su
 * coach («Considera Z2 hoy»).
 */
import { afterEach, beforeEach, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { checkHrvCrashes, checkSkippedCheckins } from '@/lib/notifications/triggers';

const sql = getTestSql();

describeWithDb('avisos del cron = señales de Hoy (BD real)', () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await makeCoachAndAthlete(sql);
  });

  afterEach(async () => {
    await sql`delete from notifications where user_id in (${fx.coachUserId}, ${fx.athleteUserId})`;
    await sql`delete from coach_alert_overrides where coach_id = ${fx.coachId}`;
    await sql`delete from coach_attention_items where coach_id = ${fx.coachId}`;
    await fx.cleanup();
    await closeTestSql();
  });

  async function signal(kind: string, label: string, dedupe: string) {
    await sql`
      insert into coach_attention_items (coach_id, athlete_id, signal_kind, severity, label, detail, dedupe_key)
      values (${fx.coachId}, ${fx.athleteId}, ${kind}, ${kind === 'hrv_crash' ? 'critical' : 'warning'}, ${label}, 'evidencia', ${dedupe})
    `;
  }

  const sent = (userId: number) => sql<Array<{ kind: string; dedupe_key: string; label: string }>>`
    select payload_json->>'kind' as kind, payload_json->>'dedupe_key' as dedupe_key, payload_json->>'label' as label
    from notifications where user_id = ${userId} and type = 'recovery_alert' order by id
  `;

  it('sin señal en Hoy no avisa (aunque no haya check-in en días)', async () => {
    expect(await checkSkippedCheckins({ sql })).toEqual({ flagged: 0 });
    expect(await sent(fx.coachUserId)).toEqual([]);
  });

  it('la señal de Hoy avisa al coach una vez por episodio; un episodio nuevo vuelve a avisar', async () => {
    await signal('checkin_skipped', 'Sin check-in · 3 d', `checkin_skipped:${fx.athleteId}:2026-09-20`);
    await checkSkippedCheckins({ sql });
    await checkSkippedCheckins({ sql });
    expect(await sent(fx.coachUserId)).toEqual([
      { kind: 'checkin_skipped', dedupe_key: `checkin_skipped:${fx.athleteId}:2026-09-20`, label: 'Sin check-in · 3 d' },
    ]);

    await sql`
      update coach_attention_items set dedupe_key = ${`checkin_skipped:${fx.athleteId}:2026-09-22`}
      where athlete_id = ${fx.athleteId}
    `;
    expect(await checkSkippedCheckins({ sql })).toEqual({ flagged: 1 });
  });

  it('lo pospuesto en Hoy no se empuja', async () => {
    await signal('checkin_skipped', 'Sin check-in · 3 d', `checkin_skipped:${fx.athleteId}:x`);
    await sql`
      insert into coach_alert_overrides (coach_id, athlete_id, signal_kind, snoozed_until, dedupe_key, override_kind)
      values (${fx.coachId}, ${fx.athleteId}, 'checkin_skipped', now() + interval '3 days', ${`checkin_skipped:${fx.athleteId}:x`}, 'snooze')
    `;
    expect(await checkSkippedCheckins({ sql })).toEqual({ flagged: 0 });
  });

  it('VFC: solo al coach, y al atleta ningún consejo', async () => {
    await signal('hrv_crash', 'HRV −14 ms', `hrv_crash:${fx.athleteId}`);
    expect(await checkHrvCrashes({ sql })).toEqual({ flagged: 1 });
    expect((await sent(fx.coachUserId)).map((r) => r.kind)).toEqual(['hrv_crash']);
    expect(await sent(fx.athleteUserId)).toEqual([]);
  });
});
