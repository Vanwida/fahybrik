// El motor de señales → Hoy, contra una base REAL: el barrido con la base propia
// de readiness, «debidas sin hacer» y «por responder»; posponer / hecho /
// deshacer; y la bandeja que resulta (grupos primero, una fila por atleta).

import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Sql } from '@/lib/db';
import { recomputeCoach } from '@/lib/coach/attention/recompute';
import { loadAthleteSignals } from '@/lib/coach/attention/signals-read';
import {
  OverrideForbiddenError,
  applyOverrides,
  restoreOverrides,
} from '@/lib/coach/attention/overrides';
import { loadHoy } from '@/lib/dashboard/hoy/load-hoy';
import { loadAthleteState } from '@/lib/coach/athlete-state';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

// Miércoles 23 sept 2026, 10:00 UTC (12:00 en Madrid).
const NOW = new Date('2026-09-23T10:00:00.000Z');

function day(offset: number): string {
  return new Date(Date.UTC(2026, 8, 23 + offset)).toISOString().slice(0, 10);
}

async function addAthlete(sql: Sql, coachId: number, name: string): Promise<{ id: number; userId: number }> {
  const u = await sql<Array<{ id: string }>>`
    insert into users (email, role)
    values (${`${name.toLowerCase()}-${Date.now()}-${Math.random()}@test.local`}, 'athlete')
    returning id::text
  `;
  const a = await sql<Array<{ id: string }>>`
    insert into athletes (user_id, coach_id, full_name, onboarded_at, intake_completed_at)
    values (${Number(u[0]!.id)}, ${coachId}, ${name}, now() - interval '30 days', now() - interval '29 days')
    returning id::text
  `;
  return { id: Number(a[0]!.id), userId: Number(u[0]!.id) };
}

