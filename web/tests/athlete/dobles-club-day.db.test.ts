/**
 * EL DÍA DE UNA PAREJA DE DOBLES ES EL DE SU CLUB — contra base de datos REAL.
 *
 * Una pareja es del club (`doubles_pairs.coach_id`), así que «este mes», la racha
 * de semanas y «el mismo día» (el tiempo de la pareja en el último entreno juntos,
 * el resumen conjunto) se cuentan en el huso de SU coach (`coaches.timezone`), no
 * en Madrid (DECISIONS 2026-09-23, «Qué día es en cada sitio»). Antes el SQL
 * llevaba `at time zone 'Europe/Madrid'` escrito a mano.
 *
 * Los instantes están elegidos para que el día del club y el de Madrid NO
 * coincidan (Ciudad de México, UTC−6: el domingo por la noche allí ya es lunes en
 * Madrid; Auckland, UTC+13: su lunes empieza cuando en Madrid aún es domingo).
 * Cada caso compara con lo que daba el código viejo (`tz: BOX_TIMEZONE`).
 *
 * Todo ocurre dentro de una transacción que se deshace al final: no queda ninguna
 * fila, ni aunque un caso falle a medias.
 */

import { afterAll, describe, expect, it } from 'vitest';
import type { Sql } from '@/lib/db';
import {
  computeDoublesStreak,
  consecutiveWeeksStreak,
  loadDoublesPairTimezone,
  loadLastJoint,
} from '@/lib/athlete/dobles-streak';
import { buildJointSummary } from '@/lib/athlete/dobles-joint-summary';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

const MEXICO = 'America/Mexico_City';
const AUCKLAND = 'Pacific/Auckland';

// ── El paseo de la racha, puro (sin base) ─────────────────────────────────────
describe('consecutiveWeeksStreak cuenta la semana en curso del huso que recibe', () => {
  // Lunes 28 sept 03:30 UTC: en Madrid ya es lunes 28; en México, domingo 27.
  const now = new Date('2026-09-28T03:30:00Z');

  it('domingo noche en México: la semana del 21 sigue en curso y la del 14 cuenta', () => {
    expect(consecutiveWeeksStreak(new Set(['2026-09-14']), now, MEXICO)).toBe(1);
    // Con el lunes de Madrid, la semana del 21 ya está vacía y rompe la racha.
    expect(consecutiveWeeksStreak(new Set(['2026-09-14']), now, BOX_TIMEZONE)).toBe(0);
  });
});

interface PairFixture {
  tx: Sql;
  coachId: number;
  a: number;
  b: number;
  templateId: number;
}

