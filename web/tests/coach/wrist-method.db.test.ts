// El método de la muñeca al correr (0282), contra la base REAL (rama Neon desechable):
//   · la migración y el spec dicen lo mismo (columna + CHECK por clave, palabras del RPE),
//   · un coach que no toca nada entrega EXACTAMENTE los defectos de hoy al reloj,
//   · lo que el coach edita llega a SUS atletas y a los de nadie más (tenencia),
//   · el PUT valida en servidor (rango, coherencia, once palabras),
//   · el detalle de asignación que lee el reloj lleva `wrist_method`, y el del coach no.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import {
  COACH_THRESHOLD_KEYS,
  COACH_THRESHOLD_SPEC,
  DEFAULT_COACH_THRESHOLDS,
} from '@fahybrid/shared/domain/coach/signal-thresholds';
import { DEFAULT_WRIST_RPE_WORDS, buildWristMethod } from '@fahybrid/shared/domain/coach/wrist-method';
import { resolveAthleteWristMethod } from '@/lib/coach/signal-thresholds';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
const { getCoachSession } = await import('@/lib/auth/coach-session');
const { getAthleteSessionFromBearer } = await import('@/lib/auth/athlete-session');
const thresholdsRoute = await import('@/app/api/coach/signal-thresholds/route');
const detailRoute = await import('@/app/api/athlete/assignments/[id]/detail/route');

