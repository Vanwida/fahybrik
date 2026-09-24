/**
 * EL CUESTIONARIO DE ENTRADA NO SE PIERDE POR UNA RESPUESTA — POST
 * /api/onboarding/submit contra base de datos REAL (auditoría app atleta F-01).
 *
 * Antes: una respuesta fuera del esquema → 400 del cuestionario ENTERO (la app lo
 * descarta en silencio); y tres respuestas válidas o de salto daban 500 porque la
 * base las rechazaba al guardar (ningún día marcado «Programa» → 0 días; un 1RM de
 * 0 kg; «Triatlón»). Aquí se fija, con lo que la app instalada manda de verdad:
 *   · el deslizador «¿Cuánto depende de ti?» en 0 → se guarda 0;
 *   · saltar todos los pasos (los valores por defecto de la app) → alta guardada;
 *   · cada respuesta imposible se recorta o se descarta, el resto se guarda, y el
 *     coach lo lee en el alta como «respuestas fuera de rango»;
 *   · solo un cuerpo sin cuestionario es un 400.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { readOnboardingSnapshot } from '@/lib/athlete/onboarding-snapshot';

let session: { athlete_id: bigint; user_id: bigint; full_name: string } | null = null;
vi.mock('@/lib/auth/athlete-session', () => ({
  getAthleteSessionFromBearer: async () => session,
}));

const { POST } = await import('@/app/api/onboarding/submit/route');
const { loadIntakeProfile } = await import('@/lib/coach/intake');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/**
 * Lo que codifica `OnboardingState.snapshot()` si el atleta SALTA todos los pasos:
 * los opcionales nil no viajan; los no opcionales llevan el valor por defecto de la app.
 */
function appDefaults(): Record<string, unknown> {
  return {
    sleep_quality: 5,
    stress_level: 5,
    commitment_level: 7,
    injuries: [],
    availability: Object.fromEntries(WEEK.map((d) => [d, 'rest'])),
    session_minutes: 60,
    schedule_flexible: false,
    preferred_week: Object.fromEntries(WEEK.map((d) => [d, []])),
    equipment: [],
    has_track: false,
    has_flat_run: false,
    has_hr_belt: false,
    pct_depends_on_me: 5,
    races: [],
    hyrox_divisions: [],
    equipment_access: [],
    devices_owned: [],
    garmin_connected: false,
    healthkit_granted: false,
  };
}

function submit(snapshot: unknown): Request {
  return new Request('http://localhost/api/onboarding/submit', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify({ snapshot }),
  });
}

describe('readOnboardingSnapshot (puro)', () => {
  test('lo que manda la app al saltarlo todo se lee sin ninguna incidencia', () => {
    const read = readOnboardingSnapshot(appDefaults());
    expect(read?.issues).toEqual([]);
  });

  test('un número imposible se descarta (no se recorta al borde) y un texto largo se recorta', () => {
    const read = readOnboardingSnapshot({
      ...appDefaults(),
      height_cm: 300,
      goal_short: 'x'.repeat(4_100),
    });
    expect(read?.snapshot.height_cm).toBeUndefined();
    expect(read?.snapshot.goal_short).toHaveLength(4_000);
    expect(read?.issues).toEqual([
      { field: 'height_cm', value: 300, action: 'descartada' },
      { field: 'goal_short', value: `${'x'.repeat(80)}…`, action: 'recortada' },
    ]);
  });

  test('sin cuestionario (no es un objeto) no hay nada que leer', () => {
    expect(readOnboardingSnapshot(undefined)).toBeNull();
    expect(readOnboardingSnapshot([1, 2])).toBeNull();
  });
});

