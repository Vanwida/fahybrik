// El roster set-based (web/lib/dashboard/athletes/roster.ts) contra una base
// REAL: un número CONSTANTE de consultas sea cual sea el roster, y cada columna
// de la fila con su verdad (readiness con su base y 14 d, adherencia debida,
// programa y semana, próximo entreno, carrera, grupo, por responder).

import { afterAll, beforeAll, expect, it } from 'vitest';
import postgres from 'postgres';
import type { Sql } from '@/lib/db';
import { loadRoster } from '@/lib/dashboard/athletes/roster';
import { loadHoy } from '@/lib/dashboard/hoy/load-hoy';
import { closeTestSql, describeWithDb, getTestDbUrl, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2026-09-23T10:00:00.000Z'); // miércoles

function day(offset: number): string {
  return new Date(Date.UTC(2026, 8, 23 + offset)).toISOString().slice(0, 10);
}

describeWithDb('loadRoster — set-based', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let counting: Sql;
  let queries = 0;
  const extraUsers: number[] = [];
  const extraAthletes: number[] = [];
  let sequenceId = 0;

  beforeAll(async () => {
    counting = postgres(getTestDbUrl()!, {
      max: 4,
      prepare: false,
      types: { bigint: postgres.BigInt },
      debug: () => {
        queries += 1;
      },
    }) as unknown as Sql;

    fx = await makeCoachAndAthlete(sql);
    await sql`update athletes set onboarded_at = now() - interval '40 days',
                                  intake_completed_at = now() - interval '39 days'
              where id = ${fx.athleteId}`;
    const a = fx.athleteId;

    // Readiness: 10 días en 60 y hoy 58 → base 60, sin señal.
    for (let i = -10; i <= -1; i += 1) {
      await sql`insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score) values (${a}, ${day(i)}::date, 60)`;
    }
    await sql`insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score) values (${a}, ${day(0)}::date, 58)`;

    // Programa en curso desde el lunes de hace una semana (semana 2 de 4).
    const tpl = await makeTemplate({ fx, name: 'Umbral 5×1 km' });
    const month = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name) values (${fx.coachId}, 'Base aeróbica') returning id::text
    `;
    fx.monthTemplates.push({ monthId: Number(month[0]!.id), weekIds: [] });
    await sql`
      insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date)
      values (${a}, ${Number(month[0]!.id)}, '2026-09-14', '2026-10-11')
    `;
    for (const [d, status] of [
      [day(-2), 'completed'],
      [day(-1), 'missed'],
      [day(0), 'scheduled'],
      [day(1), 'scheduled'],
    ] as const) {
      await sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
                values (${a}, ${d}::date, ${tpl}, 1, ${status}::assignment_status)`;
    }
    // Carrera objetivo en 24 días.
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority, race_date, status)
      values (${a}, 'HYROX Valencia', 'hyrox', 'singles', 'open', 'men', 'target', ${day(24)}::date, 'registered')
    `;
    // Grupo con nombre propio (mig 0215).
    const seq = await sql<Array<{ id: string }>>`
      insert into program_sequences (coach_id, name) values (${fx.coachId}, 'Mañanas HYROX') returning id::text
    `;
    sequenceId = Number(seq[0]!.id);
    await sql`insert into athlete_sequence_progress (athlete_id, coach_id, sequence_id)
              values (${a}, ${fx.coachId}, ${sequenceId})`;
    // Un mensaje del atleta, sin leer y sin responder.
    const thread = await sql<Array<{ id: string }>>`
      insert into chat_threads (coach_id, athlete_id) values (${fx.coachId}, ${a}) returning id::text
    `;
    await sql`insert into chat_messages (thread_id, sender_user_id, sender_role, body, created_at)
              values (${Number(thread[0]!.id)}, ${fx.athleteUserId}, 'athlete', 'hola', ${day(0) + 'T08:00:00Z'}::timestamptz)`;
  });

  afterAll(async () => {
    const all = [fx.athleteId, ...extraAthletes];
    await sql`delete from chat_threads where coach_id = ${fx.coachId}`;
    await sql`delete from athlete_sequence_progress where coach_id = ${fx.coachId}`;
    await sql`delete from program_sequences where coach_id = ${fx.coachId}`;
    await sql`delete from races where athlete_id = any(${all}::bigint[])`;
    await sql`delete from athlete_daily_readiness_snapshots where athlete_id = any(${all}::bigint[])`;
    await sql`delete from coach_alert_overrides where athlete_id = any(${all}::bigint[])`;
    await sql`delete from athletes where id = any(${extraAthletes}::bigint[])`;
    await sql`delete from users where id = any(${extraUsers}::bigint[])`;
    await fx.cleanup();
    await (counting as unknown as { end: () => Promise<void> }).end();
    await closeTestSql();
  });

  it('la fila dice la verdad de cada columna', async () => {
    const rows = await loadRoster({ coach_id: fx.coachId, now: NOW, client: sql });
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r).toMatchObject({
      lifecycle: 'activo',
      week_visibility: 'visible',
      program: { name: 'Base aeróbica', week: 2, weeks: 4 },
      next_session: { date: day(0), title: 'Umbral 5×1 km' },
      race: { name: 'HYROX Valencia', date: day(24), days: 24 },
      group: { id: String(sequenceId), name: 'Mañanas HYROX' },
      unread: 1,
      awaiting_reply: true,
      // Debidas: lunes hecho, martes perdido; hoy y mañana no cuentan.
      adherence_14d: { pct: 50, due: 2, done: 1 },
    });
    expect(r.readiness).toMatchObject({ value: 58, baseline: 60, observed_at: day(0), band: 'caution' });
    expect(r.readiness!.trend_14d).toHaveLength(14);
    expect(r.readiness!.trend_14d[13]).toBe(58);
    expect(r.readiness!.trend_14d[2]).toBeNull();
    expect(r.status.key).toBe('al_dia');
  });

  it('Hoy y Atletas cuentan lo mismo: «te necesitan» y «por responder» (una sola verdad)', async () => {
    const check = async () => {
      const [rows, hoy] = await Promise.all([
        loadRoster({ coach_id: fx.coachId, now: NOW, client: sql }),
        loadHoy({ coach_id: fx.coachId, now: NOW, client: sql }),
      ]);
      const needs = rows.filter((r) => r.status.needs_you).map((r) => r.athlete_id).sort();
      const inHoy = new Set([
        ...hoy.systemic.flatMap((g) => g.athlete_ids),
        ...[...hoy.critico, ...hoy.vigilar].map((r) => r.athlete_id),
      ]);
      expect(hoy.counts.needs_you).toBe(needs.length);
      expect([...inHoy].sort()).toEqual(needs);
      expect(hoy.counts.awaiting_reply).toBe(rows.filter((r) => r.awaiting_reply).length);
      return { rows, hoy };
    };

    // El atleta escribió hace 2 h (bajo el umbral): por responder en Mensajes y
    // en el filtro de Hoy, pero todavía no «te necesita».
    const first = await check();
    expect(first.hoy.counts.needs_you).toBe(0);
    expect(first.hoy.counts.awaiting_reply).toBe(1);
    expect(first.hoy.replies.map((r) => r.athlete_id)).toEqual([String(fx.athleteId)]);
    expect(first.hoy.replies[0]!.primary).toMatchObject({ kind: 'message_unanswered', severity: 'info', lens: 'mensajes' });

    // Su semana oculta: ya no está «Al día» y te necesita, en las dos pantallas.
    await sql`insert into weekly_plans (athlete_id, week_start, status, delivery_mode)
              values (${fx.athleteId}, '2026-09-21', 'draft', 'manual')`;
    try {
      const hidden = await check();
      expect(hidden.hoy.counts.needs_you).toBe(1);
      expect(hidden.rows[0]!.status).toMatchObject({ key: 'vigilar', reason: 'Su semana está retenida por ti' });
    } finally {
      await sql`delete from weekly_plans where athlete_id = ${fx.athleteId}`;
    }
  });

  it('«hecho» en el hilo quita el por responder hasta que vuelva a escribir', async () => {
    await sql`
      insert into coach_alert_overrides (coach_id, athlete_id, signal_kind, dismissed_at, override_kind)
      values (${fx.coachId}, ${fx.athleteId}, 'message_unanswered', ${day(0) + 'T09:00:00Z'}::timestamptz, 'done')
    `;
    const rows = await loadRoster({ coach_id: fx.coachId, now: NOW, client: sql });
    expect(rows[0]!.awaiting_reply).toBe(false);
    expect(rows[0]!.unread).toBe(1);
  });

  it('número de consultas constante: 1 atleta o 6, las mismas', async () => {
    // Calentar: abrir las conexiones del pool cuesta sus propias consultas de
    // arranque, que no son de la página.
    await loadRoster({ coach_id: fx.coachId, now: NOW, client: counting });
    await loadHoy({ coach_id: fx.coachId, now: NOW, client: counting });
    queries = 0;
    await loadRoster({ coach_id: fx.coachId, now: NOW, client: counting });
    const one = queries;
    queries = 0;
    await loadHoy({ coach_id: fx.coachId, now: NOW, client: counting });
    const hoyOne = queries;

    for (let i = 0; i < 5; i += 1) {
      const u = await sql<Array<{ id: string }>>`
        insert into users (email, role) values (${`roster-${Date.now()}-${i}-${Math.random()}@test.local`}, 'athlete')
        returning id::text
      `;
      extraUsers.push(Number(u[0]!.id));
      const at = await sql<Array<{ id: string }>>`
        insert into athletes (user_id, coach_id, full_name) values (${Number(u[0]!.id)}, ${fx.coachId}, ${`Extra ${i}`})
        returning id::text
      `;
      extraAthletes.push(Number(at[0]!.id));
    }

    queries = 0;
    const rows = await loadRoster({ coach_id: fx.coachId, now: NOW, client: counting });
    expect(rows).toHaveLength(6);
    expect(queries).toBe(one);
    expect(queries).toBeLessThanOrEqual(12);
    queries = 0;
    await loadHoy({ coach_id: fx.coachId, now: NOW, client: counting });
    expect(queries).toBe(hoyOne);
    // Los invitados sin cuestionario salen como «nuevo» (Invitado), no «sin plan».
    const extra = rows.find((r) => r.name === 'Extra 0')!;
    expect(extra).toMatchObject({ lifecycle: 'nuevo', week_visibility: 'sin_plan', adherence_14d: null, readiness: null });
    expect(extra.status).toMatchObject({ key: 'nuevo', label: 'Invitado' });
  });
});