const put = (body: unknown) =>
  new Request('http://x', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const DEFAULT_METHOD = buildWristMethod(DEFAULT_COACH_THRESHOLDS);
const PG_CHECK_VIOLATION = '23514';

describeWithDb('el método de la muñeca (0282, base real)', () => {
  const sql = getTestSql();
  let a: Fixture;
  let b: Fixture;
  let noRow: Fixture;
  const asCoach = (fx: Fixture) => vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(fx.coachId) } as never);

  beforeAll(async () => {
    // Nunca contra producción: el arnés apunta la app a TEST_DATABASE_URL y su
    // guarda rechaza el host de main, pero esta suite escribe, así que se comprueba dos veces.
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
    a = await makeCoachAndAthlete(sql);
    b = await makeCoachAndAthlete(sql);
    noRow = await makeCoachAndAthlete(sql);
  }, 60_000);

  afterAll(async () => {
    await sql`delete from coach_signal_thresholds where coach_id in (${a.coachId}, ${b.coachId}, ${noRow.coachId})`;
    await a.cleanup();
    await b.cleanup();
    await noRow.cleanup();
    await closeTestSql();
  });

  test('la migración: cada clave del spec tiene su columna y su CHECK con los límites del spec', async () => {
    const cols = await sql<Array<{ column_name: string; data_type: string }>>`
      select column_name, data_type from information_schema.columns where table_name = 'coach_signal_thresholds'`;
    const type = new Map(cols.map((c) => [c.column_name, c.data_type]));
    expect(type.get('wrist_rpe_words')).toBe('ARRAY');

    await sql`insert into coach_signal_thresholds (coach_id) values (${a.coachId})`;
    const rejected = async (col: string, value: number) => {
      try {
        await sql.unsafe(`update coach_signal_thresholds set ${col} = ${value} where coach_id = ${a.coachId}`);
        return false;
      } catch (err) {
        expect((err as { code?: string }).code, `${col}=${value}`).toBe(PG_CHECK_VIOLATION);
        return true;
      }
    };
    for (const k of COACH_THRESHOLD_KEYS) {
      const s = COACH_THRESHOLD_SPEC[k];
      expect(type.get(k), k).toBe('smallint');
      expect(await rejected(k, s.min - 1), `${k} bajo el mínimo`).toBe(true);
      expect(await rejected(k, s.max + 1), `${k} sobre el máximo`).toBe(true);
      await sql.unsafe(`update coach_signal_thresholds set ${k} = ${s.min} where coach_id = ${a.coachId}`);
      await sql.unsafe(`update coach_signal_thresholds set ${k} = ${s.max} where coach_id = ${a.coachId}`);
      await sql.unsafe(`update coach_signal_thresholds set ${k} = null where coach_id = ${a.coachId}`);
    }
  }, 120_000);

  test('la migración: las palabras del RPE exigen once, sin nulos ni vacías', async () => {
    const set = (words: string[] | null) =>
      sql`update coach_signal_thresholds set wrist_rpe_words = ${words as never} where coach_id = ${a.coachId}`;
    const eleven = Array.from({ length: 11 }, (_, n) => `w${n}`);
    await set(eleven);
    await set(null);
    for (const bad of [eleven.slice(1), [...eleven, 'w11'], [...eleven.slice(0, 10), '']]) {
      await expect(set(bad)).rejects.toMatchObject({ code: PG_CHECK_VIOLATION });
    }
  });

  test('la migración es idempotente: volver a correr el fichero no rompe ni cambia nada', async () => {
    const file = readFileSync(resolve(__dirname, '../../../infra/migrations/0282_wrist_method.sql'), 'utf8');
    const before = await sql`select count(*)::int as n from pg_constraint where conrelid = 'coach_signal_thresholds'::regclass`;
    await sql.unsafe(file);
    const after = await sql`select count(*)::int as n from pg_constraint where conrelid = 'coach_signal_thresholds'::regclass`;
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  test('un coach que no ha tocado nada entrega al reloj los defectos de hoy (con y sin fila)', async () => {
    await sql`delete from coach_signal_thresholds where coach_id = ${a.coachId}`;
    // Sin fila.
    expect(await resolveAthleteWristMethod(BigInt(noRow.athleteId), sql)).toEqual(DEFAULT_METHOD);
    // Con fila y todo NULL (lo que deja «Usar el defecto» en cada campo).
    await sql`insert into coach_signal_thresholds (coach_id) values (${noRow.coachId})`;
    expect(await resolveAthleteWristMethod(BigInt(noRow.athleteId), sql)).toEqual(DEFAULT_METHOD);
    // Un atleta sin coach (o que no existe) tampoco se queda sin método.
    expect(await resolveAthleteWristMethod(BigInt(999_999_999), sql)).toEqual(DEFAULT_METHOD);
    expect(DEFAULT_METHOD.rpe_words).toEqual([...DEFAULT_WRIST_RPE_WORDS]);
  });

  test('PUT: lo del coach A llega a los atletas de A y a los de B no', async () => {
    asCoach(a);
    const words = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
    const res = await thresholdsRoute.PUT(put({ wrist_auto_lap_m: 500, wrist_gate_manual: 1, wrist_long_run_min: 90 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { custom_keys: string[]; wrist_auto_lap_m: number; defaults: Record<string, number> };
    expect(body.custom_keys.sort()).toEqual(['wrist_auto_lap_m', 'wrist_gate_manual', 'wrist_long_run_min']);
    expect(body.wrist_auto_lap_m).toBe(500);
    expect(body.defaults.wrist_auto_lap_m).toBe(1000);
    expect((await thresholdsRoute.PUT(put({ wrist_rpe_words: words }))).status).toBe(200);

    const mine = await resolveAthleteWristMethod(BigInt(a.athleteId), sql);
    expect(mine.auto_lap.every_m).toBe(500);
    expect(mine.run).toMatchObject({ gate: 'manual', long_run_s: 5400, long_run_m: 16_000 });
    expect(mine.rpe_words).toEqual(words);
    // Lo que A no tocó sigue siendo el defecto.
    expect(mine.alerts).toEqual(DEFAULT_METHOD.alerts);
    expect(mine.finish).toEqual(DEFAULT_METHOD.finish);

    // El atleta de B no ve nada de A.
    expect(await resolveAthleteWristMethod(BigInt(b.athleteId), sql)).toEqual(DEFAULT_METHOD);
    // Ni B lo lee ni lo edita: su GET sale con los defectos y su PUT no toca la fila de A.
    asCoach(b);
    const seenByB = (await (await thresholdsRoute.GET()).json()) as { custom_keys: string[]; wrist_auto_lap_m: number; wrist_rpe_words: string[] };
    expect(seenByB).toMatchObject({ custom_keys: [], wrist_auto_lap_m: 1000, wrist_rpe_words: [...DEFAULT_WRIST_RPE_WORDS] });
    expect((await thresholdsRoute.PUT(put({ wrist_auto_lap_m: 2000 }))).status).toBe(200);
    expect((await resolveAthleteWristMethod(BigInt(a.athleteId), sql)).auto_lap.every_m).toBe(500);
    expect((await resolveAthleteWristMethod(BigInt(b.athleteId), sql)).auto_lap.every_m).toBe(2000);
  }, 60_000);

  test('PUT: null vuelve al defecto, también en las palabras del RPE', async () => {
    asCoach(a);
    const res = (await (await thresholdsRoute.PUT(put({ wrist_auto_lap_m: null, wrist_rpe_words: null }))).json()) as {
      wrist_rpe_words_custom: boolean;
      custom_keys: string[];
    };
    expect(res.wrist_rpe_words_custom).toBe(false);
    expect(res.custom_keys).not.toContain('wrist_auto_lap_m');
    const mine = await resolveAthleteWristMethod(BigInt(a.athleteId), sql);
    expect(mine.auto_lap.every_m).toBe(1000);
    expect(mine.rpe_words).toEqual([...DEFAULT_WRIST_RPE_WORDS]);
  });

  test('PUT valida en servidor: fuera de rango, incoherente y palabras mal formadas se rechazan con 422', async () => {
    asCoach(a);
    expect((await thresholdsRoute.PUT(put({ wrist_gate_manual: 2 }))).status).toBe(422);
    expect((await thresholdsRoute.PUT(put({ wrist_rpe_words: ['solo', 'dos'] }))).status).toBe(422);
    const lap = await thresholdsRoute.PUT(put({ wrist_auto_lap_m: 50 }));
    expect(lap.status).toBe(422);
    expect(((await lap.json()) as { error: { message: string } }).error.message).toMatch(/vuelta automática/);
    const pre = await thresholdsRoute.PUT(put({ wrist_prewarn_s: 20 }));
    expect(pre.status).toBe(422);
    // Y nada de eso llegó a la fila.
    const [row] = await sql<Array<{ wrist_gate_manual: number | null; wrist_auto_lap_m: number | null; wrist_prewarn_s: number | null }>>`
      select wrist_gate_manual, wrist_auto_lap_m, wrist_prewarn_s from coach_signal_thresholds where coach_id = ${a.coachId}`;
    expect(row).toMatchObject({ wrist_gate_manual: 1, wrist_auto_lap_m: null, wrist_prewarn_s: null });
  });

  test('el detalle que lee el reloj lleva el método del coach del atleta; el del coach no lo lleva', async () => {
    const templateId = await makeTemplate({ fx: a, name: 'Rodaje del método', format: 'intervals' });
    const assignmentId = await makeAssignment({ fx: a, templateId, scheduledForIso: '2026-09-29' });
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue({
      athlete_id: BigInt(a.athleteId),
      user_id: BigInt(a.athleteUserId),
    } as never);
    const res = await detailRoute.GET(new Request('http://x', { headers: { authorization: 'Bearer t' } }), {
      params: Promise.resolve({ id: String(assignmentId) }),
    });
    expect(res.status).toBe(200);
    const detail = (await res.json()) as { wrist_method?: ReturnType<typeof buildWristMethod>; assignment: { id: string } };
    expect(detail.assignment.id).toBe(String(assignmentId));
    expect(detail.wrist_method).toEqual(await resolveAthleteWristMethod(BigInt(a.athleteId), sql));
    expect(detail.wrist_method!.run.gate).toBe('manual');

    // Quien lee sin resolver (los agregados del coach) recibe la respuesta de siempre, sin la clave.
    const plain = await loadAssignmentDetail({ sql, athlete_id: BigInt(a.athleteId), assignment_id: BigInt(assignmentId) });
    expect(plain).not.toBeNull();
    expect(plain).not.toHaveProperty('wrist_method');
  }, 60_000);
});