describeWithDb('POST /api/onboarding/submit — respuesta a respuesta (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    session = null;
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  async function athlete(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    session = { athlete_id: BigInt(fx.athleteId), user_id: BigInt(fx.athleteUserId), full_name: 'Test' };
    return fx;
  }

  const athleteRow = (id: number) => sql<
    Array<{
      onboarded_at: Date | null;
      pct_depends_on_me: number | null;
      training_days_per_week: number | null;
      height_cm: string | null;
      weight_kg: string | null;
      primary_discipline: string | null;
      goal_short: string | null;
      injuries_json: unknown;
      intake_notes_json: Record<string, unknown>;
    }>
  >`
    select onboarded_at, pct_depends_on_me, training_days_per_week, height_cm::text, weight_kg::text,
           primary_discipline::text as primary_discipline, goal_short, injuries_json, intake_notes_json
    from athletes where id = ${id}
  `;

  test('el deslizador «¿Cuánto depende de ti?» en «Nada» (0) se guarda como 0', async () => {
    const fx = await athlete();
    const res = await POST(submit({ ...appDefaults(), pct_depends_on_me: 0 }));
    expect(res.status).toBe(200);
    const [row] = await athleteRow(fx.athleteId);
    expect(row!.onboarded_at).not.toBeNull();
    expect(row!.pct_depends_on_me).toBe(0);
    expect(row!.intake_notes_json.onboarding_out_of_range).toEqual([]);
  });

  test('saltar todos los pasos: el alta se guarda (ningún día «Programa» ya no es un 500)', async () => {
    const fx = await athlete();
    const res = await POST(submit(appDefaults()));
    expect(res.status).toBe(200);
    const [row] = await athleteRow(fx.athleteId);
    expect(row!.onboarded_at).not.toBeNull();
    expect(row!.training_days_per_week).toBeNull();
  });

  test('«Triatlón» como disciplina y los días marcados se guardan', async () => {
    const fx = await athlete();
    const availability = Object.fromEntries(WEEK.map((d, i) => [d, i < 4 ? 'program' : 'rest']));
    const res = await POST(submit({ ...appDefaults(), primary_discipline: 'triathlon', availability }));
    expect(res.status).toBe(200);
    const [row] = await athleteRow(fx.athleteId);
    expect(row!.primary_discipline).toBe('triathlon');
    expect(row!.training_days_per_week).toBe(4);
  });

  test('cada respuesta imposible se recorta o se descarta; el resto se guarda; el coach lo lee', async () => {
    const fx = await athlete();
    const res = await POST(
      submit({
        ...appDefaults(),
        height_cm: 300, // IntRow sin tope
        weight_kg: 72.5,
        one_rm_back_squat_kg: 0, // «0» tecleado: no es un 1RM (y la base exige > 0)
        one_rm_deadlift_kg: 180,
        time_5k_seconds: 999 * 60, // «999:00» en mm:ss
        time_10k_seconds: 45 * 60,
        strict_pull_ups_max: 12,
        max_hr_bpm: 250,
        goal_short: 'g'.repeat(4_100),
        full_name: 'Ana',
        injuries: [
          { area: 'rodilla', type: 't'.repeat(200), active: true },
          { area: 'hombro', type: 'tendinitis', active: false },
        ],
        races: [
          {
            name: 'HYROX Madrid',
            event_type: 'hyrox',
            format: 'singles',
            division: 'open',
            gender_category: 'women',
            priority: 'target',
            race_date: '2027-03-20',
            goal_time_seconds: 999_999,
          },
        ],
        station_farmer_carry_kg: 80, // no modelado: se guarda acotado en las notas
        weird_nested: { a: 1 }, // no modelado y anidado: fuera
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.out_of_range).toEqual(
      expect.arrayContaining(['height_cm', 'one_rm_back_squat_kg', 'time_5k_seconds', 'max_hr_bpm', 'goal_short']),
    );

    const [row] = await athleteRow(fx.athleteId);
    expect(row!.height_cm).toBeNull();
    expect(Number(row!.weight_kg)).toBe(72.5);
    expect(row!.goal_short).toHaveLength(4_000);
    expect((row!.injuries_json as Array<{ area: string; type: string }>).map((i) => [i.area, i.type.length])).toEqual([
      ['rodilla', 80],
      ['hombro', 10],
    ]);
    const notes = row!.intake_notes_json;
    expect((notes.onboarding as Record<string, unknown>).station_farmer_carry_kg).toBe(80);
    expect((notes.onboarding as Record<string, unknown>).weird_nested).toBeUndefined();

    // Las marcas válidas se guardan; las imposibles, no.
    const benches = await sql<Array<{ exercise_slug: string; value: string }>>`
      select exercise_slug, value::text from athlete_benchmarks
      where athlete_id = ${fx.athleteId} and source = 'onboarding' order by exercise_slug
    `;
    const slugs = benches.map((b) => b.exercise_slug);
    expect(slugs).toContain('deadlift_1rm');
    expect(slugs).toContain('run_10k');
    expect(slugs).not.toContain('back_squat_1rm');
    expect(slugs).not.toContain('run_5k');

    // La carrera se queda, sin el tiempo objetivo imposible.
    const races = await sql<Array<{ name: string; goal_time_seconds: number | null }>>`
      select name, goal_time_seconds from races where athlete_id = ${fx.athleteId}
    `;
    expect(races).toEqual([{ name: 'HYROX Madrid', goal_time_seconds: null }]);

    // El coach lo lee en el alta, con lo que llegó.
    const profile = await loadIntakeProfile({ athlete_id: fx.athleteId, coach_id: fx.coachId, client: sql });
    const warning = profile.warnings.find((w) => w.kind === 'answers_out_of_range');
    expect(warning).toBeDefined();
    expect(warning!.detail).toContain('Altura (300)');
    expect(warning!.detail).toContain('Back squat (1RM) (0)');
    expect(warning!.detail).toContain('5K (16:39:00)');
    expect(warning!.detail).toContain('FC máxima (250)');
    expect(warning!.detail).toContain('Tiempo objetivo de la carrera (277:46:39)');
    expect(warning!.detail).toMatch(/Se guardaron recortadas: .*Objetivo a corto plazo/);
    expect(warning!.detail).toMatch(/Se guardaron recortadas: .*Lesión/);
  });

  test('un reenvío limpio borra las incidencias de antes', async () => {
    const fx = await athlete();
    expect((await POST(submit({ ...appDefaults(), height_cm: 300 }))).status).toBe(200);
    expect((await POST(submit({ ...appDefaults(), height_cm: 180 }))).status).toBe(200);
    const [row] = await athleteRow(fx.athleteId);
    expect(row!.intake_notes_json.onboarding_out_of_range).toEqual([]);
    expect(Number(row!.height_cm)).toBe(180);
  });

  test('solo un cuerpo sin cuestionario es un 400', async () => {
    await athlete();
    const bad = new Request('http://localhost/api/onboarding/submit', {
      method: 'POST',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      body: JSON.stringify({ nope: true }),
    });
    expect((await POST(bad)).status).toBe(400);
  });
});