describeWithDb('motor de señales → Hoy', () => {
  const sql = getTestSql();
  let fx: Fixture;
  const ids: Record<'ana' | 'bea' | 'carla' | 'dani', number> = { ana: 0, bea: 0, carla: 0, dani: 0 };
  const users: number[] = [];

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    // El atleta del fixture no participa: lo pausamos para que no cuente.
    await sql`update athletes set lifecycle_status = 'pausado' where id = ${fx.athleteId}`;
    for (const [key, name] of [
      ['ana', 'Ana'],
      ['bea', 'Bea'],
      ['carla', 'Carla'],
      ['dani', 'Dani'],
    ] as const) {
      const a = await addAthlete(sql, fx.coachId, name);
      ids[key] = a.id;
      users.push(a.userId);
    }

    // Ana: 20 días estables en 70 y los 3 últimos en 50 → vigilar (su base).
    for (let i = -22; i <= -3; i += 1) {
      await sql`insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score)
                values (${ids.ana}, ${day(i)}::date, 70)`;
    }
    for (let i = -2; i <= 0; i += 1) {
      await sql`insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score)
                values (${ids.ana}, ${day(i)}::date, 50)`;
    }
    // Ana: su pregunta de hace 20 h, leída y sin responder → por responder.
    const thread = await sql<Array<{ id: string }>>`
      insert into chat_threads (coach_id, athlete_id) values (${fx.coachId}, ${ids.ana}) returning id::text
    `;
    await sql`
      insert into chat_messages (thread_id, sender_user_id, sender_role, body, created_at, read_at)
      values (${Number(thread[0]!.id)}, ${users[0]!}, 'athlete', '¿Qué peso pongo?',
              ${new Date(NOW.getTime() - 20 * 3_600_000).toISOString()}::timestamptz,
              ${new Date(NOW.getTime() - 19 * 3_600_000).toISOString()}::timestamptz)
    `;

    // Bea: una sola lectura, 35, hoy → crítico por el suelo.
    await sql`insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score)
              values (${ids.bea}, ${day(0)}::date, 35)`;

    // Carla: pausada, con una señal vieja que el barrido tiene que retirar.
    await sql`update athletes set lifecycle_status = 'pausado' where id = ${ids.carla}`;
    await sql`
      insert into coach_attention_items (coach_id, athlete_id, signal_kind, severity, label, detail, dedupe_key)
      values (${fx.coachId}, ${ids.carla}, 'missed_sessions', 'warning', 'x', 'x', 'missed_sessions:x')
    `;

    // Dani: programa en curso; 2 de 3 debidas sin hacer esta semana (visible).
    const tpl = await makeTemplate({ fx, name: 'Umbral' });
    const month = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name) values (${fx.coachId}, 'Base') returning id::text
    `;
    fx.monthTemplates.push({ monthId: Number(month[0]!.id), weekIds: [] });
    await sql`
      insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date)
      values (${ids.dani}, ${Number(month[0]!.id)}, ${day(-9)}::date, ${day(18)}::date)
    `;
    for (const [off, status] of [
      [-3, 'completed'],
      [-2, 'missed'],
      [-1, 'scheduled'],
      [0, 'scheduled'],
      [2, 'scheduled'],
    ] as const) {
      await sql`
        insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
        values (${ids.dani}, ${day(off)}::date, ${tpl}, 1, ${status}::assignment_status)
      `;
    }

    await recomputeCoach({ coach_id: fx.coachId, now: NOW, client: sql });
  });

  afterAll(async () => {
    const all = [...Object.values(ids), fx.athleteId];
    await sql`delete from coach_alert_overrides where athlete_id = any(${all}::bigint[])`;
    await sql`delete from coach_attention_items where athlete_id = any(${all}::bigint[])`;
    await sql`delete from athlete_daily_readiness_snapshots where athlete_id = any(${all}::bigint[])`;
    await sql`delete from chat_threads where coach_id = ${fx.coachId}`;
    await sql`delete from workout_assignments where athlete_id = any(${all}::bigint[])`;
    await sql`delete from athlete_month_assignments where athlete_id = any(${all}::bigint[])`;
    await sql`delete from athletes where id = any(${Object.values(ids)}::bigint[])`;
    await sql`delete from users where id = any(${users}::bigint[])`;
    await fx.cleanup();
    await closeTestSql();
  });

  async function items(athleteId: number) {
    return sql<Array<{ signal_kind: string; severity: string; label: string; detail: string; window_label: string | null; observed_at: Date | null }>>`
      select signal_kind, severity, label, detail, window_label, observed_at
      from coach_attention_items where athlete_id = ${athleteId} order by signal_kind
    `;
  }

  it('readiness frente a SU base, con valor, base, ventana y fecha', async () => {
    const ana = await items(ids.ana);
    const r = ana.find((i) => i.signal_kind === 'readiness_low')!;
    expect(r).toMatchObject({
      severity: 'warning',
      label: 'Readiness 50',
      detail: '−20 vs su base 70 (28 d) · 3 días seguidos · hoy',
      window_label: '28 d',
    });
    expect(r.observed_at?.toISOString().slice(0, 10)).toBe('2026-09-23');

    const bea = await items(ids.bea);
    expect(bea.find((i) => i.signal_kind === 'readiness_low')).toMatchObject({
      severity: 'critical',
      label: 'Readiness 35',
    });
  });

  it('por responder = el último mensaje es del atleta, aunque esté leído', async () => {
    const ana = await items(ids.ana);
    expect(ana.find((i) => i.signal_kind === 'message_unanswered')).toMatchObject({
      label: 'Por responder',
      detail: 'espera 20 h · 1 mensaje',
    });
  });

  it('debidas sin hacer: el lunes hecho, martes y miércoles(ayer) no; hoy no cuenta', async () => {
    const dani = await items(ids.dani);
    expect(dani.find((i) => i.signal_kind === 'missed_sessions')).toMatchObject({
      label: '2 de 3 debidas sin hacer',
      detail: 'últimos 7 d · el último, ayer',
      window_label: '7 d',
    });
  });

  it('sin hábito de check-in no se echa en falta; el pausado no tiene señales', async () => {
    for (const id of Object.values(ids)) {
      expect((await items(id)).some((i) => i.signal_kind === 'checkin_skipped')).toBe(false);
    }
    expect(await items(ids.carla)).toEqual([]);
  });

  it('Hoy: grupos primero, una fila por atleta, peor primero', async () => {
    const hoy = await loadHoy({ coach_id: fx.coachId, now: NOW, client: sql });
    expect(hoy.systemic.map((g) => [g.kind, [...g.athlete_ids].sort()])).toEqual([
      ['no_program', [String(ids.ana), String(ids.bea)].sort()],
    ]);
    expect(hoy.critico.map((r) => r.name)).toEqual(['Bea']);
    expect(hoy.vigilar.map((r) => [r.name, r.primary.kind, r.other_count])).toEqual([
      ['Ana', 'readiness_low', 1],
      ['Dani', 'missed_sessions', 0],
    ]);
    // Atletas, no filas: Ana y Bea (sin programa) + Dani; Bea tiene fila y grupo y cuenta una vez.
    expect(hoy.counts).toMatchObject({ needs_you: 3, critico: 1, vigilar: 2, snoozed: 0, resolved_today: 0 });
    expect(hoy.week_visibility).toEqual({ visible: 1, total: 3 });
  });

  it('posponer 1 d quita la fila hasta mañana; deshacer la devuelve igual', async () => {
    const res = await applyOverrides({
      coach_id: fx.coachId,
      targets: [{ athlete_id: String(ids.ana) }],
      action: 'snooze',
      until: '1d',
      now: NOW,
      client: sql,
    });
    // Mañana 00:00 en Madrid = 22:00 UTC de hoy.
    expect(res.until_at).toBe('2026-09-23T22:00:00.000Z');
    expect(res.applied).toBe(2);
    // La fila entera menos lo que resuelve un grupo (su «sin programa»).
    expect(res.undo.restore.map((r) => [r.signal_kind, r.previous]).sort()).toEqual([
      ['message_unanswered', null],
      ['readiness_low', null],
    ]);

    let hoy = await loadHoy({ coach_id: fx.coachId, now: NOW, client: sql });
    expect(hoy.vigilar.map((r) => r.name)).toEqual(['Dani']);
    expect(hoy.counts.snoozed).toBe(1);
    expect(hoy.snoozed_rows[0]).toMatchObject({ name: 'Ana', until: '2026-09-23T22:00:00.000Z' });
    // Pasado el plazo, vuelve sola.
    const tomorrow = new Date('2026-09-24T07:00:00Z');
    const later = await loadAthleteSignals({ coach_id: fx.coachId, now: tomorrow, client: sql });
    // Vuelven las dos de la fila (el «sin programa» nunca se pospuso: es del grupo).
    expect(later.get(String(ids.ana))!.live.map((x) => x.kind).sort()).toEqual([
      'message_unanswered',
      'programming_status',
      'readiness_low',
    ]);

    await restoreOverrides({ coach_id: fx.coachId, restore: res.undo.restore, client: sql });
    hoy = await loadHoy({ coach_id: fx.coachId, now: NOW, client: sql });
    expect(hoy.vigilar.map((r) => r.name)).toEqual(['Ana', 'Dani']);
    expect(hoy.counts.snoozed).toBe(0);
  });

  it('hecho saca la fila y cuenta como resuelto hoy; si empeora, vuelve', async () => {
    await applyOverrides({
      coach_id: fx.coachId,
      targets: [{ athlete_id: String(ids.bea) }],
      action: 'done',
      now: NOW,
      client: sql,
    });
    let hoy = await loadHoy({ coach_id: fx.coachId, now: NOW, client: sql });
    expect(hoy.critico).toEqual([]);
    expect(hoy.counts.resolved_today).toBe(1);
    const state = await loadAthleteState({ coach_id: fx.coachId, athlete_id: ids.bea, now: NOW, client: sql });
    expect(state?.key).toBe('sin_plan');

    // Mismo episodio, pero cae un 25 % más: vuelve.
    await sql`update coach_attention_items set value_numeric = 25 where athlete_id = ${ids.bea} and signal_kind = 'readiness_low'`;
    hoy = await loadHoy({ coach_id: fx.coachId, now: NOW, client: sql });
    expect(hoy.critico.map((r) => r.name)).toEqual(['Bea']);
  });

  it('un atleta de otro coach: no se escribe nada', async () => {
    const other = await makeCoachAndAthlete(sql);
    try {
      await expect(
        applyOverrides({
          coach_id: fx.coachId,
          targets: [{ athlete_id: String(ids.dani) }, { athlete_id: String(other.athleteId) }],
          action: 'done',
          now: NOW,
          client: sql,
        }),
      ).rejects.toBeInstanceOf(OverrideForbiddenError);
      const rows = await sql`select 1 from coach_alert_overrides where athlete_id = ${ids.dani}`;
      expect(rows).toHaveLength(0);
    } finally {
      await other.cleanup();
    }
  });
});