describeWithDb('dobles: racha, mes y «mismo día» en el huso del club de la pareja (DB real)', () => {
  const sql = getTestSql();
  const ROLLBACK = new Error('rollback');

  afterAll(async () => {
    await closeTestSql();
  });

  /** Un club con `tz`, dos atletas suyos en pareja activa y una plantilla. Se deshace al acabar. */
  async function withPair(tz: string | null, fn: (p: PairFixture) => Promise<void>): Promise<void> {
    await sql
      .begin(async (raw) => {
        const tx = raw as unknown as Sql;
        const tag = `dobles-club-day-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        const [coachUser] = await tx<Array<{ id: string }>>`
          insert into users (email, role) values (${`${tag}-coach@test.local`}, 'coach') returning id::text
        `;
        const [coach] = await tx<Array<{ id: string }>>`
          insert into coaches (user_id, full_name, timezone)
          values (${Number(coachUser!.id)}, 'Club de prueba', ${tz})
          returning id::text
        `;
        const coachId = Number(coach!.id);
        const athlete = async (who: string): Promise<number> => {
          const [u] = await tx<Array<{ id: string }>>`
            insert into users (email, role) values (${`${tag}-${who}@test.local`}, 'athlete') returning id::text
          `;
          const [a] = await tx<Array<{ id: string }>>`
            insert into athletes (user_id, coach_id, full_name)
            values (${Number(u!.id)}, ${coachId}, ${`${who} Dobles`})
            returning id::text
          `;
          return Number(a!.id);
        };
        // athlete_a_id < athlete_b_id (orden canónico de la pareja): A se crea antes.
        const a = await athlete('Ana');
        const b = await athlete('Berta');
        await tx`
          insert into doubles_pairs (coach_id, athlete_a_id, athlete_b_id, status)
          values (${coachId}, ${a}, ${b}, 'active')
        `;
        const [tpl] = await tx<Array<{ id: string }>>`
          insert into templates (coach_id, name, format, version)
          values (${coachId}, 'Sim Dobles', 'hyrox_sim'::template_format, 1)
          returning id::text
        `;
        await fn({ tx, coachId, a, b, templateId: Number(tpl!.id) });
        throw ROLLBACK;
      })
      .catch((e: unknown) => {
        if (e !== ROLLBACK) throw e;
      });
  }

  /** Un entreno registrado «juntos» (0074): su asignación + su ejecución enlazada al compañero. */
  async function joint(
    p: PairFixture,
    who: number,
    partner: number,
    at: string,
    seconds: number | null = null,
  ): Promise<number> {
    const [wa] = await p.tx<Array<{ id: string }>>`
      insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
      values (${who}, ${at.slice(0, 10)}::date, ${p.templateId}, 1, 'completed'::assignment_status)
      returning id::text
    `;
    await p.tx`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, partner_athlete_id
      )
      values (${Number(wa!.id)}, ${who}, ${at}::timestamptz, ${at}::timestamptz, ${seconds}, ${partner})
    `;
    return Number(wa!.id);
  }

  it('el huso es el del coach de la pareja (la activa, si no la última); sin pareja, el del club del atleta', async () => {
    await withPair(MEXICO, async (p) => {
      expect(await loadDoublesPairTimezone(p.a, p.tx)).toBe(MEXICO);
      expect(await loadDoublesPairTimezone(p.b, p.tx)).toBe(MEXICO);

      // La pareja se disuelve y Ana se va a un club de Auckland: lo que entrenó
      // en pareja sigue contándose en el club de esa pareja.
      const tag = `dobles-club-day-otro-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const [u] = await p.tx<Array<{ id: string }>>`
        insert into users (email, role) values (${`${tag}@test.local`}, 'coach') returning id::text
      `;
      const [other] = await p.tx<Array<{ id: string }>>`
        insert into coaches (user_id, full_name, timezone) values (${Number(u!.id)}, 'Otro club', ${AUCKLAND})
        returning id::text
      `;
      await p.tx`update doubles_pairs set status = 'dissolved' where coach_id = ${p.coachId}`;
      await p.tx`update athletes set coach_id = ${Number(other!.id)} where id = ${p.a}`;
      expect(await loadDoublesPairTimezone(p.a, p.tx)).toBe(MEXICO);

      // Sin ninguna pareja, el club del atleta.
      await p.tx`delete from doubles_pairs where coach_id = ${p.coachId}`;
      expect(await loadDoublesPairTimezone(p.a, p.tx)).toBe(AUCKLAND);
    });
    await withPair(null, async (p) => {
      expect(await loadDoublesPairTimezone(p.a, p.tx)).toBe(BOX_TIMEZONE);
    });
  });

  it('la racha: el domingo noche en México sigue siendo la semana del club (2, no 1)', async () => {
    await withPair(MEXICO, async (p) => {
      // Dom 27 21:00 en México = lun 28 05:00 en Madrid.
      await joint(p, p.a, p.b, '2026-09-28T03:00:00Z');
      // Dom 20 14:00 en México (y 22:00 en Madrid): semana del 14 en los dos.
      await joint(p, p.a, p.b, '2026-09-20T20:00:00Z');
      const now = new Date('2026-09-28T03:30:00Z');

      const club = await computeDoublesStreak({ athleteId: p.a, now }, p.tx);
      expect(club).toEqual({ joint_this_month: 2, weeks_streak: 2 });

      // El código viejo contaba en Madrid: lunes 28 → la semana del 21 vacía.
      const madrid = await computeDoublesStreak({ athleteId: p.a, now, tz: BOX_TIMEZONE }, p.tx);
      expect(madrid.weeks_streak).toBe(1);
    });
  });

  it('«este mes»: el 30 de septiembre por la noche en México aún es septiembre (2, no 1)', async () => {
    await withPair(MEXICO, async (p) => {
      // Mié 30 20:00 en México = jue 1 oct 04:00 en Madrid.
      await joint(p, p.a, p.b, '2026-10-01T02:00:00Z');
      await joint(p, p.a, p.b, '2026-09-30T12:00:00Z');
      const now = new Date('2026-10-01T03:00:00Z'); // mié 30 21:00 en México

      const club = await computeDoublesStreak({ athleteId: p.a, now }, p.tx);
      expect(club.joint_this_month).toBe(2);

      const madrid = await computeDoublesStreak({ athleteId: p.a, now, tz: BOX_TIMEZONE }, p.tx);
      expect(madrid.joint_this_month).toBe(1);
    });
  });

  it('el último entreno juntos y el resumen conjunto casan los dos lados por el día del club', async () => {
    await withPair(MEXICO, async (p) => {
      // Mío: dom 27 21:00 en México (lun 28 en Madrid). Suyo: dom 27 14:00 en México (dom 27 en Madrid).
      const mine = await joint(p, p.a, p.b, '2026-09-28T03:00:00Z', 1700);
      await joint(p, p.b, p.a, '2026-09-27T20:00:00Z', 1800);

      const last = await loadLastJoint({ athleteId: p.a, partnerAthleteId: p.b }, p.tx);
      expect(last).toMatchObject({ date: '2026-09-27', self_time_s: 1700, partner_time_s: 1800 });

      const madrid = await loadLastJoint({ athleteId: p.a, partnerAthleteId: p.b, tz: BOX_TIMEZONE }, p.tx);
      expect(madrid).toMatchObject({ date: '2026-09-28', partner_time_s: null });

      const summary = await buildJointSummary(
        { selfAthleteId: BigInt(p.a), fullName: 'Ana Dobles', assignmentId: mine },
        p.tx,
      );
      expect(summary.ok).toBe(true);
      if (!summary.ok) return;
      expect(summary.dto.self.total_time_s).toBe(1700);
      // En Madrid serían dos días distintos y el lado de Berta saldría vacío.
      expect(summary.dto.partner).toMatchObject({ name: 'Berta', total_time_s: 1800 });
    });
  });

  it('al este de Madrid también: en Auckland los dos lados caen el mismo día del club', async () => {
    await withPair(AUCKLAND, async (p) => {
      // Mío: 7 oct 11:30 en Auckland (7 oct 00:30 en Madrid). Suyo: 7 oct 10:30 en Auckland (6 oct 23:30 en Madrid).
      const mine = await joint(p, p.a, p.b, '2026-10-06T22:30:00Z', 1500);
      await joint(p, p.b, p.a, '2026-10-06T21:30:00Z', 1600);

      const last = await loadLastJoint({ athleteId: p.a, partnerAthleteId: p.b }, p.tx);
      expect(last).toMatchObject({ date: '2026-10-07', partner_time_s: 1600 });
      const madrid = await loadLastJoint({ athleteId: p.a, partnerAthleteId: p.b, tz: BOX_TIMEZONE }, p.tx);
      expect(madrid?.partner_time_s).toBeNull();

      const summary = await buildJointSummary(
        { selfAthleteId: BigInt(p.a), fullName: 'Ana Dobles', assignmentId: mine },
        p.tx,
      );
      expect(summary.ok && summary.dto.partner?.total_time_s).toBe(1600);
    });
  });

  it('un huso guardado que nadie conoce no tumba nada: cae al defecto', async () => {
    await withPair('Mars/Olympus_Mons', async (p) => {
      expect(await loadDoublesPairTimezone(p.a, p.tx)).toBe(BOX_TIMEZONE);
      const mine = await joint(p, p.a, p.b, '2026-09-28T03:00:00Z', 1700);
      await joint(p, p.a, p.b, '2026-09-20T20:00:00Z');
      const now = new Date('2026-09-28T03:30:00Z');
      expect((await computeDoublesStreak({ athleteId: p.a, now }, p.tx)).weeks_streak).toBe(1);
      expect((await loadLastJoint({ athleteId: p.a, partnerAthleteId: p.b }, p.tx))?.date).toBe('2026-09-28');
      const summary = await buildJointSummary(
        { selfAthleteId: BigInt(p.a), fullName: 'Ana Dobles', assignmentId: mine },
        p.tx,
      );
      expect(summary.ok).toBe(true);
    });
  });

  it('un huso que el motor de fechas acepta pero este Postgres no conoce cae al defecto sin tumbar la consulta', async (ctx) => {
    // El combo de Ajustes ofrece la lista del navegador, con nombres heredados
    // (p. ej. 'Europe/Kiev') que un Postgres con tzdata recortado rechaza. Cuál
    // falta depende de cada servidor: se busca uno aquí; si no falta ninguno, no
    // hay nada que probar.
    const pgNames = new Set(
      (await sql<Array<{ name: string }>>`select name from pg_timezone_names`).map((r) => r.name),
    );
    const legacy = Intl.supportedValuesOf('timeZone').find(
      (z) => !pgNames.has(z) && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(z),
    );
    if (!legacy) {
      ctx.skip();
      return;
    }
    await withPair(legacy, async (p) => {
      expect(await loadDoublesPairTimezone(p.a, p.tx)).toBe(BOX_TIMEZONE);
      await joint(p, p.a, p.b, '2026-09-28T03:00:00Z');
      const counts = await computeDoublesStreak({ athleteId: p.a, now: new Date('2026-09-28T03:30:00Z') }, p.tx);
      expect(counts.weeks_streak).toBe(1);
    });
  });
});
